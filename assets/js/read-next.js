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

    var pick = function (block) {
        var grid = block.querySelector('.gh-topic-content');
        var rest = block.querySelector('.gh-read-next-rest');
        var pool = block.querySelector('.gh-read-next-pool');

        // No pool means 8 or fewer posts matched: there is nothing to pick from.
        if (!grid || !rest || !pool) {
            return;
        }

        shuffle(Array.prototype.slice.call(grid.querySelectorAll('.gh-card')))
            .forEach(function (card, i) {
                if (i < 4) {
                    // Straight into the grid, before the hidden group.
                    grid.insertBefore(card, rest);
                } else if (i < 8) {
                    rest.appendChild(card);
                } else {
                    pool.appendChild(card);
                }
            });

        pool.parentNode.removeChild(pool);
    };

    for (var p = 0; p < blocks.length; p++) {
        pick(blocks[p]);
    }

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
