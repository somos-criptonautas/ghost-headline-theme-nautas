#!/usr/bin/env python3
"""Mirror the PeerTube instance's public videos into the Typesense `videos`
collection that the site search reads. Run by sync-peertube.yml.

One document per video: title, description, category and the text of its
captions (WebVTT without the timings), plus one document per chunk of each
caption track, with the second it starts at, so a search can open the video
at the moment that matched. Only what changed is sent, and a
video's captions are downloaded only when the video or one of its captions
changed - each run otherwise costs one small JSON request per video.

Env: PEERTUBE_URL, TYPESENSE_URL, TYPESENSE_VIDEOS_KEY (documents:* on the
videos collection only), optional TYPESENSE_VIDEOS_COLLECTION. Caption chunks
only with VIDEO_CHUNKS set, once the collection has their fields.

AI summaries, the search's snippet for a video: with LLM_URL (an
OpenAI-compatible base such as LiteLLM's, ending in /v1), LLM_KEY and
LLM_MODEL set, each video without a summary from that model gets one, written
from its title, description and captions. Switching LLM_MODEL rewrites them
all, LLM_MAX per run (default 60), newest first. A video with only a title
gets none (the model could only guess); new captions bring it back to the queue.

COMPARE_MODELS (a comma list, from the workflow's "compare" input): no sync -
the newest videos with enough text summed up by LLM_MODEL and each listed
model, side by side in the run's summary. Nothing is written.
"""
import json
import os
from datetime import datetime
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PEERTUBE = os.environ["PEERTUBE_URL"].rstrip("/")
TYPESENSE = os.environ["TYPESENSE_URL"].rstrip("/")
KEY = os.environ["TYPESENSE_VIDEOS_KEY"]
COLLECTION = os.environ.get("TYPESENSE_VIDEOS_COLLECTION") or "videos"
# Off until the collection has the video_id, start and chunks fields (README, search).
CHUNKS = bool(os.environ.get("VIDEO_CHUNKS"))

# Captions past this add cost and little recall.
MAX_TRANSCRIPT = 30000
# Caption chunks: the unit of semantic search. About a paragraph, so a match points at a moment.
CHUNK_CHARS = 1200
# Per caption track; a three-hour talk is about 130 chunks.
MAX_CHUNKS = 300
MAX_BODY_BYTES = 900_000
# Typesense embeds each document during the import; more per request risks the 120 s timeout.
MAX_DOCS = 100
# Cloudflare answers urllib's default User-Agent with 403.
UA = "nautas-peertube-sync"
LLM_URL = (os.environ.get("LLM_URL") or "").rstrip("/")
LLM_KEY = os.environ.get("LLM_KEY") or ""
LLM_MODEL = os.environ.get("LLM_MODEL") or ""
LLM_MAX = int(os.environ.get("LLM_MAX") or 60)
# Bumped when the prompt changes, so every summary is written again.
PROMPT_VERSION = "3"
SUMMARY_BY = f"{LLM_MODEL}#{PROMPT_VERSION}"
PROMPT = (
    "Resumí en español de qué trata este video, para mostrarlo como resultado de "
    "búsqueda: una o dos frases, hasta 280 caracteres. Empezá directo por el tema, "
    "sin presentar el video (nada de \"Este video\", \"El video\", \"Explica\" ni "
    "\"Se trata de\"). Solo lo que dicen el título, la descripción y la "
    "transcripción: nada inventado, sin enlaces, sin emojis. Respondé solo con el texto."
)
# Less text than this in the description and captions together: no summary.
MIN_MATERIAL = 80
COMPARE = [m.strip() for m in (os.environ.get("COMPARE_MODELS") or "").split(",") if m.strip()]
COMPARE_VIDEOS = 5
TIMING = re.compile(r"^\d{2}:\d{2}[:.\d]* --> ")
TAG = re.compile(r"<[^>]+>")


def request(method, url, body=None, typesense=False, headers=None):
    headers = {"User-Agent": UA, "Accept": "application/json", **(headers or {})}
    if typesense:
        headers["X-TYPESENSE-API-KEY"] = KEY
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return res.read().decode()
        except urllib.error.HTTPError as error:
            # PeerTube's API rate limit (429): wait as long as it asks.
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(int(error.headers.get("Retry-After") or 0) or 10)


def get(path):
    return json.loads(request("GET", PEERTUBE + path))


def public_videos():
    # Anonymous listing: public videos only, the instance's own.
    start = 0
    while True:
        page = get(f"/api/v1/videos?isLocal=true&nsfw=false&count=100&start={start}&sort=-publishedAt")
        yield from page["data"]
        start += 100
        if start >= page["total"]:
            return


def seconds(stamp):
    total = 0.0
    for part in stamp.replace(",", ".").split(":"):
        total = total * 60 + float(part)
    return int(total)


def vtt_cues(vtt):
    # (start second, text) per cue.
    cues, start = [], 0
    for line in vtt.splitlines():
        line = line.strip()
        if TIMING.match(line):
            start = seconds(line.split("-->")[0].strip())
            continue
        if not line or line == "WEBVTT" or line.isdigit() or line.startswith(("Kind:", "Language:", "NOTE")):
            continue
        line = TAG.sub("", line)
        # Auto captions repeat each line as the next cue rolls in.
        if not cues or cues[-1][1] != line:
            cues.append((start, line))
    return cues


def vtt_text(vtt):
    return " ".join(text for _, text in vtt_cues(vtt))


def chunks(cues, size=CHUNK_CHARS):
    # Consecutive cues up to `size` characters; each chunk starts at its first cue's second.
    out, start, text = [], 0, ""
    for at, line in cues:
        if text and len(text) + 1 + len(line) > size:
            out.append((start, text))
            text = ""
        if not text:
            start = at
        text = (text + " " + line).strip()
    if text:
        out.append((start, text))
    return out[:MAX_CHUNKS]


def captions_of(video):
    return get(f"/api/v1/videos/{video['uuid']}/captions").get("data") or []


def transcript(captions, language):
    # The video's own language first, else every caption it has.
    own = [c for c in captions if (c.get("language") or {}).get("id") == language] or captions
    text = []
    for caption in own:
        path = caption.get("captionPath") or ""
        if path.startswith("/"):
            text.append(vtt_text(request("GET", PEERTUBE + path)))
    return " ".join(text)[:MAX_TRANSCRIPT]


def to_doc(video, captions, text):
    category = (video.get("category") or {}).get("label") or ""
    return {
        "id": video["uuid"],
        "video_id": video["uuid"],
        "url": f"{PEERTUBE}/w/{video.get('shortUUID') or video['uuid']}",
        "title": video.get("name") or "",
        "description": (video.get("description") or "")[:5000],
        "transcript": text,
        "category": category if (video.get("category") or {}).get("id") else "",
        "language": (video.get("language") or {}).get("id") or "",
        "image": PEERTUBE + video["thumbnailPath"] if str(video.get("thumbnailPath") or "").startswith("/") else "",
        "duration": int(video.get("duration") or 0),
        "published": to_epoch(video.get("publishedAt")),
        "has_captions": bool(captions),
        "updated": stamp(video, captions),
    }


def to_epoch(iso):
    try:
        return int(datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return 0


def stamp(video, captions):
    return max([video.get("updatedAt") or ""] + [c.get("updatedAt") or "" for c in captions])


def chunk_docs(video, captions):
    # One document per chunk of each caption track, in the same collection as the video's own.
    base = to_doc(video, captions, "")
    docs = []
    for caption in captions:
        path = caption.get("captionPath") or ""
        if not path.startswith("/"):
            continue
        language = (caption.get("language") or {}).get("id") or ""
        for n, (at, text) in enumerate(chunks(vtt_cues(request("GET", PEERTUBE + path)))):
            docs.append({
                **base,
                "id": f"{video['uuid']}-{language}-{n}",
                "language": language,
                "start": at,
                # What is said at that moment goes where the embedding reads, next to the title.
                "description": text,
                "url": base["url"] + (f"?start={at}" if at else ""),
            })
    return docs


def existing():
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    body = request("GET", f"{base}/export?include_fields=id,video_id,chunks,updated,summary_by", typesense=True)
    rows = map(json.loads, filter(None, body.splitlines()))
    # Caption chunks share the collection; only the videos' own documents are tracked here.
    return {row["id"]: row for row in rows if row.get("video_id", row["id"]) == row["id"]}


def import_docs(docs, action="upsert"):
    url = f"{TYPESENSE}/collections/{COLLECTION}/documents/import?action={action}"
    lines = [json.dumps(d, ensure_ascii=False).encode() for d in docs]
    chunk, size = [], 0
    for line in lines + [None]:
        if line is None or (chunk and (size + len(line) > MAX_BODY_BYTES or len(chunk) >= MAX_DOCS)):
            if chunk:
                out = request("POST", url, b"\n".join(chunk), typesense=True)
                # Only the error: Typesense echoes the whole document, which
                # would put titles and captions in the public Actions log.
                failed = [r.get("error") for r in map(json.loads, out.splitlines()) if not r.get("success")]
                if failed:
                    sys.exit(f"import failed ({len(failed)}): {failed[:3]}")
            chunk, size = [], 0
        if line is not None:
            chunk.append(line)
            size += len(line) + 1


def delete_docs(ids):
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    for i in range(0, len(ids), 100):
        filter_by = urllib.parse.quote(f"id:[{','.join(ids[i:i + 100])}]")
        request("DELETE", f"{base}?filter_by={filter_by}", typesense=True)


def delete_chunks(ids):
    # Chunks carry `start`; a video's own document does not.
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    for i in range(0, len(ids), 50):
        filter_by = urllib.parse.quote(f"video_id:[{','.join(ids[i:i + 50])}] && start:>=0")
        request("DELETE", f"{base}?filter_by={filter_by}", typesense=True)


def material(doc):
    return len((doc.get("description") or "").strip()) + len((doc.get("transcript") or "").strip())


def summarize(doc, model=LLM_MODEL):
    text = f"Título: {doc['title']}\n\nDescripción: {doc['description'][:3000]}\n\nTranscripción: {doc['transcript'][:12000]}"
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": text}],
        "temperature": 0.3,
        # Room for models that reason before answering: at 200 some came back empty.
        "max_tokens": 1000,
    }).encode()
    out = json.loads(request("POST", f"{LLM_URL}/chat/completions", body, headers={
        "Authorization": f"Bearer {LLM_KEY}", "Content-Type": "application/json"}))
    return " ".join((out["choices"][0]["message"]["content"] or "").split())[:400]


def summaries(order, have):
    """Summaries for the videos without one from this model, newest first."""
    todo = [id_ for id_ in order if have.get(id_, {}).get("summary_by") != SUMMARY_BY][:LLM_MAX]
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    done, failed = [], 0
    for id_ in todo:
        try:
            doc = json.loads(request("GET", f"{base}/{id_}?exclude_fields=embedding", typesense=True))
            text = summarize(doc) if material(doc) >= MIN_MATERIAL else ""
            if material(doc) >= MIN_MATERIAL and not text:
                raise ValueError("empty answer")
        except (urllib.error.URLError, KeyError, IndexError, ValueError) as error:
            # Only the kind of error: the response could echo the captions into the public log.
            failed += 1
            print(f"summary failed: {type(error).__name__} {getattr(error, 'code', '')}")
            continue
        # Empty for a title-only video: clears an old summary and marks it as
        # seen by this model, so it is not asked again. An empty answer to a
        # video with text is a failure above, retried on the next run.
        done.append({"id": id_, "summary": text, "summary_by": SUMMARY_BY})
    import_docs(done, action="update")
    written = sum(1 for d in done if d["summary"])
    print(f"{written} summaries by {LLM_MODEL}, {failed} failed, {len(done) - written} without enough text")


def compare():
    """The newest videos with enough text, summed up by each model; writes nothing."""
    models = ([LLM_MODEL] if LLM_MODEL and LLM_MODEL not in COMPARE else []) + COMPARE
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    report = [f"Modelos: {', '.join(models)}", ""]
    picked = 0
    for video in public_videos():
        try:
            doc = json.loads(request("GET", f"{base}/{video['uuid']}?exclude_fields=embedding", typesense=True))
        except urllib.error.HTTPError:
            continue  # not mirrored yet
        if material(doc) < MIN_MATERIAL:
            continue
        report.append(f"### {doc['title']}")
        for model in models:
            try:
                text = summarize(doc, model) or "(vacío)"
            except (urllib.error.URLError, KeyError, IndexError, ValueError) as error:
                text = f"(falló: {type(error).__name__} {getattr(error, 'code', '')})"
            report.append(f"- **{model}** ({len(text)}): {text}")
        report.append("")
        picked += 1
        if picked == COMPARE_VIDEOS:
            break
    text = "\n".join(report)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write(text + "\n")


def main():
    if COMPARE:
        return compare()
    have = existing()
    seen, order, changed, patches, stale, fresh_chunks = set(), [], [], [], [], []
    for video in public_videos():
        uuid = video["uuid"]
        seen.add(uuid)
        order.append(uuid)
        captions = captions_of(video)
        row = have.get(uuid, {})
        unchanged = row.get("updated") == stamp(video, captions)
        if unchanged and (not CHUNKS or row.get("chunks") is not None):
            continue
        made = chunk_docs(video, captions) if CHUNKS else []
        if CHUNKS:
            stale.append(uuid)
            fresh_chunks.extend(made)
        if unchanged:
            # Only the chunks are missing: patch the document so its summary stays.
            patches.append({"id": uuid, "video_id": uuid, "chunks": len(made)})
            continue
        # An upsert replaces the document, summary included: write it again.
        have.pop(uuid, None)
        language = (video.get("language") or {}).get("id") or ""
        doc = to_doc(video, captions, transcript(captions, language))
        if CHUNKS:
            doc["chunks"] = len(made)
        changed.append(doc)

    # An empty answer (instance down) must not read as "everything was
    # removed" and wipe the collection.
    if not seen and have:
        sys.exit("PeerTube returned no videos; leaving the collection as is")

    gone = [id_ for id_ in have if id_ not in seen]
    if CHUNKS:
        delete_chunks(stale + gone)
        import_docs(fresh_chunks)
    import_docs(changed)
    import_docs(patches, action="update")
    delete_docs(gone)
    print(f"{len(seen)} public videos, {len(changed)} upserted, {len(gone)} deleted")
    if LLM_URL and LLM_KEY and LLM_MODEL:
        summaries(order, have)


if __name__ == "__main__":
    main()
