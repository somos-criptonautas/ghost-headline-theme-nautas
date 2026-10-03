/* Homepage video row (partials/peertube-videos.hbs). Ships inside main.min.js.
 *
 * Lists videos from a self-hosted PeerTube through its public REST API, which
 * answers cross-origin (PeerTube mounts cors() on /api). One request per
 * channel, since the API has no multi-channel filter, merged client side.
 *
 * Nothing from the instance goes in through innerHTML: every string is set
 * with textContent, URLs are rebuilt on the instance origin and the player
 * only loads when a visitor presses play - until then the page fetches JSON
 * and thumbnails, never the PeerTube player.
 */
(function () {
    var section = document.querySelector('.gh-videos');

    if (!section || !window.fetch || !window.Promise) {
        return;
    }

    var SHOWN = 6;
    // Random has no API sort, so it shuffles the newest POOL of each channel.
    var POOL = 50;
    var TIMEOUT = 8000;
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // PeerTube actor names, optionally @host for a federated channel.
    var HANDLE = /^[\w.-]+(@[\w.-]+(:\d+)?)?$/;

    var parseSource = function (raw) {
        var url;

        try {
            url = new URL(String(raw || '').trim());
        } catch (e) {
            return null;
        }

        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
        }

        // /c/a,b is today's channel URL, /video-channels/a the older one.
        var match = url.pathname.match(/^\/(?:c|video-channels)\/([^/]+)/);
        var channels = [];

        if (match) {
            try {
                channels = decodeURIComponent(match[1]).split(',');
            } catch (e) {
                return null;
            }
            channels = channels
                .map(function (name) {
                    return name.trim();
                })
                .filter(function (name, i, all) {
                    return HANDLE.test(name) && all.indexOf(name) === i;
                });

            // A channel path that held nothing usable: showing the whole
            // instance instead would not be what was asked for.
            if (!channels.length) {
                return null;
            }
        }

        return {origin: url.origin, channels: channels};
    };

    var source = parseSource(section.getAttribute('data-source'));

    if (!source) {
        return;
    }

    var track = section.querySelector('.gh-videos-track');
    var list = section.querySelector('.gh-videos-list');
    var message = section.querySelector('.gh-videos-message');
    var dotsBox = section.querySelector('.gh-videos-dots');
    var more = section.querySelector('.gh-videos-more');
    var tabs = Array.prototype.slice.call(section.querySelectorAll('.gh-videos-tab'));
    var arrows = Array.prototype.slice.call(section.querySelectorAll('.gh-videos-arrow'));
    var labelPlay = section.getAttribute('data-label-play') || 'Play';
    var labelLive = section.getAttribute('data-label-live') || 'Live';
    var lang = document.documentElement.lang || undefined;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    more.href = source.channels.length === 1
        ? source.origin + '/c/' + encodeURIComponent(source.channels[0]) + '/videos'
        : source.origin + '/';

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
                return body && Array.isArray(body.data) ? body.data : [];
            }, function (error) {
                clearTimeout(timer);
                throw error;
            });
    };

    // Promise.allSettled without needing Safari 13: a channel that fails
    // resolves to null, so one dead channel does not empty the whole row.
    var settle = function (promises) {
        return Promise.all(promises.map(function (promise) {
            return promise.then(null, function () {
                return null;
            });
        }));
    };

    var endpoints = function (sort, count) {
        var query = '?count=' + count + '&sort=' + sort + '&nsfw=false&skipCount=true';

        if (!source.channels.length) {
            return [source.origin + '/api/v1/videos' + query + '&isLocal=true'];
        }

        return source.channels.map(function (name) {
            return source.origin + '/api/v1/video-channels/' + encodeURIComponent(name) + '/videos' + query;
        });
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

    var unique = function (videos) {
        var seen = {};
        return videos.filter(function (video) {
            if (!video || seen[video.uuid]) {
                return false;
            }
            seen[video.uuid] = true;
            return true;
        });
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

    var flatten = function (lists) {
        return [].concat.apply([], lists);
    };

    var MODES = {
        latest: {
            sort: '-publishedAt',
            count: SHOWN,
            merge: function (lists) {
                return flatten(lists).sort(function (a, b) {
                    return (b.published || 0) - (a.published || 0);
                });
            }
        },
        trending: {
            sort: '-trending',
            count: SHOWN,
            // The trending score is not in the response, so channels cannot
            // be ranked against each other: take turns, best of each first.
            merge: function (lists) {
                var merged = [];
                for (var i = 0; i < SHOWN; i++) {
                    for (var c = 0; c < lists.length; c++) {
                        if (lists[c][i]) {
                            merged.push(lists[c][i]);
                        }
                    }
                }
                return merged;
            }
        },
        random: {
            sort: '-publishedAt',
            count: POOL,
            merge: flatten,
            // Reshuffled from the cached pool every time the tab is chosen.
            pick: shuffle
        }
    };

    var cache = {};

    var load = function (mode) {
        if (!cache[mode]) {
            var spec = MODES[mode];

            cache[mode] = settle(endpoints(spec.sort, spec.count).map(getJSON))
                .then(function (lists) {
                    lists = lists.filter(Boolean);
                    if (!lists.length) {
                        throw new Error('unreachable');
                    }
                    return unique(spec.merge(lists.map(function (videos) {
                        return videos.map(normalize).filter(Boolean);
                    })));
                });

            // Do not cache a failure: choosing the tab again retries.
            cache[mode].then(null, function () {
                delete cache[mode];
            });
        }

        return cache[mode].then(function (videos) {
            var pick = MODES[mode].pick;
            return (pick ? pick(videos.slice()) : videos).slice(0, SHOWN);
        });
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

    /* Player stage: a full-width player above the row, so a video plays
     * at the size of the block rather than the size of its card. Opening
     * another card swaps the video; close (or Esc) unloads the iframe,
     * which stops playback, and returns focus to the card it came from.
     * ------------------------------------------------------------------ */

    var stage = section.querySelector('.gh-videos-stage');
    var screen = stage.querySelector('.gh-videos-screen');
    var nowTitle = stage.querySelector('.gh-videos-now-title');
    var nowMeta = stage.querySelector('.gh-videos-now-meta');
    var closer = stage.querySelector('.gh-videos-close');
    var playing = null;

    // Highlight the card whose video is on the stage, in whichever list is
    // showing - it survives switching tabs, since the stage does too.
    var mark = function () {
        var items = list.querySelectorAll('.gh-video');
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
        nowMeta.textContent = '';
        [video.channel, video.published ? ago(video.published) : ''].forEach(function (part) {
            if (part) {
                nowMeta.appendChild(el('span', null, part));
            }
        });

        playing = {uuid: video.uuid, button: button};
        stage.hidden = false;
        mark();

        stage.scrollIntoView({block: 'nearest', behavior: behavior()});
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
                img.sizes = '(min-width: 992px) 280px, (min-width: 768px) 42vw, 82vw';
            }
            img.alt = '';
            img.width = 560;
            img.height = 315;
            img.decoding = 'async';
            // The first cards are on screen at load; the rest wait for a scroll.
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

    /* Scrolling
     * ------------------------------------------------------------------ */

    var cards = [];
    var dots = [];
    var ratios = [];
    var observer = null;

    var behavior = function () {
        return reduceMotion && reduceMotion.matches ? 'auto' : 'smooth';
    };

    // Distance between two card starts: card width plus the grid gap.
    var step = function () {
        if (cards.length > 1) {
            return cards[1].offsetLeft - cards[0].offsetLeft;
        }
        return track.clientWidth;
    };

    var scrollByCards = function (count) {
        track.scrollBy({left: count * step(), behavior: behavior()});
    };

    var page = function () {
        return Math.max(1, Math.floor((track.clientWidth + 1) / step()));
    };

    var update = function () {
        // Visible enough to count as "in view" - fractional widths and
        // sub-pixel scroll positions never reach a clean 1.
        var start = ratios[0] > 0.9;
        var end = ratios[cards.length - 1] > 0.9;
        var active = -1;

        for (var i = 0; i < ratios.length; i++) {
            if (ratios[i] > 0.6) {
                active = i;
                break;
            }
        }

        arrows[0].disabled = start;
        arrows[1].disabled = end;
        section.classList.toggle('is-static', start && end);

        dots.forEach(function (dot, j) {
            dot.classList.toggle('is-active', j === active);
        });
    };

    var watch = function () {
        if (observer) {
            observer.disconnect();
        }

        ratios = cards.map(function () {
            return 0;
        });

        // No IntersectionObserver: arrows stay usable, and scrollBy past
        // either end is a no-op anyway.
        if (!window.IntersectionObserver) {
            arrows[0].disabled = false;
            arrows[1].disabled = false;
            return;
        }

        observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                ratios[cards.indexOf(entry.target)] = entry.intersectionRatio;
            });
            update();
        }, {root: track, threshold: [0, 0.6, 0.9, 1]});

        cards.forEach(function (item) {
            observer.observe(item);
        });
    };

    arrows.forEach(function (arrow) {
        arrow.addEventListener('click', function () {
            scrollByCards(Number(arrow.getAttribute('data-dir')) * page());
        });
    });

    track.addEventListener('keydown', function (event) {
        var keys = {ArrowLeft: -1, ArrowRight: 1};

        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (keys[event.key]) {
            scrollByCards(keys[event.key]);
        } else if (event.key === 'Home' || event.key === 'End') {
            track.scrollTo({left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: behavior()});
        } else {
            return;
        }
        event.preventDefault();
    });

    /* Tabs
     * ------------------------------------------------------------------ */

    var shown = false;
    var request = 0;

    var render = function (videos) {
        list.textContent = '';
        dotsBox.textContent = '';

        cards = videos.map(card);
        cards.forEach(function (item) {
            list.appendChild(item);
        });

        dots = cards.map(function () {
            return dotsBox.appendChild(el('span', 'gh-videos-dot'));
        });

        track.scrollLeft = 0;
        watch();
        mark();
    };

    var select = function (tab) {
        var mode = tab.getAttribute('data-mode');
        var ticket = ++request;

        tabs.forEach(function (other) {
            var selected = other === tab;
            other.setAttribute('aria-selected', String(selected));
            other.tabIndex = selected ? 0 : -1;
        });
        track.setAttribute('aria-labelledby', tab.id);
        section.setAttribute('aria-busy', 'true');

        load(mode)
            .then(function (videos) {
                if (ticket !== request) {
                    return;
                }
                if (!videos.length) {
                    throw new Error('empty');
                }
                message.hidden = true;
                track.hidden = false;
                render(videos);
                if (!shown) {
                    shown = true;
                    section.hidden = false;
                }
            })
            .then(null, function () {
                if (ticket !== request) {
                    return;
                }
                // First load failed: the section was never shown, keep it so.
                // A later tab failing says so in place of the row; a video
                // already on the stage keeps playing.
                track.hidden = true;
                message.hidden = false;
                section.classList.add('is-static');
            })
            .then(function () {
                if (ticket === request) {
                    section.removeAttribute('aria-busy');
                }
            });
    };

    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () {
            // Re-choosing Random deals a new set; the others would just
            // re-render the same six.
            if (tab.getAttribute('aria-selected') !== 'true' || tab.getAttribute('data-mode') === 'random') {
                select(tab);
            }
        });

        // Tablist keyboard pattern: arrows and Home/End move and select.
        tab.addEventListener('keydown', function (event) {
            var target = {
                ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
                ArrowRight: tabs[(i + 1) % tabs.length],
                Home: tabs[0],
                End: tabs[tabs.length - 1]
            }[event.key];

            if (target) {
                event.preventDefault();
                target.focus();
                select(target);
            }
        });
    });

    select(tabs[0]);
})();
