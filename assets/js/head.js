/* Tablet/mobile header bar behaviour. Ships inside main.min.js.
 *
 * 1. Search field. The bar has a real input, but results live in the
 *    MagicPages search modal, so the first keystroke hands the text over and
 *    the modal takes focus - one search UI, not two. openModal/applyUrlQuery
 *    are what the search UI itself uses for #/search/<query> links; if a
 *    future build renames them, fall back to opening the modal the way any
 *    [data-ghost-search] button does.
 *
 * 2. Header over a cover. Up to 991px the bar is fixed to the top, so once
 *    the cover scrolls out from under it a transparent bar would sit on the
 *    article text. is-head-transparent is dropped while the cover is out of view and
 *    restored when it returns. Layout is held by is-head-overlay, which never
 *    changes, so the toggle cannot shift the page. Desktop is left alone: its
 *    header is not fixed.
 */
(function () {
    var form = document.querySelector('.gh-head-search-field');
    var input = form && form.querySelector('input');

    if (input) {
        var handOff = function () {
            var search = window.magicPagesSearch;
            var query = input.value;
            input.value = '';
            input.blur();

            if (search && typeof search.openModal === 'function' && typeof search.applyUrlQuery === 'function') {
                Promise.resolve(search.openModal()).then(function () {
                    search.applyUrlQuery(query);
                });
                return;
            }

            var trigger = document.querySelector('[data-ghost-search]');
            if (trigger) {
                trigger.click();
            }
        };

        input.addEventListener('input', handOff);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            handOff();
        });
    }

    var body = document.body;
    var cover = document.querySelector('.gh-cover');

    if (cover && body.classList.contains('is-head-overlay') && 'IntersectionObserver' in window) {
        var narrow = window.matchMedia('(max-width: 991px)');
        var pastCover = false;

        var sync = function () {
            body.classList.toggle('is-head-transparent', !(narrow.matches && pastCover));
        };

        // The top margin approximates the bar height, so the background comes
        // in as the cover's bottom edge passes under the bar, not after it.
        new IntersectionObserver(function (entries) {
            pastCover = !entries[0].isIntersecting;
            sync();
        }, {rootMargin: '-72px 0px 0px 0px'}).observe(cover);

        narrow.addEventListener('change', sync);
    }
})();
