#!/usr/bin/env python3
"""Mirror the PeerTube instance's public videos into the Typesense `videos`
collection that the site search reads. Run by sync-peertube.yml.

One document per video: title, description, category and the text of its
captions (WebVTT without the timings). Only what changed is sent, and a
video's captions are downloaded only when the video or one of its captions
changed - each run otherwise costs one small JSON request per video.

Env: PEERTUBE_URL, TYPESENSE_URL, TYPESENSE_VIDEOS_KEY (documents:* on the
videos collection only), optional TYPESENSE_VIDEOS_COLLECTION.

AI summaries, the search's snippet for a video: with LLM_URL (an
OpenAI-compatible base such as LiteLLM's, ending in /v1), LLM_KEY and
LLM_MODEL set, each video without a summary from that model gets one, written
from its title, description and captions. Switching LLM_MODEL rewrites them
all, LLM_MAX per run (default 60), newest first. A video with only a title
gets none (the model could only guess); new captions bring it back to the queue.
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

# Captions past this add cost and little recall.
MAX_TRANSCRIPT = 30000
MAX_BODY_BYTES = 900_000
# Cloudflare answers urllib's default User-Agent with 403.
UA = "nautas-peertube-sync"
LLM_URL = (os.environ.get("LLM_URL") or "").rstrip("/")
LLM_KEY = os.environ.get("LLM_KEY") or ""
LLM_MODEL = os.environ.get("LLM_MODEL") or ""
LLM_MAX = int(os.environ.get("LLM_MAX") or 60)
# Bumped when the prompt changes, so every summary is written again.
PROMPT_VERSION = "2"
SUMMARY_BY = f"{LLM_MODEL}#{PROMPT_VERSION}"
PROMPT = (
    "Escribí en español, en dos frases y menos de 280 caracteres, de qué trata "
    "este video, para mostrarlo como resultado de búsqueda. Solo lo que dicen el "
    "título, la descripción y la transcripción: nada inventado, sin enlaces, sin "
    "emojis, sin \"este video\" al empezar. Respondé solo con el texto."
)
# Less text than this in the description and captions together: no summary.
MIN_MATERIAL = 80
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


def vtt_text(vtt):
    lines = []
    for line in vtt.splitlines():
        line = line.strip()
        if not line or line == "WEBVTT" or TIMING.match(line) or line.isdigit() or line.startswith(("Kind:", "Language:", "NOTE")):
            continue
        line = TAG.sub("", line)
        # Auto captions repeat each line as the next cue rolls in.
        if not lines or lines[-1] != line:
            lines.append(line)
    return " ".join(lines)


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


def existing():
    base = f"{TYPESENSE}/collections/{COLLECTION}/documents"
    body = request("GET", f"{base}/export?include_fields=id,updated,summary_by", typesense=True)
    return {row["id"]: row for row in map(json.loads, filter(None, body.splitlines()))}


def import_docs(docs, action="upsert"):
    url = f"{TYPESENSE}/collections/{COLLECTION}/documents/import?action={action}"
    lines = [json.dumps(d, ensure_ascii=False).encode() for d in docs]
    chunk, size = [], 0
    for line in lines + [None]:
        if line is None or (chunk and size + len(line) > MAX_BODY_BYTES):
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


def summarize(doc):
    text = f"Título: {doc['title']}\n\nDescripción: {doc['description'][:3000]}\n\nTranscripción: {doc['transcript'][:12000]}"
    body = json.dumps({
        "model": LLM_MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": text}],
        "temperature": 0.3,
        "max_tokens": 200,
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
            material = len((doc.get("description") or "").strip()) + len((doc.get("transcript") or "").strip())
            text = summarize(doc) if material >= MIN_MATERIAL else ""
        except (urllib.error.URLError, KeyError, IndexError, ValueError) as error:
            # Only the kind of error: the response could echo the captions into the public log.
            failed += 1
            print(f"summary failed: {type(error).__name__} {getattr(error, 'code', '')}")
            continue
        # Empty too (title only, or an empty answer): clears an old summary and
        # marks the video as seen by this model, so it is not asked again.
        done.append({"id": id_, "summary": text, "summary_by": SUMMARY_BY})
    import_docs(done, action="update")
    written = sum(1 for d in done if d["summary"])
    print(f"{written} summaries by {LLM_MODEL}, {failed} failed, {len(done) - written} without enough text")


def main():
    have = existing()
    seen, order, changed = set(), [], []
    for video in public_videos():
        seen.add(video["uuid"])
        order.append(video["uuid"])
        captions = captions_of(video)
        if have.get(video["uuid"], {}).get("updated") == stamp(video, captions):
            continue
        # An upsert replaces the document, summary included: write it again.
        have.pop(video["uuid"], None)
        language = (video.get("language") or {}).get("id") or ""
        changed.append(to_doc(video, captions, transcript(captions, language)))

    # An empty answer (instance down) must not read as "everything was
    # removed" and wipe the collection.
    if not seen and have:
        sys.exit("PeerTube returned no videos; leaving the collection as is")

    gone = [id_ for id_ in have if id_ not in seen]
    import_docs(changed)
    delete_docs(gone)
    print(f"{len(seen)} public videos, {len(changed)} upserted, {len(gone)} deleted")
    if LLM_URL and LLM_KEY and LLM_MODEL:
        summaries(order, have)


if __name__ == "__main__":
    main()
