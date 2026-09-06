/* Keep the Discourse comment embed on the same light/dark theme as the site.
 *
 * A file rather than an inline <script> in the post templates: the site's CSP
 * script-src carries sha256 hashes, and per spec a hash makes the browser
 * ignore 'unsafe-inline', so a new inline block is blocked until someone adds
 * its hash. Anything under /assets/ is already allowed - same reason
 * theme.js lives in a file. It ships inside main.min.js via the assets/js/*.js
 * glob in gulpfile.js.
 *
 * Nothing in theme.js needs to change: the MutationObserver sees every
 * data-theme write, whether it came from the toggle or from theme.js's own
 * prefers-color-scheme listener.
 *
 * The Discourse side has to postMessage 'discourse-embed-ready' and act on
 * the {theme: ...} message; without that half this is a no-op.
 */
(function () {
    var DISCOURSE_ORIGIN = 'https://comunidad.criptonautas.co';
    var embedWindow = null;

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

    window.addEventListener('message', function (event) {
        if (event.origin === DISCOURSE_ORIGIN && event.data === 'discourse-embed-ready') {
            // Held for later toggles - the handshake is not repeated.
            embedWindow = event.source;
            notifyEmbed();
        }
    });

    // Covers the toggle and theme.js's own OS listener, without touching either.
    new MutationObserver(notifyEmbed).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
})();
