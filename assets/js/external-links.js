/* External links, anywhere on the page. Ships inside main.min.js.
 *
 * A link is external when its host is not this site's (a leading "www." is
 * ignored either way); the forum and other subdomains are separate sites and
 * count as external. External links open in a new tab, and every text link
 * that opens in a new tab - external, or set to _blank in the editor - gets
 * the marker. mailto:, tel: and in-page anchors are left alone, as are links
 * with no text, links wrapping media or an icon (they carry their own, like
 * the share and community links) and Ghost's own card links (bookmarks,
 * buttons, files...). Links added later by scripts (forum lists, search) are
 * not touched.
 *
 * This replaced a CSS rule that matched any href without "criptonautas.co"
 * in it (so share links carrying the site URL lost the marker) and an inline
 * script that judged by a different test (so mailto: opened a blank tab).
 */
(function () {
    var bare = function (host) {
        return host.replace(/^www\./, '').toLowerCase();
    };
    var site = bare(window.location.hostname);
    var links = document.querySelectorAll('a[href]');

    // The marker hangs off the link's last word, wrapped in a no-wrap span,
    // so the icon can never break onto a line of its own.
    var markTail = function (link) {
        var walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
        var last = null;
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim()) {
                last = walker.currentNode;
            }
        }
        if (!last) {
            return;
        }

        var text = last.nodeValue.replace(/\s+$/, '');
        // Only the end of a long word: .gh-ext never wraps, and a whole URL kept on one line runs past a phone's edge.
        var cut = Math.max(text.search(/\S+$/), text.length - 12);
        var tail = document.createElement('span');
        tail.className = 'gh-ext';
        tail.textContent = text.slice(cut);

        var after = last.nodeValue.slice(text.length);
        last.nodeValue = text.slice(0, cut);
        last.parentNode.insertBefore(tail, last.nextSibling);
        if (after) {
            tail.parentNode.insertBefore(document.createTextNode(after), tail.nextSibling);
        }
    };

    for (var i = 0; i < links.length; i++) {
        var link = links[i];

        var external = /^https?:$/.test(link.protocol) && bare(link.hostname) !== site;
        if (!external && link.target !== '_blank') {
            continue;
        }
        if (/(^|\s)kg-/.test(link.className) || link.closest('.kg-bookmark-card, .kg-button-card, .kg-product-card, .kg-file-card, .kg-header-card, .kg-cta-card, .kg-signup-card')) {
            continue;
        }

        if (external) {
            link.target = '_blank';
            var rel = (link.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
            if (rel.indexOf('noopener') === -1) {
                rel.push('noopener');
            }
            link.setAttribute('rel', rel.join(' '));
        }

        if (link.textContent.trim() && !link.querySelector('img, picture, video, svg, figure')) {
            link.classList.add('is-external');
            markTail(link);
        }
    }
})();
