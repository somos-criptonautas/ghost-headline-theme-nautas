/* Tablet/mobile header bar behaviour, and the search modal's styling.
 * Ships inside main.min.js.
 */
(function () {
    /* 1. Search field. The bar has a real input, but results live in the
     *    MagicPages search modal, so the first keystroke hands the text over
     *    and the modal takes focus - one search UI, not two. openModal and
     *    applyUrlQuery are what the search UI itself uses for #/search/<query>
     *    links; if a future build renames them, fall back to opening the modal
     *    the way any [data-ghost-search] button does.
     */
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

    /* 3. Search modal, styled like the open menu: page background and text
     *    colour, the site font, the header field's rounded input, and no blue
     *    accent - titles, highlights and focus take the text colour instead.
     *    The MagicPages UI renders into an open shadow root, so page CSS
     *    cannot reach it, and .github/workflows/update-typesense.yml replaces
     *    its file weekly, so the file must not be edited either. An adopted
     *    stylesheet applies on top of whatever build is installed and cascades
     *    after the UI's own <style> elements. Overriding the UI's own custom
     *    properties restyles every part that reads them. Colours come in
     *    through the --nautas-* properties set on the host in screen.css. The
     *    workflow refuses a build that no longer has .mp-search-input, so a
     *    rename upstream cannot silently drop the input styling.
     */
    var SEARCH_CSS =
        '.mp-search-modal,.mp-search-modal.mp-search-dark{' +
            '--color-surface:var(--nautas-bg);' +
            '--color-surface-elevated:var(--nautas-bg);' +
            '--color-surface-hover:var(--nautas-bg-alt);' +
            '--color-text:var(--nautas-text);' +
            '--color-text-secondary:var(--nautas-text-muted);' +
            '--color-border:var(--nautas-border);' +
            '--color-backdrop:var(--nautas-backdrop);' +
            '--accent-color:var(--nautas-text);' +
            '--accent-color-hover:var(--nautas-text);' +
            '--color-result-bg:var(--nautas-bg);' +
            '--color-result-hover:var(--nautas-bg-alt);' +
            'font-family:var(--nautas-font)}' +
        '.mp-search-input,.mp-search-input:focus,.mp-search-input:focus-visible{' +
            'background:var(--nautas-bg-alt);' +
            'border:1px solid var(--nautas-border);' +
            'border-radius:999px;' +
            'box-shadow:none;' +
            'outline:none}' +
        '.mp-search-input:focus,.mp-search-input:focus-visible{' +
            'border-color:var(--nautas-focus)}';

    var styleSearch = function (host) {
        var shadow = host.shadowRoot;
        // Constructable stylesheets: Safari 16.4+. Older browsers keep the
        // modal's own styling, which is still fully usable.
        if (!shadow || !('adoptedStyleSheets' in shadow) || typeof CSSStyleSheet.prototype.replaceSync !== 'function') {
            return;
        }
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(SEARCH_CSS);
        shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.concat(sheet);
    };

    if (window.customElements) {
        // The element is defined by typesense-search.min.js (deferred, so it
        // runs after this bundle) and appended to <body> just after.
        window.customElements.whenDefined('magicpages-search').then(function () {
            var tries = 0;
            var find = function () {
                var host = window.magicPagesSearch || document.querySelector('magicpages-search');
                if (host) {
                    styleSearch(host);
                } else if (tries++ < 50) {
                    window.setTimeout(find, 100);
                }
            };
            find();
        });
    }
})();
