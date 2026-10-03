/* Back to top (partials/to-top.hbs, posts only). Ships inside main.min.js.
 *
 * Shows after a screen of scrolling; the ring fills with the share of the
 * article (.gh-content) that has scrolled past the bottom of the window.
 * One passive scroll listener, batched to an animation frame.
 */
(function () {
    var button = document.querySelector('.gh-to-top');
    var article = document.querySelector('.gh-content');

    if (!button || !article) {
        return;
    }

    var bar = button.querySelector('.gh-to-top-bar');
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    var queued = false;

    button.hidden = false;

    var update = function () {
        queued = false;

        var rect = article.getBoundingClientRect();
        var read = (window.innerHeight - rect.top) / rect.height;
        var progress = Math.max(0, Math.min(1, read));

        bar.style.strokeDashoffset = String(100 - progress * 100);
        button.classList.toggle('is-visible', window.scrollY > window.innerHeight);
    };

    var queue = function () {
        if (!queued) {
            queued = true;
            window.requestAnimationFrame(update);
        }
    };

    window.addEventListener('scroll', queue, {passive: true});
    window.addEventListener('resize', queue);
    update();

    button.addEventListener('click', function () {
        window.scrollTo({top: 0, behavior: reduceMotion && reduceMotion.matches ? 'auto' : 'smooth'});
        // The button hides near the top: hand focus to the start of the page
        // so keyboard users are not left on a vanished control.
        var start = document.querySelector('.gh-head-logo, #gh-head a');
        if (start) {
            start.focus({preventScroll: true});
        }
    });
})();
