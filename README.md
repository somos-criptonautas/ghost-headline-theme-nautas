# ghost-headline-theme-nautas

**ENGLISH** | [ESPAÑOL](README.es.md)

Maintained by Criptonautas. Not affiliated with or endorsed by the Ghost Foundation.

The Ghost theme behind [criptonautas.co](https://criptonautas.co). It started as a fork of
Ghost's [Headline](https://github.com/TryGhost/Themes/tree/main/packages/headline) and has
diverged enough that it is now maintained as its own theme rather than a skin on top of it.

> [!WARNING]
> **Work in progress.** The project ran as an experiment for a long time and is only now
> entering a maintained stage. Expect this file, the templates and the CSS to keep moving
> until a version is tagged as final. Nothing here is a stable API — fork it and adapt it,
> but pin a commit if you depend on it.

Upstream Headline was built for local news: many topics, dense grids, lots of content
surfaces. This fork keeps its skeleton and its shared asset pipeline, and rebuilds the
reading experience around a single long-form Spanish-language publication — bigger type,
fewer boxes, more whitespace.

## What differs from upstream Headline

**Reading experience**
- Reading measure of about 70 characters, headings on a 1.25 scale, base type in `rem` on a
  `71%` root.
- Table of contents in a sticky column on posts (`tocbot`), width set by `--toc-width` in
  `assets/css/vars.css`. Posts without headings drop the column and stay centred.
- Light/dark theme that follows the OS and remembers an explicit choice (`assets/js/theme.js`;
  see the CSP note for why it is a file).
- Difficulty from the `#nivel-1/2/3` tags, shown as dots on cards and a band on the feature
  image; level switches on `/blog` filter the list.
- Glossary: the first mention of a term from the forum's `blog-glosario` tag gets a dotted
  underline and a definition card (`assets/js/glossary.js`).
- Lightbox on PhotoSwipe 5, only for images with more to see.
- Native link prefetch and a hide-on-scroll header, no extra libraries.
- The mobile navigation breakpoint moves from `767px` to `991px`, via a small PostCSS plugin
  in `gulpfile.js` scoped to the shared nav CSS only.

**Pages and templates**

The home is a landing built from the page `inicio`: site title as headline, questions,
members' voices from the forum, the three ways in, featured posts and forum topics. `/blog`
lists every post with the community beside it (aside) or above it (strip).

| Template | Purpose |
| --- | --- |
| `custom-full-feature-image.hbs` | Full-bleed cover with the title over the image |
| `custom-wide-feature-image.hbs` | Wide image below the header |
| `custom-post-plain.hbs` | No feature image |
| `custom-post-no-suggested.hbs` | Post without the related-posts footer |
| `custom-collection.hbs` | Series hub: chapter cards (tarot style), stepper and previous/next with images. The series comes from the page's internal tag |
| `custom-videos.hbs` | PeerTube videos with channel chips, Random/Tendencia/Recientes and load more |
| `custom-authors` / `custom-tags` | Archive listings |

**Forum integration** ([Discourse](https://comunidad.criptonautas.co))
- Comments as an embedded iframe that loads from 70% scroll and follows the blog's
  light/dark (`assets/js/discourse-embed.js`; the forum half is `common/head_tag.html` in
  discourse-horizon-mod-nautas).
- Emoji reactions from the post's forum topic, with the forum's set.
- Community topics beside the home and tag pages, opened in a dialog; members-only topics
  only for signed-in members. Needs CORS on the forum.
- Channel icons from the forum categories on cards, sections, tag pages and breadcrumbs.
- Monero tips through the discourse-monero-tips plugin, on author pages and reactions.

**Search** — Typesense modal with blog, community and video sources. Community results open
in a reader inside the modal with the forum's AI summary; videos play in it, from the second that matched.

**Other**
- Service status panel on `/stack`, fed by an n8n check.
- Desktop feedback tab (idea, error or support, optional screenshot) sent to an n8n webhook.
- Newsletter signup cards posting to a Keila form.
- Webmentions, LinkedIn and Fediverse share links.

**Ghost Portal is disabled** (`{{ghost_head exclude="portal"}}`). Membership flows are
handled by the custom pages above and by BTCPay instead.

### Theme settings

| Setting | |
| --- | --- |
| `discourse_url` | Forum for comments, reactions, community lists and tips. Empty turns them off |
| `discourse_comments`, `discourse_reactions` | Toggle each one |
| `community_sidebar` | What the community aside lists |
| `community_mascot` | anonist on the aside on desktop: `Off`, `Figure` (sits, walks) or `Mask` (floats, glides, spins). With a chat channel, his mask moves to the chat |
| `community_hidden_categories` | Forum category ids left out of every community list |
| `monero_tips_username` | Forum account that receives tips. Empty hides them |
| `search_host`, `search_key` | Typesense host and **search-only** key. Empty: Ghost's own search |
| `peertube_source` | PeerTube URL for the videos page, optionally `\| category ids` |
| `newsletter_form` | Keila form address for the signup cards |
| `feedback_webhook` | n8n webhook for the feedback tab |
| `dark_logo`, `github_url`, `footer_note` | Footer and logo |

### Scheduled workflows

| Workflow | When | What |
| --- | --- | --- |
| `sync-peertube.yml` | every 3 h | PeerTube videos (with AI summaries) and their caption chunks into the search index. Chunks off until `VIDEO_CHUNKS` is set. Spanish and English for each video (captions uploaded to PeerTube) with `VIDEO_TRANSLATE`, videos per run, plus the `PEERTUBE_USER` and `PEERTUBE_PASSWORD` secrets for the captions |
| `sync-mushin.yml` | hourly | Hister's documents into Typesense. Off until `HISTER_URL` is set |
| `update-search-vendor.yml` | Mondays | InstantSearch.js and the Typesense adapter, majors pinned; pushes `vendor/search-update` with a compare link in the run summary, deploys only once you open and merge a PR |

## Development

Requires **Node 22+** (pinned in `.nvmrc`; `cssnano` uses `Set.prototype.difference`, which
lands in 22) and **pnpm**.

```bash
pnpm install
pnpm dev     # build + watch
pnpm test    # gscan theme validation
pnpm zip     # package for manual upload
```

Edit source CSS in `assets/css/`, JS in `assets/js/`, and the `.hbs` templates. Anything in
`assets/built/` is generated — but it **is** committed, because that is what ships to Ghost.
Always commit a rebuild alongside source changes.

`assets/js/*.js` is concatenated into `built/main.min.js`, with two deliberate exceptions:
`theme.js` is excluded (it loads on its own in `<head>` before first paint, and bundling it
would register the theme toggle twice), and file order is controlled by
`ordered-read-streams` so vendor libraries land before the code that calls them.

### Two things that will bite you

**Do not let Prettier format `.hbs` files.** It rewrites helper arguments inside HTML
attributes — `{{social_url type="twitter"}}` becomes `{{social_url type=" twitter"}}`, and
`{{{block "body_class"}}}` becomes `{{{block " body_class"}}}`. Ghost uses those values
verbatim, so the result is silently broken output, not an error. `.prettierignore` excludes
`*.hbs` for this reason; keep it that way.

**Inline `<script>` blocks are blocked by the site's CSP.** The `script-src` policy carries
sha256 hashes, and per the CSP spec a hash makes the browser ignore `'unsafe-inline'`. Only
inline scripts whose exact hash is allowlisted will run, so editing one silently disables it.
Put new JS in a file under `assets/` — the policy already allows that path.

## Deployment

Pushing to `main` runs `.github/workflows/deploy-theme.yml`, which uploads the theme to Ghost
over the Admin API.

Two details are load-bearing:

- **`theme-name` must match the active theme's id in Ghost.** Ghost keys a theme on the
  uploaded zip's filename, and only re-activates it when that id matches the active one.
  A mismatch installs a second, inactive theme — the run goes green and the site never
  changes.
- **`/ghost/` must not sit behind a forward-auth proxy for the Admin API path.** If it does,
  the upload is redirected to a login page, the action reads the 2xx as success, and nothing
  reaches Ghost. A preflight step fails the build loudly when it detects this instead of
  letting it pass silently.

## Credits

Based on [Headline](https://github.com/TryGhost/Themes/tree/main/packages/headline) by the
Ghost Foundation. Theme translations come from `@tryghost/theme-translations`.

## Copyright & License

Copyright (c) 2013-2026 Ghost Foundation — released under the [MIT license](LICENSE).

Text of this README under [CC BY-NC-SA 4.0](CC-BY-NC-SA-4.0.txt).
