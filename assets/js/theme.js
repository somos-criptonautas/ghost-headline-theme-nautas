/* Light/dark theme.
 *
 * This lives in its own file rather than inline in default.hbs on purpose.
 * The site's CSP script-src carries sha256 hashes, and per the CSP spec a
 * hash or nonce makes the browser ignore 'unsafe-inline' - so an inline
 * script only runs if its exact hash is allowlisted. Editing an inline
 * script silently breaks it until someone updates the CSP. The CSP already
 * allows https://criptonautas.co/assets/, so a file under /assets/ needs no
 * CSP change now or on any future edit.
 *
 * Loaded blocking in <head> (no defer/async) so the theme is set before the
 * first paint and there is no flash of the wrong one.
 *
 * Not bundled into main.min.js - gulpfile.js excludes it from the js task.
 * The bundle runs at the end of <body>, which would both be too late and
 * register the click handler a second time, cancelling every toggle.
 */
(function () {
    var media = window.matchMedia('(prefers-color-scheme: dark)');

    // Progressive-enhancement hook for anything that only makes sense with
    // scripting - currently the .gh-loadmore fallback links, which infinite
    // scroll makes redundant. Set here rather than in main.min.js because this
    // file is the one that runs blocking in <head>, so the class is present
    // before first paint and the link never flashes.
    document.documentElement.classList.add('js');

    function chosen() {
        try {
            var v = localStorage.getItem('selected-theme');
            return v === 'light' || v === 'dark' ? v : null;
        } catch (e) {
            return null; // storage blocked (private mode, cookie settings)
        }
    }

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    // An explicit choice wins and is remembered; otherwise follow the OS.
    apply(chosen() || (media.matches ? 'dark' : 'light'));

    // Keep following the OS while no explicit choice has been made.
    media.addEventListener('change', function (e) {
        if (!chosen()) {
            apply(e.matches ? 'dark' : 'light');
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        var toggle = document.querySelector('.it-dark-light');
        if (!toggle) {
            return;
        }
        toggle.addEventListener('click', function () {
            var next = document.documentElement.getAttribute('data-theme') === 'dark'
                ? 'light'
                : 'dark';
            try {
                localStorage.setItem('selected-theme', next);
            } catch (e) {
                // fall through: the theme still applies for this page view
            }
            apply(next);
        });
    });
})();
