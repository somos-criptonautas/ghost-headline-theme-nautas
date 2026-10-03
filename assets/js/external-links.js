/* External links in article content. Ships inside main.min.js.
 *
 * One check decides both the marker and the new tab, so they always agree:
 * a link is external when its host is not this site's (a leading "www." is
 * ignored either way). The forum and other subdomains are separate sites
 * and count as external. mailto:, tel: and in-page anchors are left alone,
 * as are links wrapping media and Ghost's own card links (bookmarks,
 * buttons, files...), which carry their own visual treatment.
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
    var links = document.querySelectorAll('.gh-content a[href]');

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
        var cut = text.search(/\S+$/);
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

        if (!/^https?:$/.test(link.protocol) || bare(link.hostname) === site) {
            continue;
        }
        if (/(^|\s)kg-/.test(link.className) || link.closest('.kg-bookmark-card, .kg-button-card, .kg-product-card, .kg-file-card, .kg-header-card, .kg-cta-card, .kg-signup-card')) {
            continue;
        }

        link.target = '_blank';
        var rel = (link.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
        if (rel.indexOf('noopener') === -1) {
            rel.push('noopener');
        }
        link.setAttribute('rel', rel.join(' '));

        if (!link.querySelector('img, picture, video, svg, figure')) {
            link.classList.add('is-external');
            markTail(link);
        }
    }
})();
