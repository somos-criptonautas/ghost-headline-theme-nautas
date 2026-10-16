/* Config for the site search modal (assets/js/search-modal.js). A file rather
 * than an inline <script> in site-scripts.hbs: the site's CSP script-src
 * carries sha256 hashes, so an inline block stops running the moment anyone
 * edits it, and the search then boots with no nodes and no key.
 *
 * Host and key come from the "Search host" and "Search key" theme settings,
 * on this script's tag (site-scripts.hbs). The key is search-only and public
 * by design - never an admin key. It must be scoped to every collection below:
 *
 *   curl -X POST https://typesense.criptonautas.co/keys \
 *     -H "X-TYPESENSE-API-KEY: <master>" -H 'Content-Type: application/json' \
 *     -d '{"description":"site search",
 *          "actions":["documents:search"],
 *          "collections":["ghost","discourse_posts","mushin"]}'
 */
window.__NAUTAS_SEARCH_CONFIG__ = {
    typesenseNodes: [{
        host: document.currentScript.getAttribute('data-host'),
        protocol: 'https'
    }],
    typesenseApiKey: document.currentScript.getAttribute('data-key'),

    // Ghost posts, filled by @magicpages/ghost-typesense (indexer only - its
    // own search UI is not used).
    postsCollection: 'ghost',
    // Discourse posts, filled by the discourse-typesense-index plugin. This is
    // the ALIAS name from its typesense_collection setting.
    topicsCollection: 'discourse_posts',
    /* Mushin: Hister's global documents (user 0), mirrored hourly by
     * .github/workflows/sync-mushin.yml. Empty hides the mushin toggle -
     * keep it so until the collection exists and the key above covers it, or
     * Typesense rejects the request and every source comes back empty. */
    mushinCollection: '',
    // PeerTube's public videos, mirrored by .github/workflows/sync-peertube.yml.
    videosCollection: 'videos',

    /* Members-only posts: the indexer stores their whole plaintext, and the key
     * above is public, so a snippet would hand out the paywalled text. Empty
     * this only if the collection has no `visibility` field - Typesense rejects
     * a filter on a field it does not have, and the posts section then shows
     * nothing at all. Check with:
     *   curl -H "X-TYPESENSE-API-KEY: <master>" \
     *     https://typesense.criptonautas.co/collections/ghost | grep visibility
     */
    postsFilter: 'visibility:=public',

    /* Community results in the page's language only (<html lang>: es, en).
     * Keep false until the collection has a `locale` field - the
     * discourse-typesense-index plugin adds it on its next rebuild. Ready when
     * this returns hits rather than "Could not find a filter field named `locale`":
     *   curl -H "X-TYPESENSE-API-KEY: <the key above>" \
     *     "https://typesense.criptonautas.co/collections/discourse_posts/documents/search?q=*&filter_by=locale:=es"
     */
    topicsByLocale: false,

    /* Semantic (hybrid) search, per collection. Keep false until that
     * collection has an `embedding` field: Typesense rejects a query naming a
     * field it does not have, and the section then comes back empty. A
     * collection is ready when this returns hits rather than "Could not find
     * a field named `embedding`":
     *   curl -H "X-TYPESENSE-API-KEY: <the key above>" \
     *     "https://typesense.criptonautas.co/collections/discourse_posts/documents/search?q=hola&query_by=embedding"
     */
    semanticPosts: true,
    semanticTopics: true,
    semanticMushin: true,
    // By the page's language: en.criptonautas.co gets its own.
    commonSearches: /^en/i.test(document.documentElement.lang)
        ? ['how to start', 'how to use Monero', 'crypto trading']
        : ['cómo empezar', 'cómo usar Monero', 'hacer trading']
};
