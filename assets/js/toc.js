/* Post table of contents (the sidebar in post templates). Ships inside
 * main.min.js.
 *
 * Moved out of an inline <script> in site-scripts.hbs: the site's CSP pins
 * inline scripts by hash, so editing one silently stops it running.
 *
 * With fewer than 3 headings there is nothing to navigate: the list hides.
 * The column itself stays on desktop for the reading time and share links;
 * below 992px, where it is a box above the article, it goes entirely (the
 * share links repeat at the end of the article there).
 */
(function () {
    var sidebar = document.getElementById('sidebar-toc');
    var toc = sidebar && sidebar.querySelector('.toc');

    if (!sidebar || !toc) {
        return;
    }

    var headings = document.querySelectorAll('.gh-content.gh-canvas h1, .gh-content.gh-canvas h2');

    if (headings.length < 3) {
        toc.hidden = true;
        sidebar.classList.add('is-toc-empty');
        return;
    }

    // tocbot ships later in the same bundle (tocbot.min.js sorts after this
    // file), so wait for the bundle to finish before calling it.
    document.addEventListener('DOMContentLoaded', function () {
        if (!window.tocbot) {
            return;
        }
        window.tocbot.init({
            tocSelector: '.toc',
            contentSelector: '.gh-content.gh-canvas',
            headingSelector: 'h1,h2',
            hasInnerContainers: true,
            scrollSmooth: true,
            scrollSmoothDuration: 420,
            headingsOffset: 40,
            scrollSmoothOffset: -40
        });
    });
})();
