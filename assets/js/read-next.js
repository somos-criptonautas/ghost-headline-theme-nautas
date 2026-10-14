/* "More articles" (partials/read-next.hbs): the cards nearest in meaning to
 * this post first, from the search index (search-config.js, loaded after
 * this bundle - hence DOMContentLoaded). Typesense ranks the post's own
 * embedding against the others; cards not on its list keep their order
 * after them. Any failure leaves the newest first. Ships inside main.min.js.
 */
(function () {
    var block = document.querySelector('.gh-read-next[data-similar-to]');
    var list = block && block.querySelector('.gh-topic-content');

    if (!list || !window.fetch) {
        return;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var cfg = window.__NAUTAS_SEARCH_CONFIG__;
        var node = cfg && cfg.typesenseNodes && cfg.typesenseNodes[0];
        var id = block.getAttribute('data-similar-to');

        if (!node || !node.host || !cfg.typesenseApiKey || !cfg.postsCollection || !cfg.semanticPosts || !/^[0-9a-f]{24}$/.test(id)) {
            return;
        }

        var search = {
            collection: cfg.postsCollection,
            q: '*',
            vector_query: 'embedding:([], id: ' + id + ', k: 24)',
            include_fields: 'url',
            per_page: 24
        };
        if (cfg.postsFilter) {
            search.filter_by = cfg.postsFilter;
        }

        fetch((node.protocol || 'https') + '://' + node.host + '/multi_search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': cfg.typesenseApiKey},
            body: JSON.stringify({searches: [search]})
        }).then(function (response) {
            return response.ok ? response.json() : null;
        }).then(function (body) {
            var hits = body && body.results && body.results[0] && body.results[0].hits;
            if (!hits || !hits.length) {
                return;
            }
            var rank = {};
            hits.forEach(function (hit, i) {
                try {
                    rank[new URL(hit.document.url, location.href).pathname] = i;
                } catch (e) {}
            });
            var at = function (card) {
                var link = card.querySelector('.gh-card-link');
                var path = link ? new URL(link.href, location.href).pathname : '';
                return path in rank ? rank[path] : hits.length;
            };
            Array.prototype.slice.call(list.querySelectorAll('.gh-card')).map(function (card, i) {
                return {card: card, at: at(card), i: i};
            }).sort(function (a, b) {
                // Stable: equal ranks keep their current order.
                return a.at - b.at || a.i - b.i;
            }).forEach(function (item) {
                list.appendChild(item.card);
            });
        }).catch(function () {});
    });
})();
