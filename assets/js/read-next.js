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
