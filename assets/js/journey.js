/* Journey series (partials/journey.hbs). Ships inside main.min.js.
 *
 * The top nav holds the chapters in order. On the hub (a page not in that
 * list) it shows as cards with a start link; on a chapter it becomes a
 * "chapter N of M" stepper with the current one marked, and the bottom nav
 * gets previous / next - the hub before the first chapter and after the last.
 */
(function () {
    var top = document.querySelector('.gh-journey[data-place="top"]');
    if (!top) {
        return;
    }
    var bottom = document.querySelector('.gh-journey[data-place="bottom"]');
    var links = Array.prototype.slice.call(top.querySelectorAll('.gh-journey-link'));
    if (!links.length) {
        return;
    }

    var label = function (name) {
        return top.getAttribute('data-label-' + name) || '';
    };
    var path = function (href) {
        return new URL(href, window.location.href).pathname.replace(/\/?$/, '/');
    };
    // Chapter titles read "Journey -> La partida": the series name is already around them.
    var titles = links.map(function (link, i) {
        link.querySelector('.gh-journey-num').textContent = String(i + 1).padStart(2, '0');
        var node = link.querySelector('.gh-journey-title');
        node.textContent = node.textContent.replace(/^\s*journey\s*-*>\s*/i, '');
        return node.textContent;
    });

    var here = path(window.location.href);
    var current = -1;
    links.forEach(function (link, i) {
        if (path(link.href) === here) {
            current = i;
        }
    });

    if (current < 0) {
        top.classList.add('is-hub');
        var start = top.querySelector('.gh-journey-start');
        start.href = links[0].href;
        start.hidden = false;
        top.hidden = false;
        return;
    }

    top.classList.add('is-chapter');
    links[current].setAttribute('aria-current', 'page');
    top.querySelector('.gh-journey-counter').textContent =
        label('chapter') + ' ' + (current + 1) + ' ' + label('of') + ' ' + links.length;
    top.hidden = false;

    if (!bottom) {
        return;
    }

    var hub = top.getAttribute('data-hub');
    var step = function (index, direction) {
        var a = document.createElement('a');
        a.className = 'gh-journey-pager gh-journey-pager--' + direction;
        var inSeries = index >= 0 && index < links.length;
        a.href = inSeries ? links[index].href : hub;
        var kicker = document.createElement('span');
        kicker.className = 'gh-journey-pager-label';
        kicker.textContent = direction === 'prev' ? '← ' + label('previous') : label('next') + ' →';
        var title = document.createElement('span');
        title.className = 'gh-journey-pager-title';
        title.textContent = inSeries ? String(index + 1).padStart(2, '0') + ' - ' + titles[index] : label('hub');
        a.appendChild(kicker);
        a.appendChild(title);
        return a;
    };
    bottom.appendChild(step(current - 1, 'prev'));
    bottom.appendChild(step(current + 1, 'next'));
    bottom.hidden = false;
})();
