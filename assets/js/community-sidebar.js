/* Community sidebar (partials/community-sidebar.hbs) and the category cards
 * after a post's comments (partials/community-related.hbs). Ships inside
 * main.min.js.
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
    var STORE = 'gh-community-mode';
    var MODES = {topics: '/latest.json', posts: '/posts.json'};

    // The visitor's last pick wins over the theme setting's default.
    // Storage can throw (private mode, blocked site data): fall back.
    var stored = null;
    try {
        stored = window.localStorage.getItem(STORE);
    } catch (e) {}
    var mode = MODES[stored] ? stored : ((aside && aside.getAttribute('data-mode')) === 'posts' ? 'posts' : 'topics');
    var lang = document.documentElement.lang || undefined;
    // Both partials carry the same translated labels; either will do.
    var labelled = aside || related;
    var labels = {
        one: labelled.getAttribute('data-label-reply') || 'reply',
        other: labelled.getAttribute('data-label-replies') || 'replies',
        where: labelled.getAttribute('data-label-in') || 'in'
    };

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
                return topic && !topic.pinned && !topic.pinned_globally && topic.visible !== false;
            })
            .map(function (topic) {
                var poster = (topic.posters || [])[0];
                var user = poster && users[poster.user_id];
                return {
                    url: topicUrl(topic.slug, topic.id),
                    image: image(topic.image_url),
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

    var cache = {};

    // One request per list, the first time it is picked. A failure is not
    // cached, so picking that list again retries.
    var load = function (which) {
        if (!cache[which]) {
            cache[which] = getJSON(MODES[which]).then(function (body) {
                return (which === 'posts' ? posts(body) : topics(body))
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
            more.href = ORIGIN + (which === 'posts' ? '/posts' : '/latest');
            aside.hidden = false;
        }).then(null, function () {
            if (ticket !== request) {
                return;
            }
            // Before the aside was ever shown this keeps it hidden (forum
            // down, no CORS). After that, say so in place of the list.
            list.hidden = true;
            message.hidden = false;
        }).then(function () {
            if (ticket === request) {
                aside.removeAttribute('aria-busy');
            }
        });
    };

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
        return item;
    };

    // The forum category with the post's primary tag slug (tags and categories
    // are kept in step). /c/<slug>/... redirects to the id-qualified path; the
    // redirect carries the CORS headers too. No category, no topics or no
    // answer: the section keeps `hidden`.
    if (related) {
        var category = related.getAttribute('data-category');
        if (category && SLUG.test(category)) {
            getJSON('/c/' + category + '/l/latest.json').then(function (body) {
                var entries = topics(body)
                    .filter(function (entry) {
                        return entry.url && entry.title;
                    })
                    .slice(0, RELATED);
                if (!entries.length) {
                    return;
                }
                var cards = related.querySelector('.gh-community-cards');
                entries.forEach(function (entry) {
                    cards.appendChild(card(entry));
                });
                related.querySelector('.gh-community-more').href = ORIGIN + '/c/' + category;
                related.hidden = false;
            }, function () {});
        }
    }

    if (!aside) {
        return;
    }

    picker.value = mode;
    picker.addEventListener('change', function () {
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
