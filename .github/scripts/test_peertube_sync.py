import importlib.util
import json
import os
import pathlib
import unittest
import urllib.parse

os.environ.update(PEERTUBE_URL="https://pt.example", TYPESENSE_URL="https://ts.example", TYPESENSE_VIDEOS_KEY="k", VIDEO_CHUNKS="on")
spec = importlib.util.spec_from_file_location("peertube_sync", pathlib.Path(__file__).with_name("peertube_sync.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

VTT = """WEBVTT
Kind: captions
Language: en

1
00:00:01.000 --> 00:00:03.000
Hello <c>there</c>

2
00:00:03.000 --> 00:00:05.000
Hello there

3
00:01:02.500 --> 00:01:05.000
Second line
"""


def video(uuid, **extra):
    return {"uuid": uuid, "shortUUID": "short" + uuid, "name": "Title " + uuid, "duration": 90, "thumbnailPath": "/t.jpg",
            "publishedAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
            "category": {"id": 1, "label": "Edu"}, "language": {"id": "en"}, **extra}


def caption(lang, path="/c/x.vtt"):
    return {"language": {"id": lang}, "captionPath": path, "updatedAt": "2026-01-03T00:00:00.000Z"}


class CueTest(unittest.TestCase):
    def test_seconds(self):
        self.assertEqual(sync.seconds("00:01:02.500"), 62)
        self.assertEqual(sync.seconds("01:02.500"), 62)
        self.assertEqual(sync.seconds("01:00:00.000"), 3600)

    def test_cues_keep_the_start_second_and_drop_repeats(self):
        self.assertEqual(sync.vtt_cues(VTT), [(1, "Hello there"), (62, "Second line")])

    def test_whole_transcript_text_is_as_before(self):
        self.assertEqual(sync.vtt_text(VTT), "Hello there Second line")


class ChunkTest(unittest.TestCase):
    def test_cues_group_up_to_the_size_and_start_at_their_first_cue(self):
        cues = [(i * 10, "x" * 500) for i in range(5)]
        self.assertEqual([at for at, _ in sync.chunks(cues, 1200)], [0, 20, 40])

    def test_a_track_is_capped(self):
        cues = [(i, "x" * 1300) for i in range(sync.MAX_CHUNKS + 50)]
        self.assertEqual(len(sync.chunks(cues)), sync.MAX_CHUNKS)

    def test_no_cues_no_chunks(self):
        self.assertEqual(sync.chunks([]), [])


class DocTest(unittest.TestCase):
    def setUp(self):
        self.real = sync.request
        sync.request = lambda *a, **k: VTT

    def tearDown(self):
        sync.request = self.real

    def test_one_document_per_chunk_of_each_caption_track(self):
        docs = sync.chunk_docs(video("u1"), [caption("en"), caption("es", "/c/y.vtt")])
        self.assertEqual([d["id"] for d in docs], ["u1-en-0", "u1-es-0"])
        first = docs[0]
        self.assertEqual((first["video_id"], first["start"], first["language"]), ("u1", 1, "en"))
        self.assertEqual(first["description"], "Hello there Second line")
        self.assertEqual(first["title"], "Title u1")
        self.assertTrue(first["url"].endswith("/w/shortu1?start=1"))
        self.assertNotIn("summary", first)
        self.assertEqual(first["transcript"], "")

    def test_the_video_document_names_its_video(self):
        self.assertEqual(sync.to_doc(video("u1"), [], "")["video_id"], "u1")

    def test_a_video_without_captions_has_no_chunks(self):
        self.assertEqual(sync.chunk_docs(video("u1"), []), [])


class FakeInstance:
    # PeerTube and Typesense in memory: records every write, answers the reads.
    def __init__(self, export):
        self.export, self.imports, self.deletes = export, [], []

    def __call__(self, method, url, body=None, typesense=False, headers=None):
        if method == "GET" and "/documents/export" in url:
            return "\n".join(json.dumps(r) for r in self.export)
        if method == "GET":
            return VTT
        if method == "POST":
            docs = [json.loads(line) for line in body.decode().split("\n")]
            self.imports.append((url.split("action=")[1], docs))
            return "\n".join('{"success":true}' for _ in docs)
        if method == "DELETE":
            self.deletes.append(urllib.parse.unquote(url.split("filter_by=")[1]))
        return "{}"


class MainTest(unittest.TestCase):
    def setUp(self):
        self.saved = (sync.request, sync.public_videos, sync.captions_of)

    def tearDown(self):
        sync.request, sync.public_videos, sync.captions_of = self.saved

    def test_first_run_adds_chunks_without_touching_summaries_and_ignores_chunk_rows(self):
        a, b = video("a"), video("b")
        caps = [caption("en")]
        stale = {"id": "gone", "video_id": "gone", "chunks": 2, "updated": "x"}
        export = [
            {"id": "a", "updated": sync.stamp(a, caps), "summary_by": "m#3"},
            {"id": "a-en-0", "video_id": "a", "updated": "x"},
            stale,
        ]
        fake = FakeInstance(export)
        sync.request, sync.public_videos, sync.captions_of = fake, (lambda: iter([a, b])), (lambda v: caps)
        sync.main()
        by_action = {action: docs for action, docs in fake.imports}
        ids = lambda docs: sorted(d["id"] for d in docs)
        # one import per action, in the order: chunks, new documents, patches
        self.assertEqual([action for action, _ in fake.imports], ["upsert", "upsert", "update"])
        self.assertEqual(ids(fake.imports[0][1]), ["a-en-0", "b-en-0"])
        self.assertEqual(ids(fake.imports[1][1]), ["b"])
        self.assertEqual(fake.imports[1][1][0]["chunks"], 1)
        self.assertEqual(fake.imports[2][1], [{"id": "a", "video_id": "a", "chunks": 1}])
        # chunks of a, b and the removed video are cleared first, the removed video's own document goes by id
        self.assertIn("video_id:[a,b,gone] && start:>=0", fake.deletes)
        self.assertIn("id:[gone]", fake.deletes)

    def test_switched_off_it_syncs_as_before_and_writes_no_chunk_fields(self):
        a, b = video("a"), video("b")
        caps = [caption("en")]
        fake = FakeInstance([{"id": "a", "updated": sync.stamp(a, caps)}])
        sync.request, sync.public_videos, sync.captions_of = fake, (lambda: iter([a, b])), (lambda v: caps)
        sync.CHUNKS = False
        try:
            sync.main()
        finally:
            sync.CHUNKS = True
        self.assertEqual([(action, [d["id"] for d in docs]) for action, docs in fake.imports], [("upsert", ["b"])])
        self.assertNotIn("chunks", fake.imports[0][1][0])
        self.assertEqual(fake.deletes, [])

    def test_imports_are_split_so_embedding_fits_the_timeout(self):
        fake = FakeInstance([])
        sync.request = fake
        sync.import_docs([{"id": str(i)} for i in range(250)])
        self.assertEqual([len(docs) for _, docs in fake.imports], [100, 100, 50])

    def test_a_second_run_with_nothing_new_writes_nothing(self):
        a = video("a")
        caps = [caption("en")]
        export = [{"id": "a", "video_id": "a", "chunks": 1, "updated": sync.stamp(a, caps)}, {"id": "a-en-0", "video_id": "a", "updated": "x"}]
        fake = FakeInstance(export)
        sync.request, sync.public_videos, sync.captions_of = fake, (lambda: iter([a])), (lambda v: caps)
        sync.main()
        self.assertEqual(fake.imports, [])
        self.assertEqual(fake.deletes, [])


class TranslateTest(unittest.TestCase):
    def setUp(self):
        self.saved = (sync.request, sync.public_videos, sync.captions_of, sync.llm, sync.upload_caption, sync.peertube_token, sync.LOCALIZE, sync.TRANSLATE_MAX, sync.CHUNKS)
        sync.LOCALIZE, sync.TRANSLATE_MAX, sync.CHUNKS = True, 1, False

    def tearDown(self):
        (sync.request, sync.public_videos, sync.captions_of, sync.llm, sync.upload_caption, sync.peertube_token, sync.LOCALIZE, sync.TRANSLATE_MAX, sync.CHUNKS) = self.saved

    @staticmethod
    def answer(system, text, *rest):
        if system.startswith("Translate this video's"):
            return 'Sure: {"title": "Título", "description": "Texto"}'
        return "\n".join(line.split("|")[0] + "|<b>uno</b> --> dos" for line in text.splitlines())

    def test_a_track_keeps_its_timings_and_loses_markup(self):
        sync.llm = self.answer
        vtt = sync.translate_vtt(VTT, "es")
        self.assertIn("00:00:01.000 --> 00:00:03.000\nuno → dos\n", vtt)
        self.assertIn("00:01:02.500 --> 00:01:05.000\nuno → dos\n", vtt)
        self.assertTrue(vtt.startswith("WEBVTT"))

    def test_a_lost_line_fails_instead_of_shifting_the_captions(self):
        sync.llm = lambda *a: "0|solo una"
        with self.assertRaises(ValueError):
            sync.translate_lines(["one", "two"], "es")

    def test_a_video_gets_a_document_and_a_track_per_language_within_the_budget(self):
        a, b = video("a"), video("b")
        uploads = []
        caps = {"a": [caption("en")], "b": [caption("en")]}
        def captions(v):
            return caps[v["uuid"]]
        def upload(uuid, language, vtt, token):
            uploads.append((uuid, language))
            caps[uuid] = caps[uuid] + [caption(language)]
        fake = FakeInstance([])
        sync.request, sync.public_videos, sync.captions_of = fake, (lambda: iter([a, b])), captions
        sync.llm, sync.upload_caption, sync.peertube_token = self.answer, upload, (lambda: "t")
        sync.main()
        self.assertEqual(uploads, [("a", "es")])
        docs = {d["id"]: d for _, batch in fake.imports for d in batch}
        self.assertEqual((docs["a"]["language"], docs["a"]["title"]), ("es", "Título"))
        self.assertEqual((docs["a-en"]["language"], docs["a-en"]["title"], docs["a-en"]["video_id"]), ("en", "Title a", "a"))
        # over budget: as it is, translated on a later run
        self.assertEqual(docs["b"]["language"], "en")
        self.assertNotIn("b-en", docs)

    def test_translated_videos_are_left_alone_and_their_english_document_is_kept(self):
        a = video("a")
        caps = [caption("en"), caption("es")]
        now = sync.stamp(a, caps)
        fake = FakeInstance([{"id": "a", "video_id": "a", "updated": now, "language": "es"},
                             {"id": "a-en", "video_id": "a", "updated": now, "language": "en"}])
        sync.request, sync.public_videos, sync.captions_of = fake, (lambda: iter([a])), (lambda v: caps)
        sync.llm, sync.peertube_token = self.answer, (lambda: "t")
        sync.main()
        self.assertEqual(fake.imports, [])
        self.assertEqual(fake.deletes, [])


if __name__ == "__main__":
    unittest.main()
