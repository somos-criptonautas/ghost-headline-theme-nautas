/* Glossary in beginner posts (body tag #nivel-1): the first time one of the
 * base terms below appears in the text it gets a faint dotted underline, and
 * tapping it shows the forum glossary's definition in a small card, with the
 * way to the full entry. At most MAX terms per post, and none in headings,
 * links, code, captions, quotes or cards. Ships inside main.min.js.
 *
 * The definition is the first paragraph of the glossary topic, fetched from
 * the forum's public JSON when first asked for (same CORS setup as the
 * community cards) and set as plain text. If it does not load, the card
 * keeps the term and the link.
 *
 * shortcut: the term list lives here (forum topic id: the ways the term is
 * written); move it to a forum tag once it needs editing from the forum.
 */
(function () {
    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');
    var content = document.querySelector('.gh-content');

    if (!ORIGIN || !content || !document.body.classList.contains('tag-hash-nivel-1') || !window.fetch) {
        return;
    }

    var MAX = 5;
    var TERMS = {
        2445: ['wallets', 'wallet', 'billeteras', 'billetera'],
        2425: ['clave privada', 'claves privadas', 'private key', 'private keys'],
        6483: ['frase semilla', 'seed phrase', 'seed'],
        2399: ['exchanges', 'exchange'],
        2410: ['KYC'],
        2422: ['P2P', 'peer-to-peer'],
        2375: ['altcoins', 'altcoin'],
        2435: ['stablecoins', 'stablecoin'],
        2401: ['fiat'],
        2383: ['blockchain', 'cadena de bloques'],
        2406: ['halving'],
        2431: ['satoshis', 'satoshi', 'sats'],
        2409: ['HODL'],
        2402: ['FOMO'],
        2404: ['FUD'],
        2398: ['DYOR'],
        2432: ['scam', 'scams'],
        2382: ['bear market', 'mercado bajista'],
        2386: ['bullrun', 'bull run'],
        2381: ['ATH', 'máximo histórico'],
        2416: ['capitalización de mercado', 'market cap'],
        2414: ['liquidez'],
        2443: ['volatilidad'],
        2415: ['long', 'longs'],
        2434: ['short', 'shorts'],
        3040: ['spot'],
        2412: ['apalancamiento', 'leverage'],
        6479: ['stop loss', 'stop-loss'],
        6478: ['take profit', 'take-profit'],
        6562: ['DCA'],
        2937: ['drawdown'],
        3666: ['temporalidad', 'temporalidades'],
        2378: ['análisis técnico'],
        2379: ['análisis fundamental'],
        2390: ['cold storage', 'almacenamiento en frío'],
        2418: ['minería'],
        2400: ['comisiones', 'comisión']
    };

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
            return list.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + list.map(escape).join('|') + ')(?![\\p{L}\\p{N}])', flags) : null;
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
                    if (found && (!best || found.index < best.index)) {
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
            cache[id] = fetch(ORIGIN + '/t/' + id + '.json', {credentials: 'omit', headers: {Accept: 'application/json'}})
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
        more.href = ORIGIN + '/t/' + id;
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
})();
