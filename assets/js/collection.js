/* Page series (partials/collection.hbs, custom-collection.hbs). Ships inside
 * main.min.js.
 *
 * The top nav holds the chapters in order and shows as cards on every page
 * of the series; on a chapter its own card is marked current. The hub (a
 * page not in that list) gets "next" into the first chapter at the end of
 * its text; a chapter gets previous / next - the hub before the first -
 * except the last, which ends the series. Each step carries its chapter's image, facing inward:
 * [← previous  title  image] [image  title  next →].
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
    // Chapters are numbered as tarot arcana are: I, II, III, IV.
    var roman = function (n) {
        var out = '';
        [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].forEach(function (pair) {
            for (; n >= pair[0]; n -= pair[0]) {
                out += pair[1];
            }
        });
        return out;
    };

    // Titles like "Journey -> La partida" repeat the series name the page already shows.
    var titles = links.map(function (link, i) {
        link.querySelector('.gh-collection-num').textContent = roman(i + 1);
        var node = link.querySelector('.gh-collection-title');
        node.textContent = node.textContent.replace(/^[^>]{0,40}?-+>\s*/, '');
        return node.textContent;
    });

    var hub = top.getAttribute('data-hub');
    // Ghost marks a nav item current only on its exact URL: on a chapter,
    // mark the hub's item too, so the header says "you are here".
    Array.prototype.forEach.call(document.querySelectorAll('#gh-head .nav a'), function (a) {
        if (path(a.href) === path(hub)) {
            a.parentNode.classList.add('nav-current');
        }
    });
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
        title.textContent = inSeries ? roman(index + 1) + ' - ' + titles[index] : label('hub');
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

    top.classList.add('is-cards');
    top.hidden = false;

    if (current < 0) {
        // The hub reads as chapter 0: only a "next" into the first chapter.
        if (bottom) {
            bottom.appendChild(step(0, 'next'));
            bottom.hidden = false;
        }
        return;
    }

    links[current].setAttribute('aria-current', 'page');

    // The last chapter closes the series: its page carries the survey and
    // comments as embeds, so no previous / next there.
    if (bottom && current < links.length - 1) {
        bottom.appendChild(step(current - 1, 'prev'));
        bottom.appendChild(step(current + 1, 'next'));
        bottom.hidden = false;
    }
})();
