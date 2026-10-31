/* Pure helpers for the community chat (assets/js/chat.js): the channel id
 * from its URL, the hidden-pages list, avatar URLs, the active/quiet state
 * bubble text, the relative time of the last message and the private channels
 * of the "Chat private channels" setting. No DOM, so a node script can check them. Ships inside
 * main.min.js, before chat.js (the bundle is alphabetical). */
window.NautasChatParse = (function () {
    var ACTIVE_WINDOW = 3 * 60 * 60 * 1000;

    var channelId = function (url) {
        var path = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');
        var last = path.split('/').pop();
        return /^\d+$/.test(last) ? last : '';
    };

    // The forum's URL carries the channel's slug: …/chat/c/lideres/73.
    var channelSlug = function (url) {
        var slug = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').slice(-2)[0];
        return slug && slug !== '-' ? decodeURIComponent(slug).replace(/-/g, ' ') : '';
    };

    // Comma-separated URLs: only this forum's chat, each channel once.
    var channelList = function (list, origin) {
        var seen = {};
        return String(list || '').split(',').map(function (url) {
            url = url.trim();
            return {id: channelId(url), url: url, title: channelSlug(url)};
        }).filter(function (channel) {
            if (!channel.id || seen[channel.id] || channel.url.indexOf(origin + '/chat/') !== 0) {
                return false;
            }
            seen[channel.id] = true;
            return true;
        });
    };

    var hiddenSlugs = function (list) {
        return String(list || '').toLowerCase().split(',').map(function (s) {
            return s.trim();
        }).filter(Boolean);
    };

    var isHidden = function (slug, list) {
        return !!slug && hiddenSlugs(list).indexOf(String(slug).toLowerCase()) !== -1;
    };

    var avatar = function (template, origin) {
        if (typeof template !== 'string') {
            return '';
        }
        var url = template.charAt(0) === '/' ? origin + template : template;
        return /^https:\/\//.test(url) ? url.replace('{size}', '48') : '';
    };

    var isActive = function (messages, now) {
        var latest = 0;
        (messages || []).forEach(function (m) {
            var t = Date.parse(m.created_at);
            if (t > latest) {
                latest = t;
            }
        });
        return latest > 0 && now - latest < ACTIVE_WINDOW;
    };

    var plain = function (text, max) {
        var s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    };

    // A message's time: the hour today, with the day before that, with the year before this one.
    var stamp = function (iso, now, locale) {
        var d = new Date(iso);
        if (isNaN(d)) {
            return '';
        }
        var today = new Date(now);
        var options = {hour: '2-digit', minute: '2-digit'};
        if (d.toDateString() !== today.toDateString()) {
            options.day = 'numeric';
            options.month = 'short';
            if (d.getFullYear() !== today.getFullYear()) {
                options.year = 'numeric';
            }
        }
        return d.toLocaleString(locale || undefined, options);
    };

    // Past times only: "ahora", "hace 4 min", "hace 3 h", "hace 2 d" in the page's language.
    var ago = function (iso, now, locale) {
        var t = Date.parse(iso);
        if (isNaN(t)) {
            return '';
        }
        var s = Math.max(0, Math.floor((now - t) / 1000));
        var rtf = new Intl.RelativeTimeFormat(locale || undefined, {numeric: 'auto', style: 'short'});
        if (s < 60) {
            return rtf.format(0, 'second');
        }
        if (s < 3600) {
            return rtf.format(-Math.floor(s / 60), 'minute');
        }
        return s < 86400 ? rtf.format(-Math.floor(s / 3600), 'hour') : rtf.format(-Math.floor(s / 86400), 'day');
    };

    return {channelId: channelId, channelSlug: channelSlug, channelList: channelList, stamp: stamp, hiddenSlugs: hiddenSlugs, isHidden: isHidden, avatar: avatar, isActive: isActive, plain: plain, ago: ago};
})();
