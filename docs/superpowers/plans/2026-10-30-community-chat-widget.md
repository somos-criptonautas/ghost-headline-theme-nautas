# Community Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public forum chat channel live on every blog page, as a pill in the bottom-right corner that opens a panel, with anonist as its face.

**Architecture:** Theme-only: a Handlebars partial, one CSS file, two plain-JS files bundled into `main.min.js` by the existing gulp task, and a small generalisation of `mascot.js` so one anonist can sit on the sidebar or on the chat pill. Data comes from the forum's chat API (`/chat/api/channels/:id/messages`) with no cookie; sending uses the forum cookie and a CSRF token, as `reactions.js` already does. No server code, no dependencies.

**Tech Stack:** Ghost Handlebars theme, plain ES5-style JS (IIFEs, `var`, as the other `assets/js/*.js`), CSS with the theme's `--cn-ui-*` tokens, gulp build, gscan.

Spec: `docs/superpowers/specs/2026-10-30-community-chat-widget-design.md`.

## Global Constraints

- Forum origin comes from the existing `data-discourse` attribute on `<html>` (the "Discourse URL" setting), never hardcoded.
- Forum HTML (`cooked`) is rendered only through `window.NautasForumHTML.render(html, origin, emojiClass)`; nothing from the forum goes through `innerHTML`. Bubble text is set with `textContent`.
- Message listing uses `credentials: 'omit'`; only the signed-in check, the CSRF fetch and the POST use `credentials: 'include'`.
- Poll every 15 s when active (a message in the last 3 h), 60 s when quiet, never while `document.hidden`.
- Bubble: desktop only, 5 s, at most once every 120 s.
- Breakpoint 992 px: under it, the pill is a round mask button and there is no bubble or anonist.
- Strings in templates go through `{{t}}`; new keys are added to `locales/es.json` and `locales/en.json`.
- Code style: 4-space indent, `var`, single quotes, a short comment block at the top of each JS file saying what it is and that it ships in `main.min.js`, as the neighbouring files do.
- Commits: short subject, no body, no trailers (repository rule).
- Run `pnpm test` (gscan) after template or `package.json` changes.

## API facts (Discourse `main`, forum on 2026.11.0)

- `GET {origin}/chat/api/channels/{id}/messages?page_size=50` → `{messages: [...], tracking: {}, meta: {can_load_more_past, can_load_more_future}}`. Each message: `{id, message, cooked, created_at (ISO), deleted_at?, user: {id, username, name, avatar_template}}`. Anonymous access needs the forum's `chat allowed groups` setting to include `anonymous_users` and the channel to be a category channel; otherwise HTTP 403.
- `GET {origin}/chat/api/channels/{id}` → `{channel: {id, title, slug, status, ...}}` (read `data.channel || data`).
- `GET {origin}/session/current.json` with cookie → 200 when signed in, 404 otherwise.
- `GET {origin}/session/csrf.json` with cookie → `{csrf}`.
- `POST {origin}/chat/{id}` with cookie, header `X-CSRF-Token`, form field `message` → `{message_id}`; 403 when not allowed, 422 on validation.
- `avatar_template` is a path like `/user_avatar/host/ana/{size}/12_2.png`; prefix the origin when it starts with `/`, replace `{size}` with `48`.

---

### Task 1: Settings, partial, strings, include

**Files:**
- Modify: `package.json` (config.custom)
- Create: `partials/chat.hbs`
- Modify: `default.hbs:224`
- Modify: `locales/es.json`, `locales/en.json`

**Interfaces:**
- Produces: the DOM that Tasks 3–6 style and drive. Classes: `.cn-chat` (root, `data-channel`, `data-slug`, `data-hidden`, `data-mascot`), `.cn-chat-pill` (button), `.cn-chat-avatars`, `.cn-chat-label` (also `.gh-mascot-seat`), `.cn-chat-dot`, `.cn-chat-mask` (svg), `.gh-mascot` (optional), `.cn-chat-panel` (`role="dialog"`, `hidden`), `.cn-chat-title`, `.cn-chat-panel-avatars`, `.cn-chat-out` (a), `.cn-chat-close`, `.cn-chat-messages`, `.cn-chat-compose` (form, `hidden`), `.cn-chat-input`, `.cn-chat-send`, `.cn-chat-join` (a, `hidden`), `.cn-chat-status`.

- [ ] **Step 1: Add the two settings to `package.json`**

In `config.custom`, after `feedback_webhook`:

```json
"chat_channel": {
    "type": "text",
    "description": "Forum chat channel shown on every page, as its URL (…/chat/c/general/2). Empty hides the chat. Needs the anonymous_users group in the forum's \"chat allowed groups\"."
},
"chat_hidden_pages": {
    "type": "text",
    "description": "Slugs of pages or posts without the chat, separated by commas: manifiesto, filosofia, the-matrix"
}
```

- [ ] **Step 2: Create `partials/chat.hbs`**

```handlebars
{{!-- Community chat (assets/css/chat.css, assets/js/chat.js): a public forum
    channel, the "Chat channel" setting, as a pill in the bottom-right corner
    that opens a panel. Visitors read; members signed in to the forum write.
    anonist sits on the pill when the "Community mascot" setting is on, and
    then leaves the community sidebar. Hidden until the script fills it;
    the script removes it on the slugs in "Chat hidden pages". --}}
{{#if @custom.discourse_url}}{{#if @custom.chat_channel}}
<div class="cn-chat" hidden
    data-channel="{{@custom.chat_channel}}"
    data-slug="{{#post}}{{slug}}{{/post}}"
    data-hidden="{{@custom.chat_hidden_pages}}"
    data-active="{{t "community chat"}}"
    data-send-error="{{t "Could not send it. Try again in a moment."}}">
    {{#if @custom.community_mascot}}
    <div class="gh-mascot is-chat{{#match @custom.community_mascot_style "Mask"}} is-mask{{/match}}" hidden>
        <p class="gh-mascot-bubble" role="status"></p>
        <button class="gh-mascot-button" type="button" aria-label="{{t "Open the chat"}}">
            <svg viewBox="0 0 48 48" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><use href="{{asset "images/anonist-sprite.svg"}}#anonist-48-{{#match @custom.community_mascot_style "Mask"}}mask-idle{{else}}sit{{/match}}"/></svg>
        </button>
    </div>
    {{/if}}
    <button class="cn-chat-pill" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="cn-chat-panel">
        <span class="cn-chat-avatars" aria-hidden="true"></span>
        <span class="cn-chat-label gh-mascot-seat">{{t "community chat"}}</span>
        <span class="cn-chat-dot" hidden aria-hidden="true"></span>
        {{!-- Phones: only his mask, as the button's face. --}}
        <svg class="cn-chat-mask" viewBox="0 0 48 48" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><use href="{{asset "images/anonist-sprite.svg"}}#anonist-48-mask-idle"/></svg>
    </button>
    <section class="cn-chat-panel" id="cn-chat-panel" role="dialog" aria-labelledby="cn-chat-title" hidden>
        <header class="cn-chat-head">
            <h2 class="cn-chat-title" id="cn-chat-title">{{t "community chat"}}</h2>
            <span class="cn-chat-panel-avatars" aria-hidden="true"></span>
            <a class="cn-chat-out" href="{{@custom.chat_channel}}" target="_blank" rel="noopener" aria-label="{{t "Open in the forum"}}" title="{{t "Open in the forum"}}">{{> "icons/phosphor/arrow-square-out"}}</a>
            <button class="cn-chat-close" type="button" aria-label="{{t "Close"}}">&times;</button>
        </header>
        <div class="cn-chat-messages" aria-live="polite" aria-busy="true"></div>
        <form class="cn-chat-compose" hidden>
            <textarea class="cn-chat-input" name="message" rows="1" required maxlength="2000" aria-label="{{t "Message"}}" placeholder="{{t "Write a message…"}}"></textarea>
            <button class="cn-chat-send" type="submit" aria-label="{{t "send"}}">{{> "icons/phosphor/arrow-up"}}</button>
        </form>
        <a class="cn-chat-join" href="{{@custom.chat_channel}}" target="_blank" rel="noopener" hidden>{{t "Join the conversation"}}</a>
        <p class="cn-chat-status" role="status"></p>
    </section>
</div>
{{/if}}{{/if}}
```

Both icons exist already (`arrow-square-out.hbs`, `arrow-up.hbs`); the up arrow is the send glyph, as in most chat apps.

- [ ] **Step 3: Include it in `default.hbs`**

Replace line 224:

```handlebars
    {{#is "post, page"}}{{> "toc-toggle"}}{{> "to-top"}}{{/is}}
```

with:

```handlebars
    {{#is "post, page"}}{{> "toc-toggle"}}{{> "to-top"}}{{/is}}
    {{> "chat"}}
```

- [ ] **Step 4: Add the strings**

`locales/es.json` (keep the file's tab indent and alphabetical-ish placement near "feedback"):

```json
"community chat": "chat de la comunidad",
"Open the chat": "Abrir el chat",
"Open in the forum": "Abrir en el foro",
"Write a message…": "escribe un mensaje…",
"Join the conversation": "Únete a la conversación",
```

`locales/en.json`:

```json
"community chat": "community chat",
"Open the chat": "Open the chat",
"Open in the forum": "Open in the forum",
"Write a message…": "Write a message…",
"Join the conversation": "Join the conversation",
```

"Message", "Close", "send" and "Could not send it. Try again in a moment." exist already.

- [ ] **Step 5: Run gscan**

Run: `pnpm test`
Expected: no errors (warnings that existed before are fine; compare with `git stash; pnpm test; git stash pop` if unsure).

- [ ] **Step 6: Commit**

```bash
git add package.json partials/chat.hbs default.hbs locales/es.json locales/en.json
git commit -m "Chat: settings, partial and strings"
```

---

### Task 2: Pure parsing helpers with a test

**Files:**
- Create: `assets/js/chat-parse.js`
- Test: run inline with node (no test runner in the theme)

**Interfaces:**
- Produces `window.NautasChatParse` with:
  - `channelId(url: string): string` — last path segment of the channel URL that is all digits, else `''`. `'https://f.co/chat/c/general/2'` → `'2'`; `'https://f.co/chat/c/general/2/'` → `'2'`; `'https://f.co/chat'` → `''`.
  - `hiddenSlugs(list: string): string[]` — `'Manifiesto, filosofia ,,the-matrix'` → `['manifiesto','filosofia','the-matrix']`.
  - `isHidden(slug: string, list: string): boolean` — case-insensitive membership; empty slug → false.
  - `avatar(template: string, origin: string): string` — `'/user_avatar/h/ana/{size}/1_2.png'` → `origin + '/user_avatar/h/ana/48/1_2.png'`; an `https://` template is kept, `{size}` replaced; anything else → `''`.
  - `isActive(messages: {created_at: string}[], now: number): boolean` — true when the newest `created_at` is within 3 h of `now` (ms).
  - `plain(text: string, max: number): string` — collapses whitespace, truncates to `max` with `…`.

- [ ] **Step 1: Write the failing test**

Save as `/tmp/claude-1000/-home-nauta--config-Claude-scratch-workspaces-9e5aa791-1233-4950-984a-1fd5c0df81cd-deecfcd7-3f63-486b-ba5d-cb9d652d5912-scratch-2026-10-30-befec5/f32b466a-b2fa-49ca-91d7-65bf8878e480/scratchpad/chat-parse.test.js` (outside the theme, so it is not bundled or committed):

```js
global.window = {};
require(process.argv[2]);
var P = global.window.NautasChatParse;
var assert = require('assert');

assert.strictEqual(P.channelId('https://f.co/chat/c/general/2'), '2');
assert.strictEqual(P.channelId('https://f.co/chat/c/general/2/'), '2');
assert.strictEqual(P.channelId('https://f.co/chat/c/general/2?x=1'), '2');
assert.strictEqual(P.channelId('https://f.co/chat'), '');
assert.strictEqual(P.channelId(''), '');

assert.deepStrictEqual(P.hiddenSlugs('Manifiesto, filosofia ,,the-matrix'), ['manifiesto', 'filosofia', 'the-matrix']);
assert.deepStrictEqual(P.hiddenSlugs(''), []);
assert.strictEqual(P.isHidden('Filosofia', 'manifiesto, filosofia'), true);
assert.strictEqual(P.isHidden('blog', 'manifiesto, filosofia'), false);
assert.strictEqual(P.isHidden('', 'manifiesto'), false);

assert.strictEqual(P.avatar('/user_avatar/h/ana/{size}/1_2.png', 'https://f.co'), 'https://f.co/user_avatar/h/ana/48/1_2.png');
assert.strictEqual(P.avatar('https://cdn.x/a/{size}.png', 'https://f.co'), 'https://cdn.x/a/48.png');
assert.strictEqual(P.avatar('javascript:alert(1)', 'https://f.co'), '');
assert.strictEqual(P.avatar(undefined, 'https://f.co'), '');

var now = Date.parse('2026-10-30T12:00:00Z');
assert.strictEqual(P.isActive([{created_at: '2026-10-30T10:00:00Z'}, {created_at: '2026-10-30T11:30:00Z'}], now), true);
assert.strictEqual(P.isActive([{created_at: '2026-10-30T08:59:00Z'}], now), false);
assert.strictEqual(P.isActive([], now), false);

assert.strictEqual(P.plain('  hola \n  mundo  ', 80), 'hola mundo');
assert.strictEqual(P.plain('abcdefghij', 5), 'abcd…');
console.log('chat-parse ok');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node /tmp/claude-1000/-home-nauta--config-Claude-scratch-workspaces-9e5aa791-1233-4950-984a-1fd5c0df81cd-deecfcd7-3f63-486b-ba5d-cb9d652d5912-scratch-2026-10-30-befec5/f32b466a-b2fa-49ca-91d7-65bf8878e480/scratchpad/chat-parse.test.js "$PWD/assets/js/chat-parse.js"`
Expected: `Cannot find module '.../assets/js/chat-parse.js'`.

- [ ] **Step 3: Write `assets/js/chat-parse.js`**

```js
/* Pure helpers for the community chat (assets/js/chat.js): the channel id
 * from its URL, the hidden-pages list, avatar URLs, the active/quiet state
 * and bubble text. No DOM, so a node script can check them. Ships inside
 * main.min.js, before chat.js (the bundle is alphabetical). */
window.NautasChatParse = (function () {
    var ACTIVE_WINDOW = 3 * 60 * 60 * 1000;

    var channelId = function (url) {
        var path = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');
        var last = path.split('/').pop();
        return /^\d+$/.test(last) ? last : '';
    };

    var hiddenSlugs = function (list) {
        return String(list || '').toLowerCase().split(',').map(function (s) {
            return s.trim();
        }).filter(Boolean);
    };

    var isHidden = function (slug, list) {
        return !!slug && hiddenSlugs(list).indexOf(String(slug).toLowerCase()) !== -1;
    };

    var avatar = function (template, origin) {
        if (typeof template !== 'string') {
            return '';
        }
        var url = template.charAt(0) === '/' ? origin + template : template;
        return /^https:\/\//.test(url) ? url.replace('{size}', '48') : '';
    };

    var isActive = function (messages, now) {
        var latest = 0;
        (messages || []).forEach(function (m) {
            var t = Date.parse(m.created_at);
            if (t > latest) {
                latest = t;
            }
        });
        return latest > 0 && now - latest < ACTIVE_WINDOW;
    };

    var plain = function (text, max) {
        var s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    };

    return {channelId: channelId, hiddenSlugs: hiddenSlugs, isHidden: isHidden, avatar: avatar, isActive: isActive, plain: plain};
})();
```

- [ ] **Step 4: Run the test**

Run: `node /tmp/claude-1000/-home-nauta--config-Claude-scratch-workspaces-9e5aa791-1233-4950-984a-1fd5c0df81cd-deecfcd7-3f63-486b-ba5d-cb9d652d5912-scratch-2026-10-30-befec5/f32b466a-b2fa-49ca-91d7-65bf8878e480/scratchpad/chat-parse.test.js "$PWD/assets/js/chat-parse.js"`
Expected: `chat-parse ok`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/chat-parse.js
git commit -m "Chat: parsing helpers"
```

---

### Task 3: Styles

**Files:**
- Create: `assets/css/chat.css`
- Modify: `assets/css/screen.css` (add `@import "chat.css";` after `community.css`)

**Interfaces:**
- Consumes the classes from Task 1 and the state classes set by Task 4: `.cn-chat.is-active`, `.cn-chat.is-open`, `.cn-chat-pill.is-visible`.
- Produces: the layout described in the spec. The sidebar's mascot CSS in `community.css` already styles `.gh-mascot`, `.gh-mascot-bubble`, `.is-standing`, `.is-left`, `.is-flipped`, `.is-mask`; this file only places him on the pill and opens the bubble to his left.

- [ ] **Step 1: Write `assets/css/chat.css`**

```css
/* Community chat (partials/chat.hbs, assets/js/chat.js). A pill in the
   bottom-right corner dressed like back to top (post.css): page background,
   no border, the soft shadow. On posts and pages it sits left of back to top,
   in a row. anonist sits on its top border (community.css styles him; here
   only his seat and the bubble side). Under 992px the pill is his mask. */
.cn-chat {
    position: fixed;
    right: max(2rem, env(safe-area-inset-right));
    bottom: max(2rem, env(safe-area-inset-bottom));
    z-index: 85;
}

/* Left of back to top (4.4rem wide), 1.2rem apart, on posts and pages. */
body:has(.gh-to-top) .cn-chat {
    right: calc(max(2rem, env(safe-area-inset-right)) + 4.4rem + 1.2rem);
}

/* The panel scrolls on its own; back to top would only crowd the corner. */
body:has(.cn-chat.is-open) .gh-to-top {
    visibility: hidden;
}

.cn-chat-pill {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    height: 4.4rem;
    padding: 0 1.4rem 0 0.6rem;
    border: 0;
    border-radius: 2.2rem;
    background-color: var(--color-bg);
    color: var(--color-base);
    box-shadow: 0 0.1rem 0.5rem rgba(0, 0, 0, 0.08);
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transform: translateY(0.8rem);
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s, box-shadow 0.15s ease;
}

.cn-chat-pill.is-visible {
    opacity: 1;
    visibility: visible;
    transform: none;
}

.cn-chat-pill:hover,
.cn-chat-pill[aria-expanded="true"] {
    box-shadow: 0 0.2rem 0.9rem color-mix(in srgb, var(--color-base) 14%, transparent);
}

.cn-chat-pill:focus-visible,
.cn-chat-close:focus-visible,
.cn-chat-out:focus-visible,
.cn-chat-send:focus-visible,
.cn-chat-join:focus-visible {
    outline: 2px solid var(--ghost-accent-color);
    outline-offset: 2px;
}

/* Stacked avatars: the last three posters, overlapping by a third. */
.cn-chat-avatars,
.cn-chat-panel-avatars {
    display: flex;
}

.cn-chat-avatars:empty {
    display: none;
}

.cn-chat-avatars img,
.cn-chat-panel-avatars img {
    width: 3.2rem;
    height: 3.2rem;
    border: 2px solid var(--color-bg);
    border-radius: 50%;
    background-color: var(--cn-ui-surface);
}

.cn-chat-avatars img + img,
.cn-chat-panel-avatars img + img {
    margin-left: -1rem;
}

.cn-chat-dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background-color: #2fb36b;
}

.cn-chat-mask {
    display: none;
    width: 3.2rem;
    height: 3.2rem;
}

/* anonist on the pill's top border: the pill is his stage (mascot.js walks
   its width) and the label his seat. In the corner the bubble always opens
   to his left, as .is-flipped does in the sidebar. */
.cn-chat .gh-mascot:not([hidden]) {
    display: block;
}

.cn-chat .gh-mascot-button {
    cursor: pointer;
}

/* Panel open: he moves up to its top border. The panel sits 1.2rem over the
   pill and is min(56rem, 100vh - 12rem) tall; seated he overlaps 6px into
   the box, standing he rests on it (community.css: top -42px / -48px). */
.cn-chat.is-open .gh-mascot {
    top: auto;
    bottom: calc(100% + 1.2rem + min(56rem, 100vh - 12rem) - 6px);
}

.cn-chat.is-open .gh-mascot.is-standing {
    bottom: calc(100% + 1.2rem + min(56rem, 100vh - 12rem));
}

.cn-chat .gh-mascot-bubble {
    right: calc(100% + 14px);
    left: auto;
    max-width: 32rem;
    white-space: normal;
}

.cn-chat .gh-mascot-bubble::before {
    right: -12px;
    left: auto;
}

.cn-chat .gh-mascot-bubble::after {
    right: -21px;
    left: auto;
}

/* Panel: above the pill, right-aligned with it. */
.cn-chat-panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 1.2rem);
    display: flex;
    flex-direction: column;
    width: 38rem;
    height: min(56rem, calc(100vh - 12rem));
    border: 1px solid var(--cn-ui-line);
    border-radius: 1.2rem;
    background-color: var(--color-bg);
    color: var(--cn-ui-text);
    box-shadow: 0 0.1rem 0.5rem rgba(0, 0, 0, 0.08);
    font-size: 1.5rem;
}

.cn-chat-panel[hidden] {
    display: none;
}

.cn-chat-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 1.2rem 1.2rem 1.2rem 1.6rem;
    border-bottom: 1px solid var(--cn-ui-line);
}

.cn-chat-title {
    flex: 1;
    margin: 0;
    overflow: hidden;
    font-size: 1.5rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cn-chat-out,
.cn-chat-close {
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--cn-ui-muted);
    font-size: 2.2rem;
    line-height: 1;
    cursor: pointer;
}

.cn-chat-out svg {
    width: 1.8rem;
    height: 1.8rem;
}

.cn-chat-out:hover,
.cn-chat-close:hover {
    background-color: var(--cn-ui-hover);
    color: var(--color-base);
}

.cn-chat-messages {
    flex: 1;
    min-height: 0;
    padding: 1.2rem 1.6rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
}

/* One header per run of messages by the same person, as the forum groups them. */
.cn-chat-group {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    gap: 0.2rem 1rem;
    margin-top: 1.2rem;
}

.cn-chat-group:first-child {
    margin-top: 0;
}

.cn-chat-group img {
    grid-row: 1 / span 2;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    background-color: var(--cn-ui-surface);
}

.cn-chat-who {
    display: flex;
    gap: 0.8rem;
    align-items: baseline;
    font-size: 1.3rem;
    font-weight: 700;
}

.cn-chat-when {
    color: var(--cn-ui-muted);
    font-weight: 400;
}

.cn-chat-body {
    grid-column: 2;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.cn-chat-body p {
    margin: 0 0 0.4rem;
}

.cn-chat-body a {
    color: var(--ghost-accent-color);
}

.cn-chat-emoji {
    width: 1.3em;
    height: 1.3em;
    vertical-align: -0.25em;
}

.cn-chat-empty {
    margin: 2rem 0;
    color: var(--cn-ui-muted);
    text-align: center;
}

.cn-chat-compose {
    display: flex;
    gap: 0.8rem;
    align-items: flex-end;
    padding: 1rem 1.2rem 1.2rem;
    border-top: 1px solid var(--cn-ui-line);
}

.cn-chat-compose[hidden] {
    display: none;
}

.cn-chat-input {
    flex: 1;
    min-height: 3.6rem;
    max-height: 12rem;
    padding: 0.8rem 1.2rem;
    border: 1px solid var(--cn-ui-line);
    border-radius: 1.8rem;
    background-color: var(--cn-ui-sunken);
    color: var(--cn-ui-text);
    font: inherit;
    line-height: 1.4;
    resize: none;
}

.cn-chat-send {
    display: grid;
    place-items: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background-color: var(--ghost-accent-color);
    color: #fff;
    cursor: pointer;
}

.cn-chat-send svg {
    width: 1.8rem;
    height: 1.8rem;
}

.cn-chat-send:disabled {
    opacity: 0.5;
    cursor: default;
}

.cn-chat-join {
    display: block;
    margin: 1.2rem;
    padding: 1rem;
    border-radius: 0.8rem;
    background-color: var(--ghost-accent-color);
    color: #fff;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
}

.cn-chat-join[hidden] {
    display: none;
}

.cn-chat-status {
    margin: 0;
    padding: 0 1.6rem 1rem;
    color: var(--cn-ui-muted);
    font-size: 1.3rem;
}

.cn-chat-status:empty {
    display: none;
}

@media (prefers-reduced-motion: reduce) {
    .cn-chat-pill {
        transition: none;
    }
}

/* Phones and tablets: his mask as a round button, the panel a full sheet. */
@media (max-width: 991px) {
    .cn-chat .gh-mascot,
    .cn-chat-avatars,
    .cn-chat-label {
        display: none;
    }

    .cn-chat-pill {
        width: 4.4rem;
        padding: 0;
        justify-content: center;
    }

    .cn-chat-mask {
        display: block;
    }

    .cn-chat-dot {
        position: absolute;
        top: 0.2rem;
        right: 0.2rem;
    }

    .cn-chat-panel {
        position: fixed;
        inset: 0;
        width: auto;
        height: auto;
        border: 0;
        border-radius: 0;
    }

    .cn-chat-head {
        padding-top: max(1.2rem, env(safe-area-inset-top));
    }

    .cn-chat-compose {
        padding-bottom: max(1.2rem, env(safe-area-inset-bottom));
    }
}
```

- [ ] **Step 2: Import it**

In `assets/css/screen.css`, after `@import "community.css";` add:

```css
@import "chat.css";
```

- [ ] **Step 3: Build and check the CSS compiles**

Run: `pnpm exec gulp build` (the gulpfile exports only `build`, `zip` and the default watcher).
Expected: no error, `assets/built/screen.css` contains `.cn-chat-pill`.

- [ ] **Step 4: Commit**

```bash
git add assets/css/chat.css assets/css/screen.css assets/built
git commit -m "Chat: styles"
```

---

### Task 4: Read-only widget: fetch, render, states, polling, open/close

**Files:**
- Create: `assets/js/chat.js`

**Interfaces:**
- Consumes `window.NautasChatParse` (Task 2), `window.NautasForumHTML.render(html, origin, emojiClass)` (exists), the DOM of Task 1.
- Produces: state classes for the CSS (`.cn-chat.is-active`, `.cn-chat.is-open`, `.cn-chat-pill.is-visible`); calls `mascot.say(text)` when the `.gh-mascot` element inside `.cn-chat` has a `say` function (Task 6 adds it; until then nothing happens). Leaves `compose`/`join` to Task 5 via `onOpen` hook: Task 5 fills `var checkSession = function () {}` defined here.

- [ ] **Step 1: Write `assets/js/chat.js`**

```js
/* Community chat (partials/chat.hbs, chat.css). A public forum channel,
 * read from the chat API without a cookie, polled every 15 s while someone
 * wrote in the last 3 h, every 60 s otherwise, never in a hidden tab.
 * Members signed in to the forum can write: the same cookie and CSRF dance
 * as reactions.js. Message HTML goes through NautasForumHTML, never
 * innerHTML. If the forum fails, the pill stays as a link to the forum's chat
 * and anonist keeps his phrase of the day. Ships inside main.min.js.
 */
(function () {
    var root = document.querySelector('.cn-chat');
    var P = window.NautasChatParse;

    if (!root || !P || !window.fetch || !window.NautasForumHTML) {
        return;
    }

    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var CHANNEL = P.channelId(root.getAttribute('data-channel'));
    var CHANNEL_URL = root.getAttribute('data-channel');

    if (!CHANNEL || P.isHidden(root.getAttribute('data-slug'), root.getAttribute('data-hidden'))) {
        root.remove();
        return;
    }

    var pill = root.querySelector('.cn-chat-pill');
    var avatars = root.querySelector('.cn-chat-avatars');
    var panelAvatars = root.querySelector('.cn-chat-panel-avatars');
    var dot = root.querySelector('.cn-chat-dot');
    var panel = root.querySelector('.cn-chat-panel');
    var title = root.querySelector('.cn-chat-title');
    var list = root.querySelector('.cn-chat-messages');
    var close = root.querySelector('.cn-chat-close');
    var mascot = root.querySelector('.gh-mascot');
    var status = root.querySelector('.cn-chat-status');

    var messages = [];
    var lastId = 0;
    var lastSaid = 0;
    var timer;
    var failed = false;
    var desktop = window.matchMedia('(min-width: 992px)');

    // Filled by the signed-in part below; a no-op until then.
    var checkSession = function () {};

    var get = function (path) {
        return fetch(ORIGIN + path, {credentials: 'omit', headers: {Accept: 'application/json'}}).then(function (r) {
            if (!r.ok) {
                throw new Error(r.status);
            }
            return r.json();
        });
    };

    var el = function (tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    };

    var img = function (user) {
        var src = P.avatar(user && user.avatar_template, ORIGIN);
        if (!src) {
            return null;
        }
        var image = el('img');
        image.src = src;
        image.alt = '';
        image.width = 32;
        image.height = 32;
        image.loading = 'lazy';
        return image;
    };

    var when = function (iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleTimeString(document.documentElement.lang || undefined, {hour: '2-digit', minute: '2-digit'});
    };

    // The last three distinct posters, newest first.
    var paintAvatars = function (target) {
        target.replaceChildren();
        var seen = {};
        messages.slice().reverse().some(function (m) {
            var u = m.user || {};
            if (seen[u.id]) {
                return false;
            }
            seen[u.id] = true;
            var image = img(u);
            if (image) {
                target.appendChild(image);
            }
            return target.childElementCount === 3;
        });
    };

    var paintList = function () {
        list.replaceChildren();
        list.setAttribute('aria-busy', 'false');
        if (!messages.length) {
            list.appendChild(el('p', 'cn-chat-empty', root.getAttribute('data-active')));
            return;
        }
        var group = null;
        var lastUser = null;
        messages.forEach(function (m) {
            var u = m.user || {};
            if (!group || u.id !== lastUser) {
                group = el('div', 'cn-chat-group');
                var image = img(u);
                if (image) {
                    group.appendChild(image);
                }
                var who = el('div', 'cn-chat-who');
                who.appendChild(el('span', '', u.name || u.username || ''));
                who.appendChild(el('span', 'cn-chat-when', when(m.created_at)));
                group.appendChild(who);
                list.appendChild(group);
                lastUser = u.id;
            }
            var body = window.NautasForumHTML.render(m.cooked || '', ORIGIN, 'cn-chat-emoji');
            body.className = 'cn-chat-body';
            group.appendChild(body);
        });
        list.scrollTop = list.scrollHeight;
    };

    var say = function (text) {
        if (mascot && typeof mascot.say === 'function' && desktop.matches) {
            mascot.say(text);
        }
    };

    var setState = function () {
        var active = P.isActive(messages, Date.now());
        root.classList.toggle('is-active', active);
        dot.hidden = !active;
        paintAvatars(avatars);
        paintAvatars(panelAvatars);
        pill.classList.add('is-visible');
    };

    var apply = function (data) {
        var fresh = (data.messages || []).filter(function (m) {
            return !m.deleted_at;
        });
        var newest = fresh.length ? fresh[fresh.length - 1] : null;
        var changed = !newest ? messages.length > 0 : newest.id !== lastId || fresh.length !== messages.length;
        messages = fresh;
        if (newest && lastId && newest.id !== lastId && Date.now() - lastSaid > 120000) {
            lastSaid = Date.now();
            var u = newest.user || {};
            say(P.plain((u.username || '') + ': ' + (newest.excerpt || newest.message || ''), 80));
        }
        lastId = newest ? newest.id : 0;
        failed = false;
        setState();
        if (changed && !panel.hidden) {
            paintList();
        }
    };

    var fail = function () {
        // The forum's chat page takes over the pill until the next poll succeeds.
        failed = true;
        root.classList.remove('is-active');
        dot.hidden = true;
        pill.classList.add('is-visible');
        list.setAttribute('aria-busy', 'false');
        if (!panel.hidden) {
            list.replaceChildren(el('p', 'cn-chat-empty', root.getAttribute('data-send-error')));
        }
    };

    var poll = function () {
        clearTimeout(timer);
        if (document.hidden) {
            return;
        }
        get('/chat/api/channels/' + CHANNEL + '/messages?page_size=50').then(apply, fail).then(function () {
            timer = setTimeout(poll, root.classList.contains('is-active') ? 15000 : 60000);
        });
    };

    var open = function () {
        if (failed) {
            window.open(CHANNEL_URL, '_blank', 'noopener');
            return;
        }
        panel.hidden = false;
        root.classList.add('is-open');
        pill.setAttribute('aria-expanded', 'true');
        paintList();
        checkSession();
        close.focus();
        poll();
    };

    var shut = function () {
        panel.hidden = true;
        root.classList.remove('is-open');
        pill.setAttribute('aria-expanded', 'false');
        status.textContent = '';
        pill.focus();
    };

    pill.addEventListener('click', function () {
        if (panel.hidden) {
            open();
        } else {
            shut();
        }
    });
    if (mascot) {
        mascot.addEventListener('click', function () {
            if (panel.hidden) {
                open();
            }
        });
    }
    close.addEventListener('click', shut);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !panel.hidden) {
            shut();
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            poll();
        }
    });

    get('/chat/api/channels/' + CHANNEL).then(function (data) {
        var channel = data.channel || data;
        if (channel && channel.title) {
            title.textContent = '# ' + channel.title;
        }
    }, function () {});

    root.hidden = false;
    poll();

    // --- signed-in members write (reactions.js does the same dance) ---
    // Task 5 replaces the body of checkSession and adds the submit handler here.
})();
```

- [ ] **Step 2: Build and load a page**

Run: `pnpm exec gulp build`, then open the local Ghost in the browser with the "Chat channel" setting set to a forum channel URL.
Expected: the pill appears bottom-right (with the forum refusing anonymous access, it appears without avatars and opens the forum's chat in a new tab). With anonymous access on, the panel opens with messages, grouped, with avatars and times; Esc closes; the panel is a full sheet under 992 px.

- [ ] **Step 3: Check the hidden-pages setting**

Set "Chat hidden pages" to the slug of a test page and load it.
Expected: no `.cn-chat` in the DOM (`document.querySelector('.cn-chat')` → `null`).

- [ ] **Step 4: Commit**

```bash
git add assets/js/chat.js assets/built
git commit -m "Chat: read-only widget"
```

---

### Task 5: Writing for members signed in to the forum

**Files:**
- Modify: `assets/js/chat.js` (the block marked for Task 5)

**Interfaces:**
- Consumes `checkSession`, `status`, `root`, `ORIGIN`, `CHANNEL`, `poll` from Task 4.

- [ ] **Step 1: Replace the final comment in `chat.js` with the signed-in part**

Replace:

```js
    // --- signed-in members write (reactions.js does the same dance) ---
    // Task 5 replaces the body of checkSession and adds the submit handler here.
```

with:

```js
    // --- signed-in members write (reactions.js does the same dance) ---
    var compose = root.querySelector('.cn-chat-compose');
    var join = root.querySelector('.cn-chat-join');
    var input = root.querySelector('.cn-chat-input');
    var send = root.querySelector('.cn-chat-send');
    var signedIn = null;

    var withCookie = function (path, options) {
        options = options || {};
        options.credentials = 'include';
        options.headers = Object.assign({Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest'}, options.headers);
        return fetch(ORIGIN + path, options).then(function (r) {
            if (!r.ok) {
                throw new Error(r.status);
            }
            return r.json();
        });
    };

    // Once per page: the session answers 404 for anyone not signed in.
    checkSession = function () {
        if (signedIn !== null) {
            compose.hidden = !signedIn;
            join.hidden = signedIn;
            return;
        }
        withCookie('/session/current.json').then(function () {
            signedIn = true;
        }, function () {
            signedIn = false;
        }).then(function () {
            compose.hidden = !signedIn;
            join.hidden = signedIn;
        });
    };

    compose.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text || send.disabled) {
            return;
        }
        send.disabled = true;
        status.textContent = '';
        withCookie('/session/csrf.json').then(function (session) {
            var body = new URLSearchParams();
            body.set('message', text);
            return withCookie('/chat/' + CHANNEL, {
                method: 'POST',
                headers: {'X-CSRF-Token': session.csrf, 'Content-Type': 'application/x-www-form-urlencoded'},
                body: body.toString()
            });
        }).then(function () {
            input.value = '';
            poll();
        }, function () {
            status.textContent = root.getAttribute('data-send-error');
        }).then(function () {
            send.disabled = false;
            input.focus();
        });
    });

    // Enter sends, Shift+Enter breaks the line, as in the forum.
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            compose.requestSubmit();
        }
    });
```

- [ ] **Step 2: Build and test both sides**

Run: `pnpm exec gulp build`. In the browser:
- Signed out of the forum: open the panel → the "Join the conversation" link shows, no text box.
- Signed in to the forum (same browser): open the panel → the text box shows; send "prueba desde el blog" → it appears in the list within a poll (the panel re-polls right after sending) and in the forum.
- Signed in, but with the forum blocking the post (e.g. a closed channel): the inline error shows under the box.

- [ ] **Step 3: Commit**

```bash
git add assets/js/chat.js assets/built
git commit -m "Chat: members write"
```

---

### Task 6: One anonist for the sidebar or the chat

**Files:**
- Modify: `assets/js/mascot.js`
- Modify: `partials/community-sidebar.hbs:28-35`

**Interfaces:**
- Consumes: any `.gh-mascot` whose parent is its stage; inside the stage, `.gh-mascot-seat` is what he sits over (the sidebar heading or the pill label); `.gh-mascot.is-chat` marks the chat one.
- Produces: `mascotElement.say(text)` — shows `text` in the bubble for 5 s and waves; used by `chat.js` (Task 4). The sidebar keeps its behaviour: click → phrase of the day; walking, waving, scratching every 20 s; blinking.

- [ ] **Step 1: Generalise `mascot.js`**

Change the top of the file after `PHRASES` and `STEP` so it mounts every mascot. Replace:

```js
    var STEP = 160;
    var mascot = document.querySelector('.gh-community .gh-mascot');

    if (!mascot) {
        return;
    }

    var aside = mascot.closest('.gh-community');
    var title = aside.querySelector('.gh-community-title');
```

with:

```js
    var STEP = 160;

    // One mount per mascot: the sidebar's (phrases on click) or the chat's
    // (chat.js calls mascot.say with the latest message; a click opens the chat).
    var mount = function (mascot) {
    var aside = mascot.parentElement;
    var title = aside.querySelector('.gh-mascot-seat') || aside.querySelector('.gh-community-title');
    var isChat = mascot.classList.contains('is-chat');
```

Then, keep everything as is until the click handler. Replace:

```js
    mascot.querySelector('button').addEventListener('click', function () {
        bubble.textContent = today()[said % 3];
        said += 1;
        // In the right half of the box the balloon opens on his left (community.css).
        mascot.classList.toggle('is-flipped', x > aside.clientWidth / 2);
        clearTimeout(talking);
        // Emptied, the bubble hides (community.css) and the next click is announced again.
        talking = setTimeout(function () {
            bubble.textContent = '';
        }, 3000);
        if (!busy && !still) {
            play(wave);
        }
    });
```

with:

```js
    var say = function (text, ms) {
        bubble.textContent = text;
        // In the right half of the box the balloon opens on his left (community.css).
        mascot.classList.toggle('is-flipped', x > aside.clientWidth / 2);
        clearTimeout(talking);
        // Emptied, the bubble hides (community.css) and the next click is announced again.
        talking = setTimeout(function () {
            bubble.textContent = '';
        }, ms);
        if (!busy && !still) {
            play(wave);
        }
    };
    mascot.say = function (text) {
        say(text, 5000);
    };

    mascot.querySelector('button').addEventListener('click', function () {
        if (isChat) {
            return; // chat.js opens the panel
        }
        say(today()[said % 3], 3000);
        said += 1;
    });
```

Then, in the 20 s interval, make the quiet chat show the phrase of the day instead of nothing. Replace:

```js
    setInterval(function () {
        if (busy || aside.hidden) {
            return;
        }
        var roll = Math.random();
        play(roll < 0.55 ? walk() : roll < 0.85 ? wave : scratch);
    }, 20000);
```

with:

```js
    setInterval(function () {
        if (busy || aside.hidden) {
            return;
        }
        var roll = Math.random();
        // On a quiet chat he says the phrase of the day every third turn or so.
        if (isChat && !mascot.closest('.cn-chat').classList.contains('is-active') && !bubble.textContent && roll < 0.3) {
            say(today()[said % 3], 5000);
            said += 1;
            return;
        }
        play(roll < 0.55 ? walk() : roll < 0.85 ? wave : scratch);
    }, 20000);
```

Finally close the `mount` function and call it. Replace the file's last lines:

```js
    setTimeout(blink, 3000);
})();
```

with:

```js
    setTimeout(blink, 3000);
    };

    Array.prototype.forEach.call(document.querySelectorAll('.gh-community .gh-mascot, .cn-chat .gh-mascot'), mount);
})();
```

Re-indent the body of `mount` by four spaces so the file reads like the others (`npx prettier --check` is not configured for JS; do it by hand or with the editor).

Note: `mascot.hidden = false;` already in the body shows him; in the chat, `.cn-chat` is `hidden` until `chat.js` shows it, which is fine. The `ResizeObserver` on the stage and `home()` already place him over the seat.

- [ ] **Step 2: Give the sidebar heading the seat class and skip the sidebar mascot when the chat is on**

In `partials/community-sidebar.hbs`, change line 28:

```handlebars
    {{#if @custom.community_mascot}}
```

to:

```handlebars
    {{#if @custom.community_mascot}}{{#unless @custom.chat_channel}}
```

and the matching `{{/if}}` (line 35) to:

```handlebars
    {{/unless}}{{/if}}
```

Then add `gh-mascot-seat` to the heading:

```handlebars
        <h2 class="gh-community-title gh-mascot-seat" id="gh-community-title">
```

- [ ] **Step 3: Update the sidebar's mascot comment**

Replace the partial's mascot comment (lines 23–27) with:

```handlebars
    {{!-- anonist, the forum's mascot, sitting on the box's top border on
        desktop (the "Community mascot" setting), or only his mask floating
        there ("Community mascot style"); assets/js/mascot.js moves him and
        shows the phrase of the day on click. With a "Chat channel" set he
        sits on the chat pill instead (partials/chat.hbs). The sprite is
        generated by docs/frames.py in somos-criptonautas/discourse-nautas-mascot. --}}
```

- [ ] **Step 4: Build, gscan, and check both homes**

Run: `pnpm exec gulp build && pnpm test`.
In the browser, desktop width:
- Chat channel empty: the sidebar mascot behaves as before (click → phrase, walks every 20 s).
- Chat channel set: no mascot on the sidebar; anonist sits on the pill's top border over the label, bubble opens to his left and stays inside the viewport; a new message in the forum makes him show "user: first words…" for 5 s within a poll; click on him opens the panel.
- Reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion`): he sits still, no bubble except from a message.
- Under 992 px: no anonist, the mask button shows.

- [ ] **Step 5: Commit**

```bash
git add assets/js/mascot.js partials/community-sidebar.hbs assets/built
git commit -m "Mascot: sits on the sidebar or the chat"
```

---

### Task 7: Final checks and the forum setting

**Files:** none new; this is verification.

- [ ] **Step 1: Forum setting (the site owner does it)**

In the forum admin, Settings → Chat → `chat allowed groups`: add `anonymous_users`. Check anonymously:

```bash
curl -s -H 'Accept: application/json' "https://comunidad.criptonautas.co/chat/api/channels/<id>/messages?page_size=2" | head -c 400
```

Expected: JSON with `"messages"`, not `not_logged_in`.

- [ ] **Step 2: Walk the spec's test list**

- `pnpm test` passes.
- Node test from Task 2 passes.
- Signed out: pill, panel, "Join the conversation".
- Signed in: text box, a message sent and shown.
- A hidden page: no widget.
- Quiet channel (or a channel with old messages): no dot, no avatars pill text only, anonist says a phrase now and then.
- Forum unreachable (DevTools → Network → block `comunidad.criptonautas.co`): pill shows, click opens the forum chat in a new tab, no console errors other than the blocked requests.
- Under 992 px: mask button, full-screen panel, close works.
- Dark mode: pill, panel, bubble readable.
- Keyboard only: Tab reaches the pill, Enter opens, focus lands on close, Esc closes and focus returns to the pill.

- [ ] **Step 3: Zip for upload**

Run: `pnpm zip`
Expected: a fresh theme zip in `dist/`.

- [ ] **Step 4: Commit anything the checks changed**

```bash
git status --short
git add -A assets docs partials locales package.json default.hbs
git commit -m "Chat: fixes from the browser checks"
```

Only if there were changes.
