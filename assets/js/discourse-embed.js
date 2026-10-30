/* Discourse comments embed: loader, auto-height, light/dark sync.
 *
 * A file rather than inline <script> in partials/comments.hbs: the site's CSP
 * script-src carries sha256 hashes, and per spec a hash makes the browser
 * ignore 'unsafe-inline', so an inline block stops running the moment it is
 * edited. Anything under /assets/ is already allowed - same reason theme.js
 * lives in a file. Ships inside main.min.js via the assets/js/*.js glob.
 *
 * The Discourse half is common/head_tag.html in discourse-horizon-mod-nautas:
 * it pings 'discourse-embed-ready', reports its content height, and applies
 * the {theme} messages sent from here.
 */
(function () {
    // The "Discourse URL" theme setting, on <html> (default.hbs).
    var DISCOURSE_ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var container = document.getElementById('discourse-comments');
    var embedWindow = null;

    // Loader. Only post templates render the container.
    if (DISCOURSE_ORIGIN && container && container.dataset.embedUrl) {
        window.DiscourseEmbed = {
            discourseUrl: DISCOURSE_ORIGIN + '/',
            // Both languages share the Spanish article's topic; slugs are identical.
            discourseEmbedUrl: container.dataset.embedUrl.replace('//en.criptonautas.co/', '//criptonautas.co/'),
            fullApp: true,
            // Starting height only - replaced by the first height report, so
            // the whole thread shows without an inner scrollbar.
            embedHeight: '600px',
            // embed.js makes fullApp iframes loading="lazy", so the app only
            // began booting once the comments were nearly on screen. We pick
            // the moment instead (below).
            lazyLoad: false,
            discourseReferrerPolicy: 'no-referrer-when-downgrade'
        };

        var started = false;
        var start = function () {
            if (started) {
                return;
            }
            started = true;
            window.removeEventListener('scroll', check);
            // Same URL as the <link rel="prefetch"> in default.hbs, so this
            // comes from the cache.
            var script = document.createElement('script');
            script.async = true;
            script.src = window.DiscourseEmbed.discourseUrl + 'javascripts/embed.js';
            document.head.appendChild(script);
        };
        // From 70% of the page on, so the forum app is up by the time the
        // reader reaches the comments. Short posts, and links to #comments,
        // start at once.
        var check = function () {
            var root = document.documentElement;
            if (window.scrollY + window.innerHeight >= root.scrollHeight * 0.7 || location.hash === '#comments') {
                start();
            }
        };
        window.addEventListener('scroll', check, {passive: true});
        window.addEventListener('hashchange', check);
        check();
    }

    function notifyEmbed() {
        // Before the handshake the frame is still about:blank (same origin as
        // us), and posting to it with a foreign target origin throws. So this
        // stays a no-op until the embed has identified itself.
        if (!embedWindow) {
            return;
        }
        embedWindow.postMessage(
            {theme: document.documentElement.getAttribute('data-theme')},
            DISCOURSE_ORIGIN
        );
    }

    // Match by window rather than by an id embed.js may change.
    function frameFor(source) {
        var frames = container ? container.getElementsByTagName('iframe') : [];
        for (var i = 0; i < frames.length; i++) {
            if (frames[i].contentWindow === source) {
                return frames[i];
            }
        }
        return null;
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== DISCOURSE_ORIGIN) {
            return;
        }

        if (event.data === 'discourse-embed-ready') {
            // Held for later toggles - the handshake is not repeated.
            embedWindow = event.source;
            notifyEmbed();
            return;
        }

        if (event.data && event.data.type === 'nautas-embed-height') {
            var frame = frameFor(event.source);
            var height = Math.ceil(Number(event.data.height));
            if (frame && height > 0) {
                frame.style.height = height + 'px';
                // embed.js sets scrolling="yes" for fullApp. Tall enough now, and a
                // frame that can scroll holds on to the wheel over it.
                frame.scrolling = 'no';
            }
        }
    });

    // Covers the toggle and theme.js's own OS listener, without touching either.
    new MutationObserver(notifyEmbed).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
})();
