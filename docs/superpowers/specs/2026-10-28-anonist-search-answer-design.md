# Anonist answers from data in the site search

## Goal

When a search finds nothing relevant on our site, anonist answers once from data
(mushin/Hister), and invites the reader to start the topic in the community.
It is not a chat and not a summary of our own content: blog, comunidad and
videos keep answering through their links in the results list.

## When it runs

All of these, in the search modal (`assets/js/search-modal.js`):

1. The query looks like a question: it has `¿` or `?`, starts with qué, cómo,
   por qué, cuál, dónde, cuándo or se puede, or has 5 words or more.
2. The search has settled: the existing "no results" state is reached
   (`answered` in `paint()`: search idle, semantic ranking back, every active
   source at 0 hits for the current query). The per-collection distance
   thresholds already in place (blog 0.65, comunidad 0.42, videos 0.62) are
   what "relevant" means.
3. The "Anonist webhook" theme setting is filled. Empty hides the feature.

Typing keeps searching on every key; the answer request goes out only once
per settled query.

## Flow

```
browser ──query──▶ n8n webhook ──▶ cache hit? ──yes──▶ reply
                                    │ no
                                    ▼
                    Typesense: ghost, discourse_posts, videos
                    (same thresholds) ── any hit? ──yes──▶ reply "site"
                                    │ no
                                    ▼
                    Typesense: mushin ── no hit ──▶ reply "none"
                                    │ hits (top 5)
                                    ▼
                    LiteLLM (opencode-mimo-flash) ──▶ reply "data"
                                    │
                                    ▼
                              cache (7 days)
```

- The browser sends only the query. Retrieval runs in n8n, so the endpoint
  cannot be used as a free LLM proxy with arbitrary context.
- n8n re-checks the three site collections because the reader may have turned
  some pills off; a site hit means anonist stays silent.
- The model gets the mushin fragments and must answer only from them, in
  rioplatense Spanish (voseo), 2 to 4 sentences, curated, clear and concise.
  It returns JSON: `{ "answer": "...", "used": ["<doc id>", ...] }`, ordered
  by weight. If the fragments do not answer the question, `answer` is empty
  and the reply becomes "none".
- n8n maps `used` to at most 3 distinct domains.
- Cache key: query lowercased, accents and punctuation stripped, spaces
  collapsed. Stored in an n8n data table for 7 days, "none" included.
- Rate limit: a few requests per minute per IP; over it, reply "none".

### Reply

```json
{ "status": "data", "answer": "...", "domains": ["getmonero.org"] }
{ "status": "none" }
{ "status": "site" }
```

## What the reader sees

The block sits above the results list (where "no results for …" shows today)
and replaces that line while it is on screen.

**data**

> *[answer]*
>
> basado en getmonero.org · monerodocs.org
>
> Responde anonist desde nuestra base de datos curada.
> Iniciar discusión en la comunidad — [Nueva historia](url)

**none**

> todavía no lo tenemos.
>
> Responde anonist desde nuestra base de datos curada.
> Iniciar discusión en la comunidad — [Nueva historia](url)

- While waiting: a skeleton of 2–3 lines, like the results skeleton
  (`ns__hit--loading`).
- "Nueva historia" opens the community's new-topic composer with the query as
  the title: `https://comunidad.criptonautas.co/new-topic?title=<query>`.
- **site**, a network error, a timeout (8 s) or a non-200: the block does not
  show and the usual "no results for …" line stays. No error text for the
  reader.
- A reply for a query that is no longer the one typed is dropped.
- Strings go through `t()` with new keys in `locales/es.json` and
  `locales/en.json`.

## Changes

| Where | What |
|---|---|
| `package.json` | `anonist_webhook` setting (description ≤ 100 chars) |
| `partials/site-structure/site-scripts.hbs` | pass the setting as `data-anonist` on the search config script |
| `assets/js/search-config.js` | read `data-anonist`; `mushinCollection` stays empty (no data pill: only n8n reads mushin) |
| `assets/js/search-modal.js` | question test, request on settled empty state, render, drop stale replies |
| `assets/css/search.css` | answer block, legend, skeleton reuse |
| `locales/*.json` | new strings |
| n8n | new workflow `anonist-answer`: webhook → cache → Typesense → LiteLLM → cache → respond |
| `assets/built/` | rebuilt |

The n8n workflow lives on the user's instance, not in this repo. The LiteLLM
key stays in n8n credentials; the Typesense key there is search-only.

## Before it can go live

- Data on: create the `mushin` collection, set `HISTER_URL` and the
  `TYPESENSE_MUSHIN_KEY` secret so `sync-mushin.yml` fills it. The public
  search key does not need mushin; n8n uses its own search-only key over the
  four collections.
- Mushin threshold: 0.45, measured 2026-10-28. Ten real questions had their
  top hit at 0.26-0.39 and related ones up to 0.41; six control questions
  (recipes, trains, football) started at 0.50. The embedder is remote, so
  every mushin query needs `prefix=false`.

## Testing

- Question test: a small table of queries → expected true/false, run in the
  browser console or a node one-off.
- n8n: test executions for the three statuses (a query we cover, one only
  mushin covers, one nobody covers) and a repeated query hitting the cache.
- Site: on localhost, the three cases above in the modal, light and dark,
  phone and desktop; a slow webhook shows the skeleton then drops on timeout.

## Out of scope

- Answers or summaries from blog, comunidad or videos.
- Follow-up questions, chat history, streaming.
- Links to mushin pages.
