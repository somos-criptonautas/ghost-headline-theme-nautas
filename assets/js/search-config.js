/* Config for the site search modal (assets/js/search-modal.js). A file rather
 * than an inline <script> in site-scripts.hbs: the site's CSP script-src
 * carries sha256 hashes, so an inline block stops running the moment anyone
 * edits it, and the search then boots with no nodes and no key.
 *
 * Both API keys below are search-only and public by design - never put an
 * admin key here. The key must be scoped to BOTH collections:
 *
 *   curl -X POST https://typesense.criptonautas.co/keys \
 *     -H "X-TYPESENSE-API-KEY: <master>" -H 'Content-Type: application/json' \
 *     -d '{"description":"site search",
 *          "actions":["documents:search"],
 *          "collections":["ghost","discourse_posts"]}'
 */
window.__NAUTAS_SEARCH_CONFIG__ = {
    typesenseNodes: [{
        host: 'typesense.criptonautas.co',
        protocol: 'https'
    }],
    typesenseApiKey: '8hPtZRIeBeU4MM7c6Fy9viwynvG1F2F4',

    // Ghost posts, filled by @magicpages/ghost-typesense (indexer only - its
    // own search UI is not used).
    postsCollection: 'ghost',
    // Discourse posts, filled by the discourse-typesense-index plugin. This is
    // the ALIAS name from its typesense_collection setting.
    topicsCollection: 'discourse_posts',
    // Where "see all discussions" goes. Empty hides that link.
    forumUrl: 'https://comunidad.criptonautas.co',

    /* Members-only posts: the indexer stores their whole plaintext, and the key
     * above is public, so a snippet would hand out the paywalled text. Empty
     * this only if the collection has no `visibility` field - Typesense rejects
     * a filter on a field it does not have, and the posts section then shows
     * nothing at all. Check with:
     *   curl -H "X-TYPESENSE-API-KEY: <master>" \
     *     https://typesense.criptonautas.co/collections/ghost | grep visibility
     */
    // Empty while the ghost collection has no `visibility` field (a custom
    // `fields` list in ghost-typesense.config.json replaced the default schema).
    // All indexed posts are public; restore the filter once the field is back.
    postsFilter: '',

    maxPosts: 4,
    maxTopics: 5,

    /* Semantic (hybrid) search, per collection. Keep false until that
     * collection has an `embedding` field: Typesense rejects a query naming a
     * field it does not have, and the section then comes back empty. A
     * collection is ready when this returns hits rather than "Could not find
     * a field named `embedding`":
     *   curl -H "X-TYPESENSE-API-KEY: <the key above>" \
     *     "https://typesense.criptonautas.co/collections/discourse_posts/documents/search?q=hola&query_by=embedding"
     */
    semanticPosts: false,
    semanticTopics: true,
    commonSearches: ['cómo empezar', 'cómo usar Monero', 'hacer trading']
};
