# Community chat on the blog

## Goal

A public chat channel of the forum, live on every blog page, so a visitor sees
people talking before being asked to join. anonist, the forum's mascot, moves
from the community sidebar to the chat and is its face: he shows the latest
message when the chat is active and his phrase of the day when it is quiet.
No iframe: the widget is the theme's own markup, fed by the forum's chat API.

Discourse lets anonymous visitors read public channels since October 2026
(discourse/discourse#44543). Posting stays for members signed in to the forum.

## Where it shows

- Every page, bottom right, unless the "Chat channel" setting is empty.
- Not on the pages whose slug is in the "Chat hidden pages" setting
  (e.g. `manifiesto, filosofia, the-matrix`). The slug comes from the
  post/page context in `default.hbs`, so it works for pages and posts.
  Matching is case-insensitive; spaces around commas are ignored.
- On posts and pages the pill sits in a row with back to top, to its left,
  12 px apart, same height. Back to top hides while the panel is open.
- The feedback tab (right middle, desktop) is untouched.
- Under 992 px only a round mask button shows, next to back to top; no bubble.

## States

| State | When | Pill | anonist's bubble |
|---|---|---|---|
| active | a message in the last 3 h | avatars of the last 3 posters, "chat de la comunidad", green dot | a new message's author and first words, 5 s, desktop only, at most once every 2 min |
| quiet | nothing in the last 3 h | "chat de la comunidad" | phrase of the day, as today in the sidebar |
| error | the API fails or changes shape | "chat de la comunidad", links to the forum's chat page | phrase of the day |

With the "Community mascot" setting off, the pill shows without anonist and
without bubble; the sidebar keeps whatever it shows today.

Polling: every 15 s while active, 60 s while quiet, paused while the tab is
hidden (`visibilitychange`). Messages are fetched with `credentials: 'omit'`.

## Panel

Opens from the pill or from anonist. About 380×560 px on desktop, a
full-screen sheet under 992 px. `role="dialog"`, focus moves in on open and
back to the pill on close, Esc closes.

```
            ▄█▓░░▓█▄
  ╭─────────▐████▌───────────────────────╮
  │ # general        (o)(o)(o) 12   ↗  ✕ │   name, avatars, open in forum, close
  ├──────────────────────────────────────┤
  │ (o) ana · 14:02                      │   grouped like Discourse: one header
  │     alguien probó el nodo nuevo?     │   per run of messages by one person
  │ (o) leo · 14:05                      │
  │     sí, sincroniza en 3 h aprox      │
  ├──────────────────────────────────────┤
  │ [ escribe un mensaje…          ] ➤   │   signed in to the forum
  │ [   Únete a la conversación   ]      │   not signed in: link to the forum's chat
  ╰──────────────────────────────────────╯
```

- Last 50 messages, newest at the bottom, scrolled to the bottom on open;
  new ones appended by the poll. Deleted messages vanish on the next poll.
- Message HTML (Discourse `cooked`) goes through `NautasForumHTML.render`,
  never `innerHTML`. Avatars from `avatar_template` at 48 px.
- Signed-in check: `GET /session/current.json` with the forum cookie, once
  per panel open. Sending: `GET /session/csrf.json`, then
  `POST /chat/<channel id>` with `X-CSRF-Token`, as `reactions.js` does.
  Errors show inline under the box ("No se pudo enviar. Inténtalo de nuevo.").
- The blog and the forum are the same site, so the cookie travels; the forum
  already allows this origin with credentials (`DISCOURSE_ENABLE_CORS`,
  `cors origins`).

## anonist

`assets/js/mascot.js` keeps its frames, motions and phrases and gets two
inputs instead of assuming the sidebar: the element he sits on, and a
function that gives the bubble's text. The sidebar passes its box and the
phrases; the chat passes the pill (the panel's top border while open) and
the latest message or, when quiet, the phrases. One anonist per page: with
the chat on, the sidebar's `.gh-mascot` is not rendered.

- Clicking him opens the panel (the sidebar click, cycling phrases, stays).
- The bubble is plain text set with `textContent`, truncated at 80 chars.
- Reduced motion: seated and silent except on click, as now.
- Mask style (the "Community mascot style" setting) applies as today.

## Settings (package.json, 17 of 20)

| Key | Type | Group | Meaning |
|---|---|---|---|
| `chat_channel` | text | site | the channel's forum URL, e.g. `…/chat/c/general/2`; empty turns the widget off |
| `chat_hidden_pages` | text | site | comma-separated slugs where the widget does not show |

The channel id is the last path segment of the URL; the forum origin is the
existing "Discourse URL" setting.

## Files

- `partials/chat.hbs` — pill, mask button, panel shell; included from
  `default.hbs` next to `to-top`, wrapped in the channel and hidden-pages checks.
- `assets/css/chat.css` — row with back to top, pill, panel, mobile sheet.
  Uses the `--cn-ui-*` tokens, the page background and the soft shadow of
  back to top and the feedback tab, light and dark.
- `assets/js/chat.js` — fetch, poll, render, send, states; ships in
  `main.min.js` like the others. Bubble text feeds `mascot.js`.
- `assets/js/mascot.js` — takes a seat and a text source.
- `partials/community-sidebar.hbs` — skips `.gh-mascot` when the chat is on.
- `locales/es.json`, `locales/en.json` — new strings under `{{t}}`.
- `package.json` — the two settings.

No new dependencies. No server code. On the forum: the anonymous group in
`chat allowed groups`; nothing else.

## Risks and limits

- The chat API is internal. Paths and JSON are checked against the forum
  before `chat.js` is written; after a forum upgrade the widget degrades to
  the error state, never to a broken page.
- Scripts running on the blog act on the forum as the visitor (true today
  for reactions and comments). Narrowing CORS to the paths the theme uses,
  in nginx, is a separate hardening step, outside this theme.
- No unread counter, no threads, no reactions in chat, no typing indicator,
  no notifications. Visitors cannot post.

## Testing

- `pnpm test` (gscan) passes with the new settings and partial.
- A small self-check in `chat.js` for the channel id and hidden-slugs parsing.
- In the browser on local Ghost: signed out, signed in, a hidden page, a
  quiet channel, forum unreachable, under 992 px, dark mode, reduced motion,
  keyboard only.

## Revision, 2026-10-30

The closed state changed; the panel, polling and writing did not.

- Closed: one button, a flat-bottomed tab docked to the bottom edge, bottom
  right (3.2rem in, the feedback tab owns the edge). Rounded top corners, page
  background, 1px line, back-to-top shadow.
- Contents: the last 3 distinct posters' avatars (2.5rem, overlapped), the
  label "chat en comunidad", the time of the last message ("· hace 4 min",
  `Intl.RelativeTimeFormat`) and the green dot when active (last 3 h). No
  avatars (error, empty channel): a chat-bubble icon.
- anonist is only his mask, a doorbell. Hidden at rest; a new message after
  page load pops it over the tab with a balloon ("author: first words",
  desktop only) for 5 s (4 s on phones, no balloon), 120 s cooldown, never with
  the panel open. No walking, no mask in the open panel; mascot.js is
  sidebar-only again.
- Open: the panel takes the tab's place in the same corner, flat bottom, 38rem
  by min(56rem, 100vh - 10rem); its header shows avatars, title, forum link,
  close. Under 992 px it stays a full sheet.
- Phones and tablets: the tab is avatars (2.2rem) plus the dot, 4rem tall.
- Back to top is now the `back_to_top` theme setting, off by default; when on,
  the tab sits left of it.
