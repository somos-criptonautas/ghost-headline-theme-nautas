/* A channel's videos (partials/channel-videos.hbs, tag pages). Ships inside
 * main.min.js; does nothing without the .gh-channel-videos shell.
 *
 * The PeerTube category whose name is the tag's slug (bienestar, taboo...)
 * gives the newest three of the instance's own videos: the first large, the
 * other two in a list under it. Play loads the player in place of the large
 * one; a video from the list takes its place and plays. As on /videos
 * (peertube-videos.js), nothing from the instance goes in through innerHTML
 * and the player only loads on play.
 */
(function () {
    var section = document.querySelector('.gh-channel-videos');

    if (!section || !window.fetch || !window.Promise) {
        return;
    }

    var origin;
    try {
        origin = new URL(String(section.getAttribute('data-source') || '').split('|')[0].trim()).origin;
    } catch (e) {
        return;
    }

    var slug = (section.getAttribute('data-category') || '').toLowerCase();
    var labelPlay = section.getAttribute('data-label-play') || 'Play';
    var main = section.querySelector('.gh-channel-videos-main');
    var caption = section.querySelector('.gh-channel-videos-caption');
    var list = section.querySelector('.gh-channel-videos-list');
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!slug) {
        return;
    }

    var get = function (path) {
        return fetch(origin + path, {credentials: 'omit', headers: {Accept: 'application/json'}}).then(function (response) {
            return response.ok ? response.json() : Promise.reject(new Error(response.status));
        });
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

    // Instance paths only ("/lazy-static/..."), rebuilt on its origin.
    var path = function (value) {
        return typeof value === 'string' && /^\/[\w./-]+$/.test(value) ? origin + value : null;
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

    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';

    var picture = function (src) {
        var img = el('img');
        if (src) {
            img.src = src;
        }
        img.alt = '';
        img.width = 560;
        img.height = 315;
        img.decoding = 'async';
        img.loading = 'lazy';
        return img;
    };

    var badge = function (video) {
        var seconds = Math.max(0, parseInt(video.duration, 10) || 0);
        var node = seconds ? el('span', 'gh-video-badge', duration(seconds)) : null;
        if (node) {
            node.setAttribute('aria-hidden', 'true');
        }
        return node;
    };

    var play = function (video, media) {
        var frame = document.createElement('iframe');
        // Same player settings as /videos: no peer-to-peer, no extra chrome.
        frame.src = origin + '/videos/embed/' + video.uuid + '?autoplay=1&p2p=0&warningTitle=0&peertubeLink=0&subtitle=' + (document.documentElement.lang || 'es').slice(0, 2);
        frame.title = video.name;
        frame.allow = 'autoplay; fullscreen; picture-in-picture';
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox');
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        media.textContent = '';
        media.appendChild(frame);
        frame.focus();
    };

    var watch = function (video) {
        return origin + '/w/' + (/^\w+$/.test(video.shortUUID || '') ? video.shortUUID : video.uuid);
    };

    var playIcon = function () {
        var icon = el('span', 'gh-video-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = ICON;
        return icon;
    };

    // The large one: its image and play button, and its title under it.
    var show = function (video, autoplay) {
        main.textContent = '';
        var media = el('div', 'gh-video-media');
        var button = el('button', 'gh-video-play');
        button.type = 'button';
        button.setAttribute('aria-label', labelPlay + ': ' + video.name);
        button.appendChild(picture(path(video.previewPath) || path(video.thumbnailPath)));
        button.appendChild(playIcon());
        var time = badge(video);
        if (time) {
            button.appendChild(time);
        }
        button.addEventListener('click', function () {
            play(video, media);
        });
        media.appendChild(button);
        main.appendChild(media);

        caption.textContent = '';
        var link = el('a', null, video.name);
        link.href = watch(video);
        link.target = '_blank';
        link.rel = 'noopener';
        caption.appendChild(link);

        if (autoplay) {
            play(video, media);
        }
    };

    var render = function (videos) {
        var current = videos[0];
        show(current, false);

        videos.slice(1).forEach(function (video) {
            var item = el('li', 'gh-channel-videos-item');
            var button = el('button', 'gh-channel-videos-pick');
            button.type = 'button';
            button.setAttribute('aria-label', labelPlay + ': ' + video.name);
            // The thumbnail fills the item; the title sits over its foot.
            var thumb = el('span', 'gh-channel-videos-thumb');
            thumb.appendChild(picture(path(video.previewPath) || path(video.thumbnailPath)));
            thumb.appendChild(playIcon());
            var time = badge(video);
            if (time) {
                thumb.appendChild(time);
            }
            thumb.appendChild(el('span', 'gh-channel-videos-name', video.name));
            button.appendChild(thumb);
            item.appendChild(button);
            list.appendChild(item);
            button.addEventListener('click', function () {
                // The one playing moves into the list in the picked one's place.
                var picked = video;
                video = current;
                current = picked;
                button.setAttribute('aria-label', labelPlay + ': ' + video.name);
                thumb.querySelector('img').src = path(video.previewPath) || path(video.thumbnailPath) || '';
                var old = thumb.querySelector('.gh-video-badge');
                if (old) {
                    old.remove();
                }
                var next = badge(video);
                if (next) {
                    thumb.insertBefore(next, thumb.querySelector('.gh-channel-videos-name'));
                }
                thumb.querySelector('.gh-channel-videos-name').textContent = video.name;
                show(current, true);
            });
        });

        section.hidden = false;
    };

    get('/api/v1/videos/categories').then(function (categories) {
        var id = Object.keys(categories || {}).filter(function (key) {
            return /^\d+$/.test(key) && String(categories[key]).toLowerCase() === slug;
        })[0];
        if (!id) {
            return Promise.reject(new Error('no category'));
        }
        return get('/api/v1/videos?categoryOneOf=' + id + '&count=3&sort=-publishedAt&isLocal=true&nsfw=false&skipCount=true');
    }).then(function (body) {
        var videos = (body && Array.isArray(body.data) ? body.data : []).filter(function (video) {
            return video && UUID.test(video.uuid || '') && video.name;
        });
        if (videos.length) {
            render(videos);
        }
    }, function () {});
})();
