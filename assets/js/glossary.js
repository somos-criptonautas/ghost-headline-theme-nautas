/* Glossary in posts: the first time one of the forum glossary's terms
 * tagged blog-glosario appears in the text it gets a faint dotted underline,
 * and tapping it shows the definition in a small card, with the way to the
 * full entry. Up to MAX terms in a beginner post (#nivel-1), fewer in the
 * rest, and none in headings, links, code, captions, quotes or cards. Ships
 * inside main.min.js.
 *
 * The terms are the forum's: its public search for the tag gives each
 * topic's id and title, and the title gives the ways to write it
 * ("KYC / Know Your Costumer", "Tor (The Onion Router)"), plus a plural; a few
 * Spanish forms the titles lack are added below. Tagging or untagging a topic
 * in the forum adds or drops a term. The definition is the topic's first
 * paragraph, fetched when first asked for and set as plain text. If either
 * does not load, the post stays as it is, or the card keeps the term and the
 * link.
 */
(function () {
    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var content = document.querySelector('.gh-content');

    if (!ORIGIN || !content || !document.body.classList.contains('post-template') || !window.fetch) {
        return;
    }

    var MAX = document.body.classList.contains('tag-hash-nivel-1') ? 5 : 3;
    var LANG = document.documentElement.lang || 'es';

    // Forms the forum titles lack (topic id: forms).
    var EXTRA = {
        2445: ['billetera'],
        2425: ['clave privada', 'claves privadas'],
        2401: ['fiat'],
        2383: ['cadena de bloques'],
        2382: ['mercado bajista'],
        2386: ['bull run', 'bull market', 'mercado alcista'],
        2381: ['máximo histórico'],
        2416: ['market cap'],
        2430: ['Satoshi'],
        2400: ['comisiones'],
        2390: ['almacenamiento en frío'],
        6506: ['ciclos de mercado']
    };

    var formsOf = function (id, title) {
        var inside = (title.match(/\(([^)]*)\)/) || [])[1] || '';
        var parts = title.replace(/\([^)]*\)/g, '').split('/').concat(inside.split('/'));
        return parts.concat(EXTRA[id] || []).map(function (part) {
            return part.trim();
        }).filter(function (part) {
            return part.length > 1;
        });
    };

    // shortcut: search answers up to 50 topics; page it if the tag grows past that.
    var terms = function () {
        return fetch(ORIGIN + '/search.json?q=' + encodeURIComponent('tags:blog-glosario'), {
            credentials: 'omit',
            headers: {Accept: 'application/json', 'Accept-Language': LANG}
        }).then(function (response) {
            return response.ok ? response.json() : Promise.reject(new Error(response.status));
        }).then(function (found) {
            var list = {};
            ((found && found.topics) || []).forEach(function (topic) {
                var id = parseInt(topic.id, 10);
                if (id > 0 && topic.title) {
                    list[id] = formsOf(id, String(topic.title));
                }
            });
            return list;
        });
    };

    var start = function (TERMS) {
        var escape = function (text) {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]+');
        };
        var entries = Object.keys(TERMS).map(function (id) {
            // Longest form first, so "clave privada" wins over a shorter one.
            var forms = TERMS[id].slice().sort(function (a, b) {
                return b.length - a.length;
            });
            // Upper-case forms (KYC, ATH) only as written; the rest in any case.
            var exact = forms.filter(function (form) {
                return form === form.toUpperCase();
            });
            var loose = forms.filter(function (form) {
                return form !== form.toUpperCase();
            });
            var edge = function (list, flags) {
                // A plural too (wallets, exchanges): any form ending in a letter.
                return list.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + list.map(escape).join('|') + ')(?:e?s)?(?![\\p{L}\\p{N}])', flags) : null;
            };
            return {id: id, exact: edge(exact, 'u'), loose: edge(loose, 'iu')};
        });

        var SKIP = 'a, h1, h2, h3, h4, h5, h6, code, pre, button, figcaption, blockquote, .kg-card, .cn-term, script, style';

        var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                return node.parentElement.closest(SKIP) || !node.nodeValue.trim()
                    ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var nodes = [];
        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }

        var marked = 0;
        var used = {};
        for (var n = 0; n < nodes.length && marked < MAX; n++) {
            var node = nodes[n];
            // A node can hold several terms: keep looking in what follows a mark.
            while (node && marked < MAX) {
                var best = null;
                entries.forEach(function (entry) {
                    if (used[entry.id]) {
                        return;
                    }
                    [entry.exact, entry.loose].forEach(function (re) {
                        var found = re && re.exec(node.nodeValue);
                        // Earliest wins; at the same place the longer ("Satoshi Nakamoto").
                        if (found && (!best || found.index < best.index || (found.index === best.index && found[0].length > best.text.length))) {
                            best = {index: found.index, text: found[0], id: entry.id};
                        }
                    });
                });
                if (!best) {
                    break;
                }
                used[best.id] = true;
                marked++;
                var rest = node.splitText(best.index);
                node = rest.splitText(best.text.length);
                var term = document.createElement('button');
                term.type = 'button';
                term.className = 'cn-term';
                term.setAttribute('data-topic', best.id);
                term.setAttribute('aria-expanded', 'false');
                term.textContent = best.text;
                rest.replaceWith(term);
            }
        }

        if (!marked) {
            return;
        }

        // One card for every term, placed under the one tapped.
        var card = document.createElement('div');
        card.className = 'cn-term-card';
        card.hidden = true;
        card.setAttribute('role', 'dialog');
        var title = document.createElement('strong');
        var text = document.createElement('p');
        var more = document.createElement('a');
        more.target = '_blank';
        more.rel = 'noopener';
        more.textContent = document.documentElement.getAttribute('lang') === 'es' ? 'ver en el glosario ↗' : 'see in the glossary ↗';
        card.append(title, text, more);
        document.body.appendChild(card);

        var cache = {};
        var open = null;

        var definition = function (id) {
            if (!cache[id]) {
                // In the site's language: the forum answers in the browser's
                // otherwise, and serves its machine translation to the rest.
                cache[id] = fetch(ORIGIN + '/t/' + id + '.json', {
                    credentials: 'omit',
                    headers: {Accept: 'application/json', 'Accept-Language': document.documentElement.lang || 'es'}
                })
                    .then(function (response) {
                        return response.ok ? response.json() : Promise.reject(new Error(response.status));
                    })
                    .then(function (topic) {
                        var first = topic.post_stream && topic.post_stream.posts && topic.post_stream.posts[0];
                        var doc = new DOMParser().parseFromString((first && first.cooked) || '', 'text/html');
                        var para = Array.prototype.find.call(doc.querySelectorAll('p'), function (p) {
                            return p.textContent.trim().length > 40 && /[a-zá-ú]/.test(p.textContent);
                        });
                        return {title: String(topic.title || ''), text: para ? para.textContent.trim() : ''};
                    });
                cache[id].then(null, function () {
                    delete cache[id];
                });
            }
            return cache[id];
        };

        var close = function () {
            if (open) {
                open.setAttribute('aria-expanded', 'false');
                open = null;
            }
            card.hidden = true;
        };

        var place = function (term) {
            var box = term.getBoundingClientRect();
            var width = Math.min(320, document.documentElement.clientWidth - 32);
            var left = Math.max(16, Math.min(box.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - width - 16));
            card.style.width = width + 'px';
            card.style.left = left + 'px';
            card.style.top = (box.bottom + window.scrollY + 8) + 'px';
        };

        content.addEventListener('click', function (event) {
            var term = event.target.closest('.cn-term');
            if (!term) {
                return;
            }
            if (open === term) {
                close();
                return;
            }
            close();
            open = term;
            term.setAttribute('aria-expanded', 'true');
            var id = term.getAttribute('data-topic');
            title.textContent = term.textContent;
            text.textContent = '…';
            more.href = ORIGIN + '/t/' + id + '?tl=' + LANG.slice(0, 2);
            card.hidden = false;
            place(term);
            definition(id).then(function (found) {
                if (open === term) {
                    title.textContent = found.title || term.textContent;
                    text.textContent = found.text;
                    text.hidden = !found.text;
                }
            }, function () {
                if (open === term) {
                    text.hidden = true;
                }
            });
        });

        document.addEventListener('click', function (event) {
            if (open && !event.target.closest('.cn-term, .cn-term-card')) {
                close();
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && open) {
                var term = open;
                close();
                term.focus();
            }
        });
        window.addEventListener('resize', close);
        // Images above that finish loading move the term: the card follows it.
        if (window.ResizeObserver) {
            new ResizeObserver(function () {
                if (open) {
                    place(open);
                }
            }).observe(content);
        }
    };

    terms().then(start, function () {});
})();
