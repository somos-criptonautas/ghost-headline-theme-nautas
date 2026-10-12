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
        // A tap alone opens the modal too, so its common searches show before
        // anything is typed; it is a user gesture, so mobile keeps the keyboard up.
        input.addEventListener('click', handOff);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            handOff();
        });
    }

    /* 1b. Desktop search bar: name the shortcut the modal answers to on this
     *     platform (it takes both Cmd and Ctrl). */
    var key = document.querySelector('.gh-search-bar-key');
    if (key) {
        key.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
        key.hidden = false;
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

    /* 3. Hide-on-scroll for the fixed bar. Only up to 991px: that is where
     *    #gh-head is position: fixed, so there is something to hide. On
     *    desktop the header is static and scrolls away by itself.
     *
     *    Down past the first 64px hides it (.is-unpinned, screen.css); up by
     *    more than 5px, or back near the top, shows it again - the small
     *    tolerance keeps a stray pixel from flapping it. Overscroll (iOS
     *    bounce, past either end) is ignored. headroom.js did this before.
     */
    var head = document.getElementById('gh-head');
    var bar = window.matchMedia('(max-width: 991px)');

    if (head) {
        var OFFSET = 64;
        var TOLERANCE_UP = 5;
        var lastY = window.scrollY;
        var ticking = false;

        var update = function () {
            ticking = false;
            var y = Math.round(window.scrollY);
            var max = document.documentElement.scrollHeight - window.innerHeight;
            if (!bar.matches || y < 0 || y > max) {
                lastY = y;
                return;
            }
            if (y <= OFFSET || lastY - y > TOLERANCE_UP) {
                head.classList.remove('is-unpinned');
            } else if (y > lastY) {
                head.classList.add('is-unpinned');
            }
            lastY = y;
        };

        window.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(update);
            }
        }, {passive: true});

        // Back to desktop: nothing to hide.
        bar.addEventListener('change', function () {
            head.classList.remove('is-unpinned');
            lastY = window.scrollY;
        });
    }

})();
