/* Page series (partials/collection.hbs, custom-collection.hbs). Ships inside
 * main.min.js.
 *
 * The top nav holds the chapters in order. On the hub (a page not in that
 * list) it shows as cards, with "next" into the first chapter below. On a
 * chapter it stays hidden and only feeds previous / next: the hub before the
 * first chapter and after the last. Each step carries its chapter's image.
 */
(function () {
    var top = document.querySelector('.gh-collection[data-place="top"]');
    if (!top) {
        return;
    }
    var bottom = document.querySelector('.gh-collection[data-place="bottom"]');
    var links = Array.prototype.slice.call(top.querySelectorAll('.gh-collection-link'));
    if (!links.length) {
        return;
    }

    var label = function (name) {
        return top.getAttribute('data-label-' + name) || '';
    };
    var path = function (href) {
        return new URL(href, window.location.href).pathname.replace(/\/?$/, '/');
    };
    // Titles like "Journey -> La partida" repeat the series name the page already shows.
    var titles = links.map(function (link, i) {
        link.querySelector('.gh-collection-num').textContent = String(i + 1).padStart(2, '0');
        var node = link.querySelector('.gh-collection-title');
        node.textContent = node.textContent.replace(/^[^>]{0,40}?-+>\s*/, '');
        return node.textContent;
    });

    var hub = top.getAttribute('data-hub');
    var step = function (index, direction) {
        var a = document.createElement('a');
        a.className = 'gh-collection-pager gh-collection-pager--' + direction;
        var inSeries = index >= 0 && index < links.length;
        a.href = inSeries ? links[index].href : hub;

        var image = inSeries && links[index].querySelector('.gh-collection-image');
        if (image) {
            var thumb = document.createElement('img');
            thumb.className = 'gh-collection-pager-image';
            thumb.src = image.src;
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            a.appendChild(thumb);
        }

        var text = document.createElement('span');
        text.className = 'gh-collection-pager-text';
        var kicker = document.createElement('span');
        kicker.className = 'gh-collection-pager-label';
        kicker.textContent = direction === 'prev' ? '← ' + label('previous') : label('next') + ' →';
        var title = document.createElement('span');
        title.className = 'gh-collection-pager-title';
        title.textContent = inSeries ? String(index + 1).padStart(2, '0') + ' - ' + titles[index] : label('hub');
        text.appendChild(kicker);
        text.appendChild(title);
        a.appendChild(text);
        return a;
    };

    var here = path(window.location.href);
    var current = -1;
    links.forEach(function (link, i) {
        if (path(link.href) === here) {
            current = i;
        }
    });

    if (current < 0) {
        top.classList.add('is-hub');
        top.hidden = false;
        // The hub reads as chapter 0: only a "next" into the first chapter.
        if (bottom) {
            bottom.appendChild(step(0, 'next'));
            bottom.hidden = false;
        }
        return;
    }

    if (bottom) {
        bottom.appendChild(step(current - 1, 'prev'));
        bottom.appendChild(step(current + 1, 'next'));
        bottom.hidden = false;
    }
})();
