#!/usr/bin/env python3
"""Mirror the PeerTube instance's public videos into the Typesense `videos`
collection that the site search reads. Run by sync-peertube.yml.

One document per video: title, description, category and the text of its
captions (WebVTT without the timings). Only what changed is sent, and a
video's captions are downloaded only when the video or one of its captions
changed - each run otherwise costs one small JSON request per video.

Env: PEERTUBE_URL, TYPESENSE_URL, TYPESENSE_VIDEOS_KEY (documents:* on the
videos collection only), optional TYPESENSE_VIDEOS_COLLECTION.
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
TIMING = re.compile(r"^\d{2}:\d{2}[:.\d]* --> ")
TAG = re.compile(r"<[^>]+>")


def request(method, url, body=None, typesense=False):
    headers = {"User-Agent": UA, "Accept": "application/json"}
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
    body = request("GET", f"{base}/export?include_fields=id,updated", typesense=True)
    return {row["id"]: row.get("updated") for row in map(json.loads, filter(None, body.splitlines()))}


def import_docs(docs):
    url = f"{TYPESENSE}/collections/{COLLECTION}/documents/import?action=upsert"
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


def main():
    have = existing()
    seen, changed = set(), []
    for video in public_videos():
        seen.add(video["uuid"])
        captions = captions_of(video)
        if have.get(video["uuid"]) == stamp(video, captions):
            continue
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


if __name__ == "__main__":
    main()
