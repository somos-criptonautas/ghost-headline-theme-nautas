/* Post table of contents (the sidebar in post templates). Ships inside
 * main.min.js.
 *
 * Moved out of an inline <script> in site-scripts.hbs: the site's CSP pins
 * inline scripts by hash, so editing one silently stops it running.
 *
 * With fewer than 3 headings there is nothing to navigate, so the whole
 * column goes at every width, and the share links show at the end of the
 * article instead (.is-toc-empty / .has-no-toc in post.css).
 */
(function () {
    var sidebar = document.getElementById('sidebar-toc');
    var toc = sidebar && sidebar.querySelector('.toc');

    if (!sidebar || !toc) {
        return;
    }

    var headings = document.querySelectorAll('.gh-content.gh-canvas h1, .gh-content.gh-canvas h2');

    if (headings.length < 3) {
        sidebar.classList.add('is-toc-empty');
        document.body.classList.add('has-no-toc');
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
