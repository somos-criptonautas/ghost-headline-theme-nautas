#!/usr/bin/env python3
"""Mirror Hister's global documents (user 0) into the Typesense `links`
collection that the site search reads. Run by sync-hister-links.yml.

Only what changed is sent: Typesense embeds every document it receives, so
re-importing the whole set each run would pay for the same vectors again.

Env: HISTER_URL, TYPESENSE_URL, TYPESENSE_LINKS_KEY (documents:* on the
links collection only), optional TYPESENSE_LINKS_COLLECTION.
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

HISTER = os.environ["HISTER_URL"].rstrip("/")
TYPESENSE = os.environ["TYPESENSE_URL"].rstrip("/")
KEY = os.environ["TYPESENSE_LINKS_KEY"]
COLLECTION = os.environ.get("TYPESENSE_LINKS_COLLECTION") or "links"

# A page body is searched and embedded; past this it only adds cost.
MAX_TEXT = 20000
# Below nginx's request body limit, as in the Discourse indexer.
MAX_BODY_BYTES = 900_000
# Cloudflare answers urllib's default User-Agent with 403.
UA = "nautas-hister-sync"


def request(method, url, body=None, typesense=False):
    headers = {"User-Agent": UA}
    if typesense:
        headers["X-TYPESENSE-API-KEY"] = KEY
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read().decode()


def hister_docs():
    page_key = ""
    while True:
        query = json.dumps({"text": "*", "include_text": True, "page_key": page_key})
        res = json.loads(request("GET", f"{HISTER}/search?format=json&query={urllib.parse.quote(query)}"))
        docs = res.get("documents") or []
        for d in docs:
            # Anonymous search only sees user 0 already; checked again so the
            # site can never publish another user's scope.
            if d.get("user_id", 0) == 0 and d.get("url"):
                yield d
        page_key = res.get("page_key") or ""
        if not page_key or not docs:
            return


def to_doc(d):
    url = d["url"]
    favicon = d.get("favicon_key") or ""
    return {
        "id": hashlib.sha1(url.encode()).hexdigest(),
        "url": url,
        "domain": d.get("domain") or urllib.parse.urlsplit(url).hostname or "",
        "title": d.get("title") or url,
        "text": (d.get("text") or "")[:MAX_TEXT],
        "favicon": f"{HISTER}/api/favicon?key={urllib.parse.quote(favicon)}" if favicon else "",
        "added": int(d.get("added") or 0),
        "updated": int(d.get("updated") or d.get("added") or 0),
        "language": d.get("language") or "",
    }


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
                failed = [r for r in map(json.loads, out.splitlines()) if not r.get("success")]
                if failed:
                    sys.exit(f"import failed: {failed[:3]}")
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
    current = {doc["id"]: doc for doc in map(to_doc, hister_docs())}
    have = existing()

    # An empty answer from Hister (down, or public mode switched off) must
    # not read as "everything was removed" and wipe the collection.
    if not current and have:
        sys.exit("Hister returned no documents; leaving the collection as is")

    changed = [doc for id_, doc in current.items() if have.get(id_) != doc["updated"]]
    gone = [id_ for id_ in have if id_ not in current]
    import_docs(changed)
    delete_docs(gone)
    print(f"{len(current)} in Hister, {len(changed)} upserted, {len(gone)} deleted")


if __name__ == "__main__":
    main()
