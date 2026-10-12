/* "More articles": each block renders 4 cards and holds posts 5-8 plus its
 * footer link hidden (partials/read-next.hbs). Reveal them once the block
 * comes into view, so the section grows to 8 as the reader reaches it.
 * Ships inside main.min.js.
 */
(function () {
    var blocks = document.querySelectorAll('.gh-read-next');

    if (!blocks.length) {
        return;
    }

    /* Pick the 8 shown out of the 16 fetched, at random per visit. {{#get}}
     * cannot do this server side - Ghost rejected a random option for exactly
     * that reason (TryGhost/Ghost#11130): a URL must render the same HTML, and
     * Cloudflare caches it regardless, so every visitor would share one
     * "random" set until the cache expired. Doing it here sidesteps both.
     *
     * This runs synchronously inside main.min.js, a blocking script at the end
     * of <body>, so the cards are in their final order before first paint -
     * nothing visibly reshuffles.
     */
    var shuffle = function (list) {
        for (var i = list.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var swap = list[i];
            list[i] = list[j];
            list[j] = swap;
        }
        return list;
    };

    var cards = function (block) {
        return Array.prototype.slice.call(block.querySelectorAll('.gh-card'));
    };

    // Lays the cards out in this order: 4 shown, 4 revealed on scroll, the
    // rest kept hidden in the pool.
    var place = function (block, list) {
        var grid = block.querySelector('.gh-topic-content');
        var rest = block.querySelector('.gh-read-next-rest');
        var pool = block.querySelector('.gh-read-next-pool');

        if (!grid || !rest) {
            return;
        }

        list.forEach(function (card, i) {
            if (i < 4) {
                // Straight into the grid, before the hidden group.
                grid.insertBefore(card, rest);
            } else if (i < 8 || !pool) {
                rest.appendChild(card);
            } else {
                pool.appendChild(card);
            }
        });
    };

    // No pool means 8 or fewer posts matched: there is nothing to pick from.
    var pick = function (block) {
        if (block.querySelector('.gh-read-next-pool')) {
            place(block, shuffle(cards(block)));
        }
    };

    for (var p = 0; p < blocks.length; p++) {
        pick(blocks[p]);
    }

    /* Blocks with data-similar-to: the posts nearest in meaning first, from
     * the search index (search-config.js, loaded after this bundle - hence
     * DOMContentLoaded). Typesense ranks the post's own embedding against the
     * others; pages and posts that are not on this list keep the random order
     * after them. Any failure leaves the random order. The block is at the
     * end of the article, so the reorder happens out of sight. */
    var similar = function (block) {
        var cfg = window.__NAUTAS_SEARCH_CONFIG__;
        var node = cfg && cfg.typesenseNodes && cfg.typesenseNodes[0];
        var id = block.getAttribute('data-similar-to');

        if (!node || !node.host || !cfg.typesenseApiKey || !cfg.postsCollection || !cfg.semanticPosts || !/^[0-9a-f]{24}$/.test(id) || !window.fetch) {
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
            var list = cards(block).map(function (card, i) {
                return {card: card, at: at(card), i: i};
            });
            // Stable: equal ranks keep their current (random) order.
            list.sort(function (a, b) {
                return a.at - b.at || a.i - b.i;
            });
            place(block, list.map(function (item) {
                return item.card;
            }));
        }).catch(function () {});
    };

    document.addEventListener('DOMContentLoaded', function () {
        for (var s = 0; s < blocks.length; s++) {
            if (blocks[s].hasAttribute('data-similar-to')) {
                similar(blocks[s]);
            }
        }
    });

    var reveal = function (block) {
        var parts = block.querySelectorAll('.gh-read-next-rest, .gh-topic-footer');
        for (var i = 0; i < parts.length; i++) {
            parts[i].removeAttribute('hidden');
        }
    };

    // No IntersectionObserver (Safari < 12.1): show everything up front rather
    // than leave half the section unreachable.
    if (!('IntersectionObserver' in window)) {
        for (var i = 0; i < blocks.length; i++) {
            reveal(blocks[i]);
        }
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                reveal(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {rootMargin: '200px'});

    for (var j = 0; j < blocks.length; j++) {
        observer.observe(blocks[j]);
    }
})();
