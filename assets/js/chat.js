/* Community chat (partials/chat.hbs, chat.css). A public forum channel,
 * read from the chat API without a cookie, polled every 15 s while someone
 * wrote in the last 3 h, every 60 s otherwise, never in a hidden tab.
 * Members signed in to the forum can write: the same cookie and CSRF dance
 * as reactions.js. Message HTML goes through NautasForumHTML, never
 * innerHTML. If the forum fails, the tab stays as a link to the forum's chat.
 * A new message from someone else pops anonist's mask over the tab, a
 * doorbell. Ships inside main.min.js.
 */
(function () {
    var root = document.querySelector('.cn-chat');
    var P = window.NautasChatParse;

    // The bundle is alphabetical: chat-parse.js loads before this file, forum-html.js
    // after it, so NautasForumHTML is only looked up when a message is rendered.
    if (!root || !P || !window.fetch) {
        return;
    }

    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var CHANNEL = P.channelId(root.getAttribute('data-channel'));
    var CHANNEL_URL = root.getAttribute('data-channel');

    if (!CHANNEL || CHANNEL_URL.indexOf(ORIGIN + '/chat/') !== 0 || P.isHidden(root.getAttribute('data-slug'), root.getAttribute('data-hidden'))) {
        root.remove();
        return;
    }

    var pill = root.querySelector('.cn-chat-pill');
    var avatars = root.querySelector('.cn-chat-avatars');
    var panelAvatars = root.querySelector('.cn-chat-panel-avatars');
    var dot = root.querySelector('.cn-chat-dot');
    var ago = root.querySelector('.cn-chat-ago');
    var panel = root.querySelector('.cn-chat-panel');
    var title = root.querySelector('.cn-chat-title');
    var list = root.querySelector('.cn-chat-messages');
    var close = root.querySelector('.cn-chat-close');
    var mascot = root.querySelector('.gh-mascot');
    var status = root.querySelector('.cn-chat-status');

    var messages = [];
    var lastId = 0;
    var lastSaid = 0;
    var timer;
    var failed = false;
    var desktop = window.matchMedia('(min-width: 992px)');

    // Filled by the signed-in part below; a no-op until then.
    var checkSession = function () {};

    var get = function (path) {
        return fetch(ORIGIN + path, {credentials: 'omit', headers: {Accept: 'application/json'}}).then(function (r) {
            if (!r.ok) {
                throw new Error(r.status);
            }
            return r.json();
        });
    };

    var el = function (tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    };

    var img = function (user) {
        var src = P.avatar(user && user.avatar_template, ORIGIN);
        if (!src) {
            return null;
        }
        var image = el('img');
        image.src = src;
        image.alt = '';
        image.width = 32;
        image.height = 32;
        image.loading = 'lazy';
        return image;
    };

    var when = function (iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleTimeString(document.documentElement.lang || undefined, {hour: '2-digit', minute: '2-digit'});
    };

    // The last three distinct posters, newest first.
    var paintAvatars = function (target) {
        target.replaceChildren();
        var seen = {};
        messages.slice().reverse().some(function (m) {
            var u = m.user || {};
            if (seen[u.id]) {
                return false;
            }
            seen[u.id] = true;
            var image = img(u);
            if (image) {
                target.appendChild(image);
            }
            return target.childElementCount === 3;
        });
    };

    var paintList = function (force) {
        var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        list.replaceChildren();
        list.setAttribute('aria-busy', 'false');
        if (!messages.length) {
            list.appendChild(el('p', 'cn-chat-empty', root.getAttribute('data-active')));
            return;
        }
        var group = null;
        var lastUser = null;
        messages.forEach(function (m) {
            var u = m.user || {};
            var body;
            try {
                body = window.NautasForumHTML.render(m.cooked || '', ORIGIN, 'cn-chat-emoji');
            } catch (err) {
                // One bad message must not blank the panel.
                return;
            }
            if (!group || u.id !== lastUser) {
                group = el('div', 'cn-chat-group');
                var image = img(u);
                if (image) {
                    group.appendChild(image);
                }
                var who = el('div', 'cn-chat-who');
                who.appendChild(el('span', '', u.name || u.username || ''));
                who.appendChild(el('span', 'cn-chat-when', when(m.created_at)));
                group.appendChild(who);
                list.appendChild(group);
                lastUser = u.id;
            }
            body.className = 'cn-chat-body';
            group.appendChild(body);
        });
        if (atBottom || force) {
            list.scrollTop = list.scrollHeight;
        }
    };

    var bubble = mascot && mascot.querySelector('.gh-mascot-bubble');
    var rung;

    var unring = function () {
        clearTimeout(rung);
        mascot.classList.remove('is-popped');
        bubble.textContent = '';
    };

    // The doorbell: the mask pops over the tab for a few seconds; the balloon only on desktop.
    var ring = function (text) {
        if (!mascot || !panel.hidden || Date.now() - lastSaid < 120000) {
            return;
        }
        lastSaid = Date.now();
        clearTimeout(rung);
        bubble.textContent = desktop.matches ? P.plain(text, 80) : '';
        mascot.classList.add('is-popped');
        rung = setTimeout(unring, desktop.matches ? 5000 : 4000);
    };

    var setState = function () {
        var active = P.isActive(messages, Date.now());
        root.classList.toggle('is-active', active);
        dot.hidden = !active;
        var newest = messages.length ? messages[messages.length - 1] : null;
        ago.textContent = newest ? '· ' + P.ago(newest.created_at, Date.now(), document.documentElement.lang) : '';
        paintAvatars(avatars);
        paintAvatars(panelAvatars);
        pill.classList.add('is-visible');
    };

    var apply = function (data) {
        if (!data || !Array.isArray(data.messages)) { throw new Error('shape'); }
        var fresh = data.messages.filter(function (m) {
            return !m.deleted_at;
        });
        var newest = fresh.length ? fresh[fresh.length - 1] : null;
        var changed = !newest ? messages.length > 0 : newest.id !== lastId || fresh.length !== messages.length;
        messages = fresh;
        if (newest && lastId && newest.id !== lastId) {
            var u = newest.user || {};
            ring((u.username || '') + ': ' + (newest.excerpt || newest.message || ''));
        }
        lastId = newest ? newest.id : 0;
        failed = false;
        setState();
        if (changed && !panel.hidden) {
            paintList();
        }
    };

    var fail = function () {
        // The forum's chat page takes over the pill until the next poll succeeds.
        failed = true;
        root.classList.remove('is-active');
        dot.hidden = true;
        ago.textContent = '';
        pill.classList.add('is-visible');
        list.setAttribute('aria-busy', 'false');
        if (!panel.hidden) {
            list.replaceChildren(el('p', 'cn-chat-empty', root.getAttribute('data-load-error')));
        }
    };

    var poll = function () {
        clearTimeout(timer);
        if (document.hidden) {
            return;
        }
        get('/chat/api/channels/' + CHANNEL + '/messages?page_size=50').then(apply).catch(fail).then(function () {
            // Overlapping polls (open, visibilitychange) must not leave a second chain running.
            clearTimeout(timer);
            timer = setTimeout(poll, root.classList.contains('is-active') ? 15000 : 60000);
        });
    };

    var open = function () {
        if (failed) {
            window.open(CHANNEL_URL, '_blank', 'noopener');
            return;
        }
        panel.hidden = false;
        if (mascot) {
            unring();
        }
        root.classList.add('is-open');
        pill.setAttribute('aria-expanded', 'true');
        // A hidden panel loses its scroll position: reopen at the newest message.
        paintList(true);
        checkSession();
        close.focus();
        poll();
    };

    var shut = function () {
        panel.hidden = true;
        root.classList.remove('is-open');
        pill.setAttribute('aria-expanded', 'false');
        status.textContent = '';
        pill.focus();
    };

    pill.addEventListener('click', function () {
        if (panel.hidden) {
            open();
        } else {
            shut();
        }
    });
    if (mascot) {
        mascot.addEventListener('click', function () {
            if (panel.hidden) {
                open();
            }
        });
    }
    close.addEventListener('click', shut);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !panel.hidden) {
            shut();
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            poll();
        }
    });

    get('/chat/api/channels/' + CHANNEL).then(function (data) {
        var channel = data.channel || data;
        if (channel && channel.title) {
            title.textContent = '# ' + channel.title;
        }
    }, function () {});

    root.hidden = false;
    poll();

    // --- signed-in members write (reactions.js does the same dance) ---
    var compose = root.querySelector('.cn-chat-compose');
    var join = root.querySelector('.cn-chat-join');
    var input = root.querySelector('.cn-chat-input');
    var send = root.querySelector('.cn-chat-send');

    var withCookie = function (path, options) {
        options = options || {};
        options.credentials = 'include';
        options.headers = Object.assign({Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest'}, options.headers);
        return fetch(ORIGIN + path, options).then(function (r) {
            if (!r.ok) {
                throw new Error(r.status);
            }
            return r.json();
        });
    };

    // On every open: the session answers 404 for anyone not signed in; other failures show the join link.
    checkSession = function () {
        var signedIn;
        withCookie('/session/current.json').then(function () {
            signedIn = true;
        }, function () {
            // 404 means signed out; any other failure also shows the join link, the safe side.
            signedIn = false;
        }).then(function () {
            compose.hidden = !signedIn;
            join.hidden = signedIn;
        });
    };

    compose.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text || send.disabled) {
            return;
        }
        send.disabled = true;
        status.textContent = '';
        withCookie('/session/csrf.json').then(function (session) {
            var body = new URLSearchParams();
            body.set('message', text);
            return withCookie('/chat/' + CHANNEL, {
                method: 'POST',
                headers: {'X-CSRF-Token': session.csrf, 'Content-Type': 'application/x-www-form-urlencoded'},
                body: body.toString()
            });
        }).then(function () {
            input.value = '';
            poll();
        }, function () {
            status.textContent = root.getAttribute('data-send-error');
        }).then(function () {
            send.disabled = false;
            input.focus();
        });
    });

    // Enter sends, Shift+Enter breaks the line, as in the forum.
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            compose.requestSubmit();
        }
    });
})();
