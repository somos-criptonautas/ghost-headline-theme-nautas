/* Config for the MagicPages search UI (typesense-search.min.js, deferred, so
 * it runs after this bundle). A file rather than an inline <script> in
 * site-scripts.hbs: the site's CSP script-src carries sha256 hashes, so an
 * inline block stops running the moment anyone edits it, and the search then
 * boots with no nodes and no key. The API key is search-only and public by
 * design - never put an admin key here.
 */
window.__MP_SEARCH_CONFIG__ = {
    typesenseNodes: [{
        host: 'typesense.criptonautas.co',
        protocol: 'https'
    }],
    typesenseApiKey: '8hPtZRIeBeU4MM7c6Fy9viwynvG1F2F4',
    collectionName: 'ghost',
    theme: 'system',
    enableHighlighting: true,
    commonSearches: ['cómo empezar', 'cómo usar Monero', 'hacer trading']
};
