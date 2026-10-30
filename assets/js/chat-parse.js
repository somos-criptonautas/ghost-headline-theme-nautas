/* Pure helpers for the community chat (assets/js/chat.js): the channel id
 * from its URL, the hidden-pages list, avatar URLs, the active/quiet state
 * and bubble text. No DOM, so a node script can check them. Ships inside
 * main.min.js, before chat.js (the bundle is alphabetical). */
window.NautasChatParse = (function () {
    var ACTIVE_WINDOW = 3 * 60 * 60 * 1000;

    var channelId = function (url) {
        var path = String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');
        var last = path.split('/').pop();
        return /^\d+$/.test(last) ? last : '';
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

    return {channelId: channelId, hiddenSlugs: hiddenSlugs, isHidden: isHidden, avatar: avatar, isActive: isActive, plain: plain};
})();
