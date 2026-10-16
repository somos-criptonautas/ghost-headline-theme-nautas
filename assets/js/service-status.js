/* Service status (partials/service-status.hbs, /stack). Ships inside
 * main.min.js; does nothing without the .gh-status shell.
 *
 * One request to the status webhook: rows of {name, url, ok, code,
 * checkedAt, grupo}. Each service is a link to its site with a dot, green
 * when it answered, red with the code (or "not answering") when not; rows of
 * grupo "apps" go in the second list. The newest check gives "checked ... ago".
 */
(function () {
    var section = document.querySelector('.gh-status');

    if (!section || !window.fetch) {
        return;
    }

    var lang = document.documentElement.lang || undefined;
    var labelChecked = section.getAttribute('data-label-checked') || 'checked';
    var labelDown = section.getAttribute('data-label-down') || 'not answering';

    var ago = function (date) {
        var minutes = Math.round((date - Date.now()) / 60000);
        if (!window.Intl || !Intl.RelativeTimeFormat) {
            return date.toLocaleTimeString(lang);
        }
        var format = new Intl.RelativeTimeFormat(lang, {numeric: 'auto'});
        return Math.abs(minutes) < 60 ? format.format(minutes, 'minute') : format.format(Math.round(minutes / 60), 'hour');
    };

    var row = function (service) {
        var item = document.createElement('li');
        item.className = 'gh-status-item' + (service.ok ? ' is-up' : ' is-down');
        var link = document.createElement('a');
        link.className = 'gh-status-link';
        link.href = service.site;
        link.target = '_blank';
        link.rel = 'noopener';
        var dot = document.createElement('span');
        dot.className = 'gh-status-dot';
        dot.setAttribute('aria-hidden', 'true');
        var name = document.createElement('span');
        name.className = 'gh-status-name';
        name.textContent = service.name;
        link.append(dot, name);
        if (!service.ok) {
            var code = document.createElement('span');
            code.className = 'gh-status-code';
            code.textContent = service.code > 0 ? String(service.code) : labelDown;
            link.appendChild(code);
        }
        item.appendChild(link);
        return item;
    };

    fetch(section.getAttribute('data-src'), {credentials: 'omit', headers: {Accept: 'application/json'}})
        .then(function (response) {
            return response.ok ? response.json() : Promise.reject(new Error(response.status));
        })
        .then(function (rows) {
            var newest = 0;
            var lists = {};
            (Array.isArray(rows) ? rows : []).forEach(function (raw) {
                var site;
                try {
                    site = new URL(raw.url);
                } catch (e) {
                    return;
                }
                // Only an https site and a check that has run.
                if (site.protocol !== 'https:' || !raw.name || !raw.checkedAt) {
                    return;
                }
                var checked = new Date(raw.checkedAt);
                if (checked > newest) {
                    newest = checked;
                }
                var group = raw.grupo === 'apps' ? 'apps' : '';
                var list = lists[group] || (lists[group] = section.querySelector('.gh-status-list[data-group="' + group + '"]'));
                list.appendChild(row({
                    name: String(raw.name),
                    site: site.origin + '/',
                    ok: raw.ok === true,
                    code: parseInt(raw.code, 10) || 0
                }));
                list.hidden = false;
                if (group) {
                    section.querySelector('.gh-status-subtitle').hidden = false;
                }
            });
            if (!newest) {
                return;
            }
            var time = document.createElement('time');
            time.dateTime = newest.toISOString();
            time.textContent = labelChecked + ' ' + ago(newest);
            section.querySelector('.gh-status-checked').appendChild(time);
            section.hidden = false;
        })
        .catch(function () {});
})();
