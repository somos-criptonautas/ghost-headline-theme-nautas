/* Post table of contents (the sidebar in post templates). Ships inside
 * main.min.js.
 *
 * Moved out of an inline <script> in site-scripts.hbs: the site's CSP pins
 * inline scripts by hash, so editing one silently stops it running.
 *
 * The TOC lists h1/h2; a text with fewer than 3 of those but subheadings
 * under them (the journey's epilogue: one h2, then h3s) lists h3 too.
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

    var count = function (levels) {
        return document.querySelectorAll(levels.split(',').map(function (h) {
            return '.gh-content.gh-canvas ' + h;
        }).join(',')).length;
    };
    var levels = count('h1,h2') < 3 ? 'h1,h2,h3' : 'h1,h2';

    if (count(levels) < 3) {
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
            headingSelector: levels,
            hasInnerContainers: true,
            scrollSmooth: true,
            scrollSmoothDuration: 420,
            headingsOffset: 40,
            scrollSmoothOffset: -40
        });
    });
})();
