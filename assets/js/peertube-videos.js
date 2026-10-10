/* Videos page (custom-videos.hbs + partials/peertube-videos.hbs). Ships
 * inside main.min.js; does nothing on pages without the .gh-videos shell.
 *
 * Lists videos from a self-hosted PeerTube through its public REST API, which
 * answers cross-origin (PeerTube mounts cors() on /api): the instance's own
 * videos, filtered by category when two or more are on offer - the ones the
 * setting lists, or else those of the newest videos. "todos" is every one.
 * Order is Random (the default), Trending or Latest. Nearing the end of the
 * grid loads the next 12 on its own, up to AUTO_BATCHES in a view; after
 * that "Cargar más" takes over, so the footer stays reachable.
 *
 * Nothing from the instance goes in through innerHTML: every string is set
 * with textContent, URLs are rebuilt on the instance origin, and the player
 * only loads when a visitor presses play.
 */
(function () {
    var section = document.querySelector('.gh-videos');

    if (!section || !window.fetch || !window.Promise) {
        return;
    }

    var PAGE = 12;
    // Batches a view loads without a click (the first included): 3 x 12.
    var AUTO_BATCHES = 3;
    // Random has no API sort: it shuffles each source's newest RANDOM_POOL
    // (the API's maximum page) once, then deals PAGE at a time.
    var RANDOM_POOL = 100;
    var TIMEOUT = 8000;
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var ALL = '';

    // "https://host" or "https://host | 15, 13 Educación": the instance, then
    // optionally the category ids to offer, each with its own name. Any path
    // on the URL (an old /c/channel setting) is ignored.
    var parseSource = function (raw) {
        var parts = String(raw || '').split('|');
        var url;

        try {
            url = new URL(parts[0].trim());
        } catch (e) {
            return null;
        }

        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
        }

        var categories = [];
        (parts[1] || '').split(',').forEach(function (item) {
            var match = item.trim().match(/^(\d{1,9})(?:\s+(.+))?$/);
            var known = match && categories.some(function (category) {
                return category.id === match[1];
            });
            if (match && !known) {
                categories.push({id: match[1], label: match[2] ? match[2].trim() : ''});
            }
        });

        return {origin: url.origin, categories: categories};
    };

    var source = parseSource(section.getAttribute('data-source'));

    if (!source) {
        return;
    }

    var grid = section.querySelector('.gh-videos-grid');
    var message = section.querySelector('.gh-videos-message');
    var categoryBox = section.querySelector('.gh-videos-category');
    var picker = section.querySelector('.gh-videos-select');
    var pickerValue = section.querySelector('.gh-videos-category-value');
    var names = section.querySelector('.gh-videos-names');
    var loading = section.querySelector('.gh-videos-loading');
    var loadButton = section.querySelector('.gh-videos-load');
    var more = section.querySelector('.gh-videos-more');
    var tabs = Array.prototype.slice.call(section.querySelectorAll('.gh-videos-tab'));
    var labelPlay = section.getAttribute('data-label-play') || 'Play';
    var labelLive = section.getAttribute('data-label-live') || 'Live';
    var labelAll = section.getAttribute('data-label-all') || 'All';
    var lang = document.documentElement.lang || undefined;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    var behavior = function () {
        return reduceMotion && reduceMotion.matches ? 'auto' : 'smooth';
    };

    /* Data
     * ------------------------------------------------------------------ */

    var getJSON = function (url) {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller && setTimeout(function () {
            controller.abort();
        }, TIMEOUT);

        return fetch(url, {
            credentials: 'omit',
            headers: {Accept: 'application/json'},
            signal: controller ? controller.signal : undefined
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.json();
            })
            .then(function (body) {
                clearTimeout(timer);
                return body;
            }, function (error) {
                clearTimeout(timer);
                throw error;
            });
    };

    // The instance's own videos, in any of the given categories (all of them
    // with none given).
    var endpoint = function (ids, sort, start, count) {
        return source.origin + '/api/v1/videos?start=' + start + '&count=' + count + '&sort=' + sort +
            '&nsfw=false&skipCount=true&isLocal=true' + ids.map(function (id) {
            return '&categoryOneOf=' + encodeURIComponent(id);
        }).join('');
    };

    // The same request twice (the "todos" random pool, which also lists the
    // categories) goes out once.
    var requests = {};
    var getOnce = function (url) {
        if (!requests[url]) {
            requests[url] = getJSON(url);
            requests[url].catch(function () {
                delete requests[url];
            });
        }
        return requests[url];
    };

    // Absolute http(s) URL or nothing. Paths resolve against the instance.
    var safeUrl = function (value) {
        if (typeof value !== 'string' || !value || /[\s,]/.test(value) || value.indexOf('//') === 0) {
            return null;
        }
        try {
            var url = new URL(value, source.origin);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
        } catch (e) {
            return null;
        }
    };

    var image = function (video) {
        // PeerTube >= 8.1 lists every thumbnail size; older ones have one
        // thumbnail (small) and one preview (large) path.
        var sizes = (Array.isArray(video.thumbnails) ? video.thumbnails : [])
            .map(function (thumb) {
                return thumb && {url: safeUrl(thumb.fileUrl), width: parseInt(thumb.width, 10)};
            })
            .filter(function (thumb) {
                return thumb && thumb.url && thumb.width > 0;
            })
            .sort(function (a, b) {
                return a.width - b.width;
            });

        if (sizes.length) {
            var fit = sizes.filter(function (thumb) {
                return thumb.width >= 560;
            })[0] || sizes[sizes.length - 1];

            return {
                src: fit.url,
                srcset: sizes.map(function (thumb) {
                    return thumb.url + ' ' + thumb.width + 'w';
                }).join(', ')
            };
        }

        var path = video.previewPath || video.thumbnailPath;
        return typeof path === 'string' && path.charAt(0) === '/' ? {src: safeUrl(path)} : null;
    };

    var normalize = function (video) {
        if (!video || typeof video.uuid !== 'string' || !UUID.test(video.uuid)) {
            return null;
        }

        var short = typeof video.shortUUID === 'string' && /^\w+$/.test(video.shortUUID)
            ? video.shortUUID
            : video.uuid;
        var published = new Date(video.publishedAt);

        return {
            uuid: video.uuid,
            title: String(video.name || ''),
            duration: Math.max(0, parseInt(video.duration, 10) || 0),
            live: video.isLive === true,
            published: isNaN(published) ? null : published,
            channel: video.channel && video.channel.displayName ? String(video.channel.displayName) : '',
            watch: source.origin + '/w/' + short,
            embed: source.origin + '/videos/embed/' + video.uuid,
            image: image(video)
        };
    };

    var shuffle = function (items) {
        for (var i = items.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var swap = items[i];
            items[i] = items[j];
            items[j] = swap;
        }
        return items;
    };

    /* Feeds. One per category choice and order, kept while the page is
     * open, so switching back shows what was already loaded. Latest and
     * Trending page through the API in its own order; Random shuffles the
     * newest RANDOM_POOL once and deals PAGE at a time.
     * ------------------------------------------------------------------ */

    var SORTS = {latest: '-publishedAt', trending: '-trending'};

    var videos = function (body) {
        return (body && Array.isArray(body.data) ? body.data : []).map(normalize).filter(Boolean);
    };

    var Feed = function (ids, mode) {
        this.ids = ids;
        this.mode = mode;
        this.shown = [];
        this.seen = {};
        this.start = 0;
        this.ended = false;
        this.failed = false;
        this.pool = null;
    };

    Feed.prototype.done = function () {
        return this.mode === 'random' ? !!this.pool && !this.pool.length : this.ended;
    };

    // Drops repeats: a video published while the reader pages through would
    // otherwise come back one page later.
    Feed.prototype.fresh = function (list) {
        var seen = this.seen;
        return list.filter(function (video) {
            return !seen[video.uuid] && (seen[video.uuid] = true);
        });
    };

    Feed.prototype.next = function () {
        var self = this;
        var fail = function () {
            self.failed = true;
            self.ended = true;
            return [];
        };

        if (this.mode === 'random') {
            var ready = this.pool ? Promise.resolve() : getOnce(endpoint(this.ids, '-publishedAt', 0, RANDOM_POOL))
                .then(videos, fail)
                .then(function (list) {
                    self.pool = shuffle(self.fresh(list));
                });

            return ready.then(function () {
                var batch = self.pool.splice(0, PAGE);
                self.shown = self.shown.concat(batch);
                return batch;
            });
        }

        var url = endpoint(this.ids, SORTS[this.mode], this.start, PAGE);
        this.start += PAGE;

        return getJSON(url).then(function (body) {
            var list = videos(body);
            if (list.length < PAGE) {
                self.ended = true;
            }
            return list;
        }, fail).then(function (list) {
            var batch = self.fresh(list);
            self.shown = self.shown.concat(batch);
            return batch;
        });
    };

    var feeds = {};

    // "todos" is the setting's categories together, or everything without a
    // list.
    var feedFor = function (category, mode) {
        var key = category + '|' + mode;
        if (!feeds[key]) {
            var ids = category ? [category] : source.categories.map(function (item) {
                return item.id;
            });
            feeds[key] = new Feed(ids, mode);
        }
        return feeds[key];
    };

    /* Cards
     * ------------------------------------------------------------------ */

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

    var duration = function (seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor(seconds % 3600 / 60);
        var s = seconds % 60;
        var pad = function (n) {
            return (n < 10 ? '0' : '') + n;
        };
        return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
    };

    var relative = window.Intl && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(lang, {numeric: 'auto'})
        : null;
    var UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

    var ago = function (date) {
        var seconds = (date - Date.now()) / 1000;

        if (!relative) {
            return date.toLocaleDateString(lang);
        }
        for (var i = 0; i < UNITS.length; i++) {
            if (Math.abs(seconds) >= UNITS[i][1]) {
                return relative.format(Math.round(seconds / UNITS[i][1]), UNITS[i][0]);
            }
        }
        return relative.format(0, 'minute');
    };

    /* Player stage: the clicked video plays above the grid at the width of
     * the page. Another card swaps it; close or Esc unloads the iframe,
     * which stops playback, and returns focus to the card it came from.
     * ------------------------------------------------------------------ */

    var stage = section.querySelector('.gh-videos-stage');
    var screen = stage.querySelector('.gh-videos-screen');
    var nowTitle = stage.querySelector('.gh-videos-now-title');
    var nowMeta = stage.querySelector('.gh-videos-now-meta');
    var closer = stage.querySelector('.gh-videos-close');
    var playing = null;

    var mark = function () {
        var items = grid.querySelectorAll('.gh-video');
        for (var i = 0; i < items.length; i++) {
            var on = !!playing && items[i].getAttribute('data-uuid') === playing.uuid;
            items[i].classList.toggle('is-playing', on);
            var button = items[i].querySelector('.gh-video-play');
            if (on) {
                button.setAttribute('aria-current', 'true');
            } else {
                button.removeAttribute('aria-current');
            }
        }
    };

    var stop = function (returnFocus) {
        if (!playing) {
            return;
        }
        var from = playing.button;
        playing = null;
        screen.textContent = '';
        stage.hidden = true;
        mark();
        if (returnFocus && from && document.body.contains(from)) {
            from.focus();
        }
    };

    var play = function (video, button) {
        var frame = document.createElement('iframe');
        // p2p=0: no WebRTC peer-to-peer, so viewers' IPs are not shared with
        // other viewers. warningTitle/peertubeLink drop the player's chrome.
        frame.src = video.embed + '?autoplay=1&p2p=0&warningTitle=0&peertubeLink=0';
        frame.title = video.title;
        frame.allow = 'autoplay; fullscreen; picture-in-picture';
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox');
        frame.referrerPolicy = 'strict-origin-when-cross-origin';

        screen.textContent = '';
        screen.appendChild(frame);

        nowTitle.textContent = video.title;
        nowTitle.href = video.watch;
        nowTitle.target = '_blank';
        nowTitle.rel = 'noopener';
        nowMeta.textContent = '';
        [video.channel, video.published ? ago(video.published) : ''].forEach(function (part) {
            if (part) {
                nowMeta.appendChild(el('span', null, part));
            }
        });

        playing = {uuid: video.uuid, button: button};
        stage.hidden = false;
        mark();

        stage.scrollIntoView({block: 'start', behavior: behavior()});
        frame.focus();
    };

    closer.addEventListener('click', function () {
        stop(true);
    });

    // Esc closes the stage. Keys pressed inside the player go to its own
    // (cross-origin) document and never reach this listener.
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && playing) {
            stop(true);
        }
    });

    var card = function (video, index) {
        var item = el('li', 'gh-video');
        item.setAttribute('data-uuid', video.uuid);
        var media = el('div', 'gh-video-media');
        var button = el('button', 'gh-video-play');

        button.type = 'button';
        button.setAttribute('aria-label', labelPlay + ': ' + video.title);

        if (video.image && video.image.src) {
            var img = el('img');
            img.src = video.image.src;
            if (video.image.srcset) {
                img.srcset = video.image.srcset;
                img.sizes = '(min-width: 992px) 300px, (min-width: 768px) 46vw, 92vw';
            }
            img.alt = '';
            img.width = 560;
            img.height = 315;
            img.decoding = 'async';
            // The first row is on screen at load; the rest wait for a scroll.
            img.loading = index < 4 ? 'eager' : 'lazy';
            button.appendChild(img);
        }

        var icon = el('span', 'gh-video-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
        button.appendChild(icon);

        if (video.live) {
            button.appendChild(el('span', 'gh-video-badge is-live', labelLive));
        } else if (video.duration) {
            var badge = el('span', 'gh-video-badge', duration(video.duration));
            badge.setAttribute('aria-hidden', 'true');
            button.appendChild(badge);
        }

        button.addEventListener('click', function () {
            play(video, button);
        });

        media.appendChild(button);
        item.appendChild(media);

        var title = el('h3', 'gh-video-title');
        var link = el('a', null, video.title);
        link.href = video.watch;
        link.target = '_blank';
        link.rel = 'noopener';
        title.appendChild(link);
        item.appendChild(title);

        var meta = el('p', 'gh-video-meta');
        if (video.channel) {
            meta.appendChild(el('span', null, video.channel));
        }
        if (video.published) {
            var time = el('time', null, ago(video.published));
            time.dateTime = video.published.toISOString();
            time.title = video.published.toLocaleDateString(lang, {dateStyle: 'long'});
            meta.appendChild(time);
        }
        item.appendChild(meta);

        return item;
    };

    /* State and controls
     * ------------------------------------------------------------------ */

    var state = {category: ALL, mode: 'random'};
    var shown = false;
    var request = 0;
    var busy = false;
    // Batches loaded in the current view (category + order); reset by show().
    var batches = 0;
    var watcher = null;

    // PeerTube's own browse page for the category, or the instance.
    var moreUrl = function (category) {
        return source.origin + (category ? '/videos/browse?categoryOneOf=' + encodeURIComponent(category) : '/');
    };

    // The button only once the automatic batches are used up (or when the
    // browser cannot watch the scroll position); never with nothing left.
    var sync = function (feed) {
        var auto = !!watcher && batches < AUTO_BATCHES;
        loadButton.hidden = feed.done() || auto;
        more.href = moreUrl(state.category);
    };

    var load = function (feed, ticket) {
        busy = true;
        section.setAttribute('aria-busy', 'true');
        loading.classList.add('is-active');
        loadButton.disabled = true;

        var settle = function () {
            if (ticket === request) {
                busy = false;
                section.removeAttribute('aria-busy');
                loading.classList.remove('is-active');
                loadButton.disabled = false;
                grid.style.minHeight = '';
            }
        };

        return feed.next().then(function (batch) {
            if (ticket !== request) {
                return;
            }
            batches++;
            var offset = grid.children.length;
            batch.forEach(function (video, i) {
                grid.appendChild(card(video, offset + i));
            });
            mark();

            var empty = !grid.children.length;
            message.hidden = !empty;
            if (empty && !shown && feed.failed) {
                // The first request failed outright: keep the page as it was.
                return;
            }
            if (!shown) {
                shown = true;
                section.hidden = false;
            }
            sync(feed);
        }).then(function () {
            settle();
            keepFilling();
        }, function () {
            settle();
            if (ticket === request) {
                message.hidden = false;
            }
        });
    };

    // Show a feed from the start: its loaded cards, then its first batch if
    // it has none. A new view gets the automatic batches again.
    var show = function () {
        var feed = feedFor(state.category, state.mode);
        var ticket = ++request;

        busy = false;
        // An empty grid would shrink the page under the reader, and the
        // browser's scroll anchoring then follows the footer down as the new
        // cards arrive. Hold the height until they land.
        grid.style.minHeight = feed.shown.length ? '' : grid.offsetHeight + 'px';
        grid.textContent = '';
        feed.shown.forEach(function (video, i) {
            grid.appendChild(card(video, i));
        });
        mark();
        batches = Math.ceil(feed.shown.length / PAGE);

        // Bring the controls back into view if the reader had scrolled past.
        // Instant: the page sets scroll-behavior: smooth, and the grid has
        // just been swapped anyway.
        if (section.getBoundingClientRect().top < 0) {
            section.scrollIntoView({block: 'start', behavior: 'instant'});
        }

        if (feed.shown.length) {
            message.hidden = true;
            sync(feed);
            return Promise.resolve();
        }
        return load(feed, ticket);
    };

    // The watcher only fires when the loading row enters range; a short batch
    // can leave it in range, so check again after each one.
    var keepFilling = function () {
        if (!watcher || !shown || batches >= AUTO_BATCHES) {
            return;
        }
        window.requestAnimationFrame(function () {
            if (loading.getBoundingClientRect().top < window.innerHeight + 600) {
                loadNext();
            }
        });
    };

    var loadNext = function () {
        var feed = feedFor(state.category, state.mode);
        if (busy || feed.done()) {
            return Promise.resolve();
        }
        return load(feed, request);
    };

    loadButton.addEventListener('click', function () {
        var first = grid.children.length;
        loadNext().then(function () {
            // Land keyboard users on the first new card.
            var next = grid.children[first];
            var target = next && next.querySelector('.gh-video-play');
            if (target && document.activeElement === loadButton) {
                target.focus();
            }
        });
    });

    // Automatic batches: the loading row sits right after the grid, so it
    // comes into range (600px ahead) as the reader nears the end.
    if (window.IntersectionObserver) {
        watcher = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting && shown && batches < AUTO_BATCHES) {
                loadNext();
            }
        }, {rootMargin: '0px 0px 600px 0px'});
        watcher.observe(loading);
    }

    var press = function (buttons, active) {
        buttons.forEach(function (button) {
            button.setAttribute('aria-pressed', String(button === active));
        });
    };

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var mode = tab.getAttribute('data-mode');
            if (mode === state.mode) {
                return;
            }
            state.mode = mode;
            press(tabs, tab);
            show();
        });
    });

    /* Category picker: with two or more categories on offer. Built-in ones
     * (ids 1-18) take the site's translation from the template; others the
     * name the setting gives, else the instance's. Without a list in the
     * setting, the offer is the categories of the newest videos - the same
     * request as the "todos" random pool, so it costs nothing extra.
     * ------------------------------------------------------------------ */

    var translated = {};
    if (names && names.content) {
        Array.prototype.forEach.call(names.content.querySelectorAll('option'), function (option) {
            translated[option.value] = option.textContent.trim();
        });
    }

    var syncValue = function () {
        var option = picker.options[picker.selectedIndex];
        pickerValue.textContent = option ? option.textContent : '';
    };

    var build = function (categories) {
        if (categories.length < 2) {
            return;
        }

        var all = el('option', null, labelAll);
        all.value = ALL;
        picker.appendChild(all);
        categories.forEach(function (category) {
            var option = el('option', null, category.label || category.id);
            option.value = category.id;
            picker.appendChild(option);
        });

        picker.value = ALL;
        syncValue();
        picker.addEventListener('change', function () {
            syncValue();
            if (picker.value !== state.category) {
                state.category = picker.value;
                show();
            }
        });
        categoryBox.hidden = false;
    };

    var name = function (id, given, instance) {
        return given || translated[id] || instance || '';
    };

    if (source.categories.length) {
        var unnamed = source.categories.some(function (category) {
            return !name(category.id, category.label);
        });
        // Only for ids the setting does not name and PeerTube does not ship.
        (unnamed ? getJSON(source.origin + '/api/v1/videos/categories') : Promise.resolve({}))
            .then(null, function () {
                return {};
            })
            .then(function (labels) {
                build(source.categories.map(function (category) {
                    var instance = labels && typeof labels[category.id] === 'string' ? labels[category.id] : '';
                    return {id: category.id, label: name(category.id, category.label, instance)};
                }));
            });
    } else {
        getOnce(endpoint([], '-publishedAt', 0, RANDOM_POOL)).then(function (body) {
            var found = {};
            (body && Array.isArray(body.data) ? body.data : []).forEach(function (video) {
                var category = video && video.category;
                var id = category && category.id !== null && category.id !== undefined ? String(category.id) : '';
                if (/^\d{1,9}$/.test(id) && !found[id]) {
                    found[id] = {id: id, label: name(id, '', typeof category.label === 'string' ? category.label : '')};
                }
            });
            build(Object.keys(found).map(function (id) {
                return found[id];
            }).sort(function (a, b) {
                return String(a.label).localeCompare(String(b.label), lang);
            }));
        }, function () {});
    }

    show();
})();
