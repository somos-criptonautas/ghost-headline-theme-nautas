/* Community sidebar (partials/community-sidebar.hbs) and the category cards
 * after a post's comments (partials/community-related.hbs). Ships inside
 * main.min.js.
 *
 * Reads the forum's public /top.json (the year's top topics, the default),
 * /latest.json (latest topics) or /posts.json (posts). All
 * are anonymous endpoints, so only public content ever shows, and both need
 * the forum to answer cross-origin: DISCOURSE_ENABLE_CORS in app.yml plus
 * this site in Discourse's "cors origins" setting.
 *
 * As in peertube-videos.js, nothing from the forum goes in through innerHTML:
 * text is set with textContent, a post's cooked HTML is only parsed (inert,
 * scripts never run in a DOMParser document) to pull its plain text out, and
 * every URL is rebuilt on the forum origin.
 */
(function () {
    // Same forum as the comments embed (discourse-embed.js).
    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var SHOWN = 8;
    // The "Community hidden categories" setting: left out of every list here.
    var HIDDEN = (document.documentElement.getAttribute('data-community-hidden') || '').split(',').map(Number);
    var TIMEOUT = 8000;

    var RELATED = 4;

    var aside = document.querySelector('.gh-community');
    var related = document.querySelector('.gh-community-related');

    if ((!aside && !related) || !window.fetch || !window.Promise) {
        return;
    }

    var list = aside && aside.querySelector('.gh-community-list');
    var more = aside && aside.querySelector('.gh-community-more');
    var picker = aside && aside.querySelector('.gh-community-select');
    var message = aside && aside.querySelector('.gh-community-message');
    // Renamed from gh-community-mode when top became the default, so earlier picks start over on it.
    var STORE = 'gh-community-list';
    var MODES = {top: '/top.json?period=yearly', topics: '/latest.json', posts: '/posts.json'};
    // The forum page "go to the community" opens for each list.
    var PAGES = {top: '/top?period=yearly', topics: '/latest', posts: '/posts'};

    // The visitor's last pick wins over the theme setting's default.
    // Storage can throw (private mode, blocked site data): fall back.
    var stored = null;
    try {
        stored = window.localStorage.getItem(STORE);
    } catch (e) {}
    var preset = aside && aside.getAttribute('data-mode');
    var mode = MODES[stored] ? stored : (MODES[preset] ? preset : 'top');
    var lang = document.documentElement.lang || undefined;
    // Both partials carry the same translated labels; either will do.
    var labelled = aside || related;
    var labels = {
        one: labelled.getAttribute('data-label-reply') || 'reply',
        other: labelled.getAttribute('data-label-replies') || 'replies',
        where: labelled.getAttribute('data-label-in') || 'in'
    };

    // withCookie: sent with the forum session, for what a signed-in member may see.
    var getJSON = function (path, withCookie) {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller && setTimeout(function () {
            controller.abort();
        }, TIMEOUT);

        return fetch(ORIGIN + path, {
            credentials: withCookie ? 'include' : 'omit',
            // In the site's language, not the browser's: the forum serves its
            // machine translation to readers whose browser asks for another.
            headers: {Accept: 'application/json', 'Accept-Language': lang || 'es'},
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            clearTimeout(timer);
            if (!response.ok) {
                throw new Error(response.status);
            }
            return response.json();
        }, function (error) {
            clearTimeout(timer);
            throw error;
        });
    };

    /* Members-only topics (is_locked_down in the forum's lists) answer 402
     * to anyone without access, so they are listed only for a visitor signed
     * in to the forum; /session/current.json answers 404 to everyone else.
     * Asked once, and only when there is a list of topics to filter. */
    var session = null;
    var signedIn = function () {
        if (!session) {
            session = getJSON('/session/current.json', true).then(function () {
                return true;
            }, function () {
                return false;
            });
        }
        return session;
    };
    var readable = function (entries) {
        return signedIn().then(function (member) {
            return entries.filter(function (entry) {
                return member || !entry.locked;
            });
        });
    };

    var SLUG = /^[\w%-]*$/;

    /* The forum category of each blog channel (tag slug: category id). By
     * id, so a renamed forum slug or a subcategory (opsec, under tech-apps)
     * still answers: /c/<id> redirects to the full path, CORS headers
     * included. A tag not listed here has no category: the caller falls back
     * to the whole forum or hides. Resolves to the category's all-time top
     * topics and its path on the forum. */
    var CATEGORY = {
        comunidad: 2,
        cripto: 9,
        bitcoin: 23,
        monero: 25,
        altcoins: 21,
        'tech-apps': 26,
        opsec: 18,
        filonauta: 22,
        bienestar: 28,
        sociedad: 39,
        taboo: 55
    };

    var categoryTop = function (slug) {
        var id = CATEGORY[slug];
        if (!id) {
            return Promise.reject(new Error('no category'));
        }
        var path = '/c/' + id;
        return getJSON(path + '/l/top.json?period=all').then(function (body) {
            return {body: body, path: path};
        });
    };

    // Tag pages: the topics of the tag's forum category (CATEGORY) only, so
    // no replies picker. A tag
    // without a category falls back to the whole forum, as on /blog.
    var GLOBAL = {modes: MODES, mode: mode};
    var scope = (aside && aside.getAttribute('data-category')) || '';
    var scopePath = '';
    if (scope && SLUG.test(scope)) {
        MODES = {top: '/c/' + scope + '/l/top.json?period=all'};
        mode = 'top';
    } else {
        scope = '';
    }

    // Links open the forum in the site's language: it would follow the browser's.
    var inLang = function (url) {
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 'tl=' + (lang || 'es').slice(0, 2);
    };

    var topicUrl = function (slug, id, postNumber) {
        id = parseInt(id, 10);
        if (!(id > 0)) {
            return null;
        }
        slug = typeof slug === 'string' && SLUG.test(slug) && slug ? slug : '-';
        return inLang(ORIGIN + '/t/' + slug + '/' + id + (postNumber > 1 ? '/' + postNumber : ''));
    };

    // Discourse avatar templates are either a forum path or an absolute URL
    // (letter avatars on a CDN). Anything else is dropped.
    var avatar = function (template) {
        if (typeof template !== 'string' || /[\s,]/.test(template)) {
            return null;
        }
        try {
            var url = new URL(template.replace('{size}', '96'), ORIGIN);
            return url.protocol === 'https:' ? url.href : null;
        } catch (e) {
            return null;
        }
    };

    // A topic's thumbnail: an absolute https URL (the forum or its CDN), or none.
    var image = function (value) {
        try {
            var url = new URL(String(value || ''), ORIGIN);
            return value && url.protocol === 'https:' ? url.href : null;
        } catch (e) {
            return null;
        }
    };

    var plainText = function (html) {
        if (typeof html !== 'string' || !window.DOMParser) {
            return '';
        }
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // Quotes, onebox previews and code are noise in a two-line excerpt.
        var noise = doc.querySelectorAll('aside, blockquote, pre, .lightbox-wrapper, img');
        for (var i = 0; i < noise.length; i++) {
            noise[i].parentNode.removeChild(noise[i]);
        }
        return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    };

    var date = function (value) {
        var parsed = new Date(value);
        return isNaN(parsed) ? null : parsed;
    };

    var topics = function (body) {
        var users = {};
        ((body && body.users) || []).forEach(function (user) {
            users[user.id] = user;
        });

        var list = (body && body.topic_list && body.topic_list.topics) || [];

        return list
            // Pinned topics sit at the top of /latest regardless of age.
            .filter(function (topic) {
                return topic && !topic.pinned && !topic.pinned_globally && topic.visible !== false && HIDDEN.indexOf(topic.category_id) === -1;
            })
            .map(function (topic) {
                var poster = (topic.posters || [])[0];
                var user = poster && users[poster.user_id];
                return {
                    id: parseInt(topic.id, 10) || 0,
                    locked: topic.is_locked_down === true,
                    url: topicUrl(topic.slug, topic.id),
                    image: image(topic.image_url),
                    // `title` stays in the topic's own language; the translation comes as escaped HTML.
                    title: plainText(topic.fancy_title) || String(topic.title || ''),
                    user: user ? String(user.username || '') : '',
                    avatar: user ? avatar(user.avatar_template) : null,
                    date: date(topic.last_posted_at || topic.bumped_at || topic.created_at),
                    replies: Math.max(0, (parseInt(topic.posts_count, 10) || 1) - 1)
                };
            });
    };

    var posts = function (body) {
        return ((body && body.latest_posts) || [])
            // post_type 1 is a regular post; the rest are whispers, small
            // actions and moderator notes.
            .filter(function (post) {
                return post && post.post_type === 1 && !post.hidden && !post.deleted_at && HIDDEN.indexOf(post.category_id) === -1;
            })
            .map(function (post) {
                return {
                    url: topicUrl(post.topic_slug, post.topic_id, post.post_number),
                    title: String(post.topic_title || ''),
                    user: String(post.username || ''),
                    avatar: avatar(post.avatar_template),
                    date: date(post.created_at),
                    excerpt: plainText(post.cooked)
                };
            });
    };

    var relative = window.Intl && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(lang, {numeric: 'auto', style: 'short'})
        : null;
    var plurals = window.Intl && Intl.PluralRules ? new Intl.PluralRules(lang) : null;
    var UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

    var ago = function (when) {
        var seconds = (when - Date.now()) / 1000;

        if (!relative) {
            return when.toLocaleDateString(lang);
        }
        for (var i = 0; i < UNITS.length; i++) {
            if (Math.abs(seconds) >= UNITS[i][1]) {
                return relative.format(Math.round(seconds / UNITS[i][1]), UNITS[i][0]);
            }
        }
        return relative.format(0, 'minute');
    };

    var el = function (tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text) {
            node.textContent = text;
        }
        return node;
    };

    /* A topic opens in the box, as in the search: search-modal.js's reader, with
     * its post, AI summary and who replied. Without it (search off, not loaded
     * yet), a locked topic or a modified click: the link, in a new tab. */
    var reader = null;
    var closeReader = function (link) {
        if (!reader) {
            return;
        }
        reader.remove();
        reader = null;
        aside.querySelector('.gh-community-list').hidden = false;
        if (link) {
            link.focus();
        }
    };

    var openReader = function (entry, link, facts) {
        var R = window.NautasTopicReader;
        closeReader();
        var shown = el('article', 'gh-community-reader ns__reader');
        reader = shown;
        var back = el('button', 'ns__reader-back', aside.getAttribute('data-label-back'));
        back.type = 'button';
        back.addEventListener('click', function () {
            closeReader(link);
        });
        var title = el('h3', 'ns__reader-title', entry.title);
        var slot = el('div', 'gh-community-reader-body');
        slot.setAttribute('aria-busy', 'true');
        var foot = el('div', 'ns__reader-foot');
        foot.appendChild(entry.replies > 0
            ? R.outLink(R.inLang(ORIGIN + '/t/' + entry.id + '/2'), R.t('see replies') + ' (' + entry.replies + ')')
            : R.outLink(entry.url, R.t('view in the community')));
        shown.append(back, title, facts.cloneNode(true), slot, foot);
        var list = aside.querySelector('.gh-community-list');
        list.hidden = true;
        list.parentNode.insertBefore(shown, list);
        back.focus();

        getJSON('/t/' + entry.id + '.json').then(function (topic) {
            var first = topic && topic.post_stream && topic.post_stream.posts && topic.post_stream.posts[0];
            if (reader !== shown || !first) {
                return;
            }
            R.fill({id: first.id, topic_id: entry.id, reply_count: entry.replies, text: ''})(slot, function () {
                return reader === shown;
            });
        }).then(null, function () {}).then(function () {
            slot.removeAttribute('aria-busy');
        });
    };

    var row = function (entry) {
        var item = el('li', 'gh-community-item');
        var link = el('a', 'gh-community-link');
        link.href = entry.url;
        // The forum is another site: a new tab, like every external link.
        link.target = '_blank';
        link.rel = 'noopener';

        var face = el('span', 'gh-community-avatar');
        face.setAttribute('aria-hidden', 'true');
        if (entry.avatar) {
            var img = el('img');
            img.src = entry.avatar;
            img.alt = '';
            img.width = 48;
            img.height = 48;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            face.appendChild(img);
        } else {
            face.textContent = (entry.user || '?').charAt(0).toUpperCase();
        }
        link.appendChild(face);

        var body = el('span', 'gh-community-body');

        if (mode === 'posts') {
            body.appendChild(el('span', 'gh-community-excerpt', entry.excerpt || entry.title));
            var where = el('span', 'gh-community-topic', labels.where + ' ' + entry.title);
            body.appendChild(where);
        } else {
            var name = el('span', 'gh-community-name');
            name.appendChild(el('span', 'gh-community-mark', entry.title));
            body.appendChild(name);
        }

        var meta = el('span', 'gh-community-meta');
        if (entry.user) {
            meta.appendChild(el('span', null, entry.user));
        }
        if (entry.date) {
            var time = el('time', null, ago(entry.date));
            time.dateTime = entry.date.toISOString();
            meta.appendChild(time);
        }
        if (mode !== 'posts' && entry.replies) {
            var form = plurals && plurals.select(entry.replies) === 'one' ? labels.one : labels.other;
            meta.appendChild(el('span', null, entry.replies + ' ' + form));
        }
        body.appendChild(meta);

        link.appendChild(body);
        item.appendChild(link);
        if (mode !== 'posts' && entry.id && !entry.locked) {
            link.addEventListener('click', function (event) {
                if (!window.NautasTopicReader || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                openReader(entry, link, meta);
            });
        }
        return item;
    };

    var cache = {};

    // One request per list, the first time it is picked. A failure is not
    // cached, so picking that list again retries.
    var load = function (which) {
        if (!cache[which]) {
            cache[which] = (scope ? categoryTop(scope).then(function (found) {
                scopePath = found.path;
                return found.body;
            }) : getJSON(MODES[which])).then(function (body) {
                return which === 'posts' ? posts(body) : readable(topics(body));
            }).then(function (entries) {
                return entries
                    .filter(function (entry) {
                        return entry.url && entry.title;
                    })
                    .slice(0, SHOWN);
            });
            cache[which].then(null, function () {
                delete cache[which];
            });
        }
        return cache[which];
    };

    var request = 0;
    var shown = false;

    var show = function (which) {
        var ticket = ++request;

        aside.setAttribute('aria-busy', 'true');

        return load(which).then(function (entries) {
            if (ticket !== request) {
                return;
            }
            if (!entries.length) {
                throw new Error('empty');
            }
            // row() reads `mode` to pick the topic or the post layout.
            mode = which;
            list.textContent = '';
            entries.forEach(function (entry) {
                list.appendChild(row(entry));
            });
            list.hidden = false;
            message.hidden = true;
            more.href = inLang(ORIGIN + (scope ? scopePath : PAGES[which]));
            shown = true;
        }).then(null, function () {
            if (ticket !== request) {
                return;
            }
            // No category for this tag: the whole forum's list instead.
            if (scope && !shown) {
                scope = '';
                MODES = GLOBAL.modes;
                mode = GLOBAL.mode;
                cache = {};
                picker.closest('.gh-community-picker').hidden = false;
                picker.value = mode;
                show(mode);
                return;
            }
            // Never loaded (forum down, no CORS): the placeholder goes and
            // the aside with it. After that, say so in place of the list.
            if (!shown) {
                aside.hidden = true;
                return;
            }
            list.hidden = true;
            message.hidden = false;
        }).then(function () {
            if (ticket === request) {
                aside.removeAttribute('aria-busy');
            }
        });
    };

    /* Topic dialog (community-related.hbs): a card opens the topic's first
     * post here, as the search reader does, so reading it does not leave the
     * article; going on to the forum is the link at its foot, in a new tab.
     * Modified clicks (new tab, new window) and browsers without <dialog>
     * keep the plain link. The post is the forum's HTML rebuilt with safe
     * tags only (forum-html.js); if it does not load, the dialog keeps the
     * title and the way to the forum. */
    var dialog = document.querySelector('.gh-community-dialog');
    var openTopic = function (entry, meta) {
        var body = dialog.querySelector('.gh-community-dialog-body');
        dialog.querySelector('.gh-community-dialog-title').textContent = entry.title;
        dialog.querySelector('.gh-community-dialog-meta').replaceChildren(meta.cloneNode(true));
        dialog.querySelector('.gh-community-dialog-out').href = entry.url;
        body.replaceChildren();
        body.setAttribute('aria-busy', 'true');
        dialog.showModal();

        getJSON('/t/' + entry.id + '.json', entry.locked).then(function (topic) {
            var first = topic && topic.post_stream && topic.post_stream.posts && topic.post_stream.posts[0];
            // A later card may have been opened meanwhile.
            if (first && first.cooked && dialog.open && dialog.querySelector('.gh-community-dialog-out').href === entry.url) {
                body.replaceChildren(window.NautasForumHTML.render(first.cooked, ORIGIN, 'gh-community-emoji'));
            }
        }).then(null, function () {}).then(function () {
            body.removeAttribute('aria-busy');
        });
    };

    if (dialog) {
        dialog.querySelector('.gh-community-dialog-close').addEventListener('click', function () {
            dialog.close();
        });
        // A click on the backdrop lands on the <dialog> itself.
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialog.close();
            }
        });
    }

    // Post pages: a horizontal card per topic, the thumbnail (or the poster's
    // avatar) beside the title, then who, when and how many replies.
    var card = function (entry) {
        var item = el('li', 'gh-community-card');
        var link = el('a', 'gh-community-card-link');
        link.href = entry.url;
        link.target = '_blank';
        link.rel = 'noopener';

        var media = el('span', 'gh-community-card-media' + (entry.image ? '' : ' is-avatar'));
        media.setAttribute('aria-hidden', 'true');
        var src = entry.image || entry.avatar;
        if (src) {
            var img = el('img');
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            media.appendChild(img);
        } else {
            media.textContent = (entry.user || '?').charAt(0).toUpperCase();
        }
        link.appendChild(media);

        var body = el('span', 'gh-community-body');
        body.appendChild(el('span', 'gh-community-name', entry.title));
        var meta = el('span', 'gh-community-meta');
        if (entry.user) {
            meta.appendChild(el('span', null, entry.user));
        }
        if (entry.date) {
            var time = el('time', null, ago(entry.date));
            time.dateTime = entry.date.toISOString();
            meta.appendChild(time);
        }
        if (entry.replies) {
            var form = plurals && plurals.select(entry.replies) === 'one' ? labels.one : labels.other;
            meta.appendChild(el('span', null, entry.replies + ' ' + form));
        }
        body.appendChild(meta);
        link.appendChild(body);
        item.appendChild(link);

        if (dialog && dialog.showModal && entry.id && window.NautasForumHTML) {
            link.addEventListener('click', function (event) {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                openTopic(entry, meta);
            });
        }
        return item;
    };

    // Posts: the primary tag's forum category (CATEGORY). /blog passes none:
    // the whole forum's top. No topics or no answer: it keeps `hidden`.
    if (related) {
        var category = related.getAttribute('data-category') || '';
        var count = parseInt(related.getAttribute('data-count'), 10) || RELATED;
        // The home strip shows from the start: without topics it goes.
        var none = function () {
            related.hidden = true;
        };
        if (SLUG.test(category)) {
            var path = PAGES.top;
            // The strip and a tag page's block stand in for an aside, so a tag
            // with no forum category gets the whole forum's, as the aside does.
            var strip = related.classList.contains('gh-community-strip') || document.body.classList.contains('tag-template');
            (category ? categoryTop(category).then(function (found) {
                path = found.path;
                return found.body;
            }, function (error) {
                return strip ? getJSON(GLOBAL.modes.top) : Promise.reject(error);
            }) : getJSON(GLOBAL.modes.top)).then(function (body) {
                return readable(topics(body));
            }).then(function (entries) {
                entries = entries
                    .filter(function (entry) {
                        return entry.url && entry.title;
                    })
                    .slice(0, count);
                if (!entries.length) {
                    none();
                    return;
                }
                var cards = related.querySelector('.gh-community-cards');
                entries.forEach(function (entry) {
                    cards.appendChild(card(entry));
                });
                related.querySelector('.gh-community-more').href = inLang(ORIGIN + path);
                related.hidden = false;
            }, none).then(function () {
                related.removeAttribute('aria-busy');
            });
        }
    }

    if (!aside) {
        return;
    }

    // The markup shows it from the first paint, as rows of placeholders
    // while aria-busy (community.css), so the posts do not move when the
    // forum answers.
    if (scope) {
        picker.closest('.gh-community-picker').hidden = true;
    }
    picker.value = mode;
    picker.addEventListener('change', function () {
        closeReader();
        if (!MODES[picker.value]) {
            return;
        }
        try {
            window.localStorage.setItem(STORE, picker.value);
        } catch (e) {}
        show(picker.value);
    });

    show(mode);
})();
