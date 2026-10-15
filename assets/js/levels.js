/* /blog level switches (index.hbs): every level on at first; each switch
 * takes its level out of the list or brings it back. Cards carry the class
 * Ghost gives them for their internal tag (tag-hash-nivel-N); the choice is a
 * class per hidden level on the list, so cards that infinite scroll adds later
 * follow it too (screen.css). Posts without a level show only with every level
 * on. The choice is kept in this browser: the hidden levels, nothing else.
 * Ships inside main.min.js.
 */
(function () {
    var group = document.querySelector('.gh-levels');
    var feed = document.querySelector('.gh-feed');
    var STORE = 'gh-levels-hidden';

    if (!group || !feed) {
        return;
    }

    var levels = Array.prototype.slice.call(group.querySelectorAll('[data-level]'));

    // One level alone has nothing to choose between.
    if (levels.length < 2) {
        group.hidden = true;
        return;
    }

    var known = levels.map(function (pill) {
        return pill.getAttribute('data-level');
    });

    var hidden = [];
    try {
        hidden = (window.localStorage.getItem(STORE) || '').split(',').filter(function (level) {
            return known.indexOf(level) !== -1;
        });
    } catch (e) {}

    var apply = function () {
        // A stored choice with every level off (levels came and went).
        if (hidden.length >= known.length) {
            hidden = [];
        }
        levels.forEach(function (pill) {
            var level = pill.getAttribute('data-level');
            var off = hidden.indexOf(level) !== -1;
            pill.setAttribute('aria-checked', String(!off));
            feed.classList.toggle('is-hidden-' + level, off);
        });
        feed.classList.toggle('is-filtered', hidden.length > 0);
        try {
            if (hidden.length) {
                window.localStorage.setItem(STORE, hidden.join(','));
            } else {
                window.localStorage.removeItem(STORE);
            }
        } catch (e) {}
    };

    levels.forEach(function (pill) {
        pill.addEventListener('click', function () {
            var level = pill.getAttribute('data-level');
            var at = hidden.indexOf(level);
            if (at === -1) {
                // The last level on stays on: no empty list.
                if (hidden.length + 1 >= known.length) {
                    return;
                }
                hidden.push(level);
            } else {
                hidden.splice(at, 1);
            }
            apply();
        });
    });

    apply();
})();
