/* Community sidebar (partials/community-sidebar.hbs). Ships inside main.min.js.
 *
 * Reads the forum's public /latest.json (topics) or /posts.json (posts). Both
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
    var ORIGIN = 'https://comunidad.criptonautas.co';
    var SHOWN = 8;
    var TIMEOUT = 8000;

    var aside = document.querySelector('.gh-community');

    if (!aside || !window.fetch || !window.Promise) {
        return;
    }

    var list = aside.querySelector('.gh-community-list');
    var more = aside.querySelector('.gh-community-more');
    var mode = aside.getAttribute('data-mode') === 'posts' ? 'posts' : 'topics';
    var lang = document.documentElement.lang || undefined;
    var labels = {
        one: aside.getAttribute('data-label-reply') || 'reply',
        other: aside.getAttribute('data-label-replies') || 'replies',
        where: aside.getAttribute('data-label-in') || 'in'
    };

    more.href = ORIGIN + (mode === 'posts' ? '/posts' : '/latest');

    var getJSON = function (path) {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller && setTimeout(function () {
            controller.abort();
        }, TIMEOUT);

        return fetch(ORIGIN + path, {
            credentials: 'omit',
            headers: {Accept: 'application/json'},
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

    var SLUG = /^[\w%-]*$/;

    var topicUrl = function (slug, id, postNumber) {
        id = parseInt(id, 10);
        if (!(id > 0)) {
            return null;
        }
        slug = typeof slug === 'string' && SLUG.test(slug) && slug ? slug : '-';
        return ORIGIN + '/t/' + slug + '/' + id + (postNumber > 1 ? '/' + postNumber : '');
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
                return topic && !topic.pinned && !topic.pinned_globally && topic.visible !== false;
            })
            .map(function (topic) {
                var poster = (topic.posters || [])[0];
                var user = poster && users[poster.user_id];
                return {
                    url: topicUrl(topic.slug, topic.id),
                    title: String(topic.title || ''),
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
                return post && post.post_type === 1 && !post.hidden && !post.deleted_at;
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

    var row = function (entry) {
        var item = el('li', 'gh-community-item');
        var link = el('a', 'gh-community-link');
        link.href = entry.url;

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
            body.appendChild(el('span', 'gh-community-name', entry.title));
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
        if (mode === 'topics' && entry.replies) {
            var form = plurals && plurals.select(entry.replies) === 'one' ? labels.one : labels.other;
            meta.appendChild(el('span', null, entry.replies + ' ' + form));
        }
        body.appendChild(meta);

        link.appendChild(body);
        item.appendChild(link);
        return item;
    };

    getJSON(mode === 'posts' ? '/posts.json' : '/latest.json')
        .then(function (body) {
            var entries = (mode === 'posts' ? posts(body) : topics(body))
                .filter(function (entry) {
                    return entry.url && entry.title;
                })
                .slice(0, SHOWN);

            if (!entries.length) {
                return;
            }

            entries.forEach(function (entry) {
                list.appendChild(row(entry));
            });
            aside.hidden = false;
        })
        // Forum down, CORS not set up, or a timeout: the aside stays hidden
        // and the page keeps its one-column layout.
        .then(null, function () {});
})();
