/* Tablet/mobile header bar behaviour.
 * Ships inside main.min.js.
 */
(function () {
    /* 1. Search field. The bar has a real input, but results live in the
     *    search modal, so the first keystroke hands the text over and the
     *    modal takes focus - one search UI, not two. window.nautasSearch is
     *    defined by assets/js/search-modal.js, which loads deferred and so
     *    runs after this bundle; until then, clicking the modal's own trigger
     *    is the fallback.
     */
    var form = document.querySelector('.gh-head-search-field');
    var input = form && form.querySelector('input');

    if (input) {
        var handOff = function () {
            var query = input.value;
            input.value = '';
            input.blur();

            if (window.nautasSearch && typeof window.nautasSearch.open === 'function') {
                window.nautasSearch.open(query);
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

    /* 2. Bar position. Up to 991px the bar is fixed to the viewport (header
     *    block in screen.css). Ghost renders its announcement bar above
     *    .gh-site, so a bar pinned at top:0 covered it. --head-top follows the
     *    bottom edge of whatever sits above .gh-site until it scrolls away,
     *    then stays at 0. Unused on desktop, where the header is not fixed.
     */
    var site = document.querySelector('.gh-site');

    if (site) {
        var root = document.documentElement;
        var queued = false;

        var place = function () {
            queued = false;
            root.style.setProperty('--head-top', Math.max(0, site.getBoundingClientRect().top) + 'px');
        };

        var schedule = function () {
            if (!queued) {
                queued = true;
                window.requestAnimationFrame(place);
            }
        };

        place();
        window.addEventListener('scroll', schedule, {passive: true});
        window.addEventListener('resize', schedule);

        // The announcement bar is injected by Ghost's own script, after this runs.
        if ('ResizeObserver' in window) {
            new ResizeObserver(schedule).observe(document.body);
        }
    }

    /* 3. Hide-on-scroll for the fixed bar, via headroom.js. Only up to 991px:
     *    that is where #gh-head is position: fixed, so there is something to
     *    hide. On desktop the header is static and scrolls away by itself.
     *
     *    headroom.js is vendored in assets/js/main.js, which the bundle
     *    concatenates AFTER this file, so window.Headroom does not exist yet -
     *    hence the DOMContentLoaded wrapper, by which time the whole bundle has
     *    run. The transform pairs with the --head-top offset above rather than
     *    fighting it: one sets top, the other translates.
     */
    document.addEventListener('DOMContentLoaded', function () {
        var head = document.getElementById('gh-head');
        var bar = window.matchMedia('(max-width: 991px)');
        var headroom = null;

        if (!head || !window.Headroom || !window.Headroom.cutsTheMustard) {
            return;
        }

        var apply = function () {
            if (bar.matches && !headroom) {
                // A little tolerance upwards so a stray pixel does not flap it.
                headroom = new window.Headroom(head, {
                    tolerance: {up: 5, down: 0},
                    offset: 64
                });
                headroom.init();
            } else if (!bar.matches && headroom) {
                headroom.destroy();
                headroom = null;
            }
        };

        apply();
        bar.addEventListener('change', apply);
    });

})();
