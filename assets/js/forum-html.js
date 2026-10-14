/* A forum post's HTML (Discourse "cooked"), rebuilt for the page: the
 * search reader (search-modal.js, outside the bundle) and the community
 * topic dialog (community-sidebar.js) both show one. Ships inside
 * main.min.js, which loads before search-modal.js.
 *
 * NautasForumHTML.render(html, origin, emojiClass) returns a <div>; origin
 * resolves the forum's relative links and emoji, emojiClass styles emoji.
 * A quote that opens with [!type] (the forum's callouts, as on GitHub)
 * becomes an <aside class="forum-callout" data-callout="type">. */
window.NautasForumHTML = (function () {
    /* A forum post is user input: only these tags are rebuilt, with no
     * attributes but a link's href and an emoji's src/alt. Anything else is
     * dropped (DROP) or replaced by its children. DOMParser never runs what it parses. */
    var KEEP = /^(P|BR|HR|UL|OL|LI|BLOCKQUOTE|STRONG|B|EM|I|S|CODE|PRE|H[1-6]|TABLE|THEAD|TBODY|TR|TH|TD|DETAILS|SUMMARY)$/;
    var DROP = /^(SCRIPT|STYLE|SVG|IFRAME|VIDEO|AUDIO|INPUT|BUTTON|FORM|NOSCRIPT)$/;
    /* "> [!tldr] Title" arrives as a blockquote whose first paragraph starts
     * with the marker; the rest of that line is the title, else the type.
     * Folding (+/-) is dropped: the callout shows open. */
    var callout = function (quote) {
        var first = quote.tagName === 'BLOCKQUOTE' && quote.firstElementChild;
        var text = first && first.tagName === 'P' && first.firstChild;
        var m = text && text.nodeType === 3 && /^\s*\[!([a-z]+)\][+-]?\s*/i.exec(text.nodeValue);
        if (!m) {
            return quote;
        }
        var type = m[1].toLowerCase();
        var box = document.createElement('aside');
        box.className = 'forum-callout';
        box.setAttribute('data-callout', type);
        text.nodeValue = text.nodeValue.slice(m[0].length);
        first.className = 'forum-callout-title';
        if (!first.textContent.trim()) {
            first.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        }
        while (quote.firstChild) {
            box.appendChild(quote.firstChild);
        }
        return box;
    };

    var clean = function (from, to, origin, emojiClass) {
        Array.prototype.forEach.call(from.childNodes, function (node) {
            if (node.nodeType === 3) {
                to.appendChild(document.createTextNode(node.nodeValue));
                return;
            }
            if (node.nodeType !== 1 || DROP.test(node.tagName)) {
                return;
            }
            var url = function (value) {
                try {
                    var u = new URL(value, origin);
                    return /^https?:$/.test(u.protocol) ? u.href : '';
                } catch (e) {
                    return '';
                }
            };
            var out = null;
            if (node.tagName === 'IMG') {
                // Emoji only: uploads and avatars would need their own layout.
                if (node.classList.contains('emoji') && url(node.getAttribute('src'))) {
                    out = document.createElement('img');
                    out.className = emojiClass;
                    out.src = url(node.getAttribute('src'));
                    out.alt = node.getAttribute('alt') || '';
                    to.appendChild(out);
                }
                return;
            }
            // A link preview becomes its link.
            if (node.tagName === 'ASIDE') {
                var src = url(node.getAttribute('data-onebox-src') || '');
                if (src) {
                    var p = document.createElement('p');
                    var a = document.createElement('a');
                    a.href = a.textContent = src;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    p.appendChild(a);
                    to.appendChild(p);
                }
                return;
            }
            if (node.tagName === 'A') {
                // Heading anchors are empty; image lightboxes carry only a file name.
                if (node.classList.contains('anchor') || node.classList.contains('lightbox')) {
                    return;
                }
                out = document.createElement('a');
                var href = url(node.getAttribute('href') || '');
                if (href) {
                    out.href = href;
                    out.target = '_blank';
                    out.rel = 'noopener';
                }
            } else if (KEEP.test(node.tagName)) {
                out = document.createElement(node.tagName);
            }
            clean(node, out || to, origin, emojiClass);
            if (out) {
                to.appendChild(callout(out));
            }
        });
        return to;
    };

    return {
        render: function (html, origin, emojiClass) {
            var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
            return clean(doc.body, document.createElement('div'), origin, emojiClass);
        }
    };
})();
