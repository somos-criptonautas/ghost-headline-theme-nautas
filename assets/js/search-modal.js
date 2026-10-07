/* Site search modal: Ghost posts and community discussions in one place.
 *
 * InstantSearch.js talks to Typesense through typesense-instantsearch-adapter,
 * so one query fans out to both collections (the adapter turns InstantSearch's
 * multi-index request into a Typesense multi_search) and this file only has to
 * render. Loaded on its own deferred <script> after the two vendor bundles -
 * see site-scripts.hbs - so window.instantsearch is already defined here.
 *
 * Config comes from assets/js/search-config.js.
 */
(function () {
    var cfg = window.__NAUTAS_SEARCH_CONFIG__;

    if (!cfg || !window.instantsearch || !window.TypesenseInstantSearchAdapter) {
        return;
    }

    /* Typesense marks matches by wrapping them in these tags. The default is
     * <mark>, which would mean injecting result text as HTML - and a forum post
     * is arbitrary user input, so that is an XSS hole. Two control characters
     * cannot appear in a post, so splitting on them below is unambiguous and
     * every hit still reaches the DOM as a text node.
     */
    var MARK_OPEN = '\u0001';
    var MARK_CLOSE = '\u0002';

    var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
    var ICON_POST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h9l5 5v13H5z"></path><path d="M14 3v5h5"></path><path d="M8 13h8M8 17h5"></path></svg>';
    var ICON_TOPIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"></path></svg>';

    var t = function (es) {
        return (document.documentElement.lang || 'es').indexOf('es') === 0 ? es[0] : es[1];
    };

    /* ---------------------------------------------------------------- DOM */

    var root = null;
    var input = null;
    var panes = {};
    var started = false;
    var refine = null;
    var lastQuery = '';

    var build = function () {
        root = document.createElement('div');
        root.className = 'ns';
        root.hidden = true;
        root.innerHTML =
            '<div class="ns__backdrop" data-ns-close></div>' +
            '<div class="ns__modal" role="dialog" aria-modal="true" aria-label="' + t(['Buscar', 'Search']) + '">' +
            '<form class="ns__head" role="search">' +
            '<span class="ns__head-icon">' + ICON_SEARCH + '</span>' +
            '<input class="ns__input" type="search" autocomplete="off" autocorrect="off" ' +
            'spellcheck="false" aria-label="' + t(['Buscar en el sitio', 'Search this site']) + '" ' +
            'placeholder="' + t(['Buscar artículos e historias…', 'Search posts and stories…']) + '">' +
            '<button type="button" class="ns__esc" data-ns-close>esc</button>' +
            '</form>' +
            '<div class="ns__body">' +
            '<div class="ns__section" data-ns-pane="posts" hidden></div>' +
            '<div class="ns__section" data-ns-pane="topics" hidden></div>' +
            '<div class="ns__state" data-ns-pane="state"></div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(root);
        input = root.querySelector('.ns__input');
        ['posts', 'topics', 'state'].forEach(function (name) {
            panes[name] = root.querySelector('[data-ns-pane="' + name + '"]');
        });

        root.addEventListener('click', function (event) {
            if (event.target.closest('[data-ns-close]')) {
                close();
            }
        });
        root.querySelector('.ns__head').addEventListener('submit', function (event) {
            event.preventDefault();
            var active = root.querySelector('.ns__hit.is-active');
            if (active) {
                active.click();
            }
        });
        root.addEventListener('keydown', onKeydown);
    };

    /* Match text -> text nodes plus <mark>, never innerHTML. Falls back to the
     * raw field when Typesense returned no highlight for it.
     */
    var marked = function (node, hit, attribute, fallback) {
        var h = hit._highlightResult && hit._highlightResult[attribute];
        var value = h && h.value ? String(h.value) : String(fallback == null ? '' : fallback);

        value.split(MARK_OPEN).forEach(function (chunk, i) {
            if (i === 0) {
                node.appendChild(document.createTextNode(chunk));
                return;
            }
            var parts = chunk.split(MARK_CLOSE);
            var mark = document.createElement('mark');
            mark.textContent = parts.shift();
            node.appendChild(mark);
            node.appendChild(document.createTextNode(parts.join(MARK_CLOSE)));
        });

        return node;
    };

    var meta = function (parts) {
        var span = document.createElement('div');
        span.className = 'ns__meta';
        span.textContent = parts.filter(Boolean).join(' · ');
        return span;
    };

    /* published_at is int64 unix seconds in the Ghost collection and created_at
     * is the same in the forum one, but a collection built with a string date
     * field would otherwise render "Invalid Date". Accept both.
     */
    var date = function (value) {
        if (!value) {
            return '';
        }
        var d = typeof value === 'number' || /^\d+$/.test(value)
            ? new Date(Number(value) * 1000)
            : new Date(value);

        if (isNaN(d.getTime())) {
            return '';
        }

        return d.toLocaleDateString(document.documentElement.lang || 'es', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    /* Ghost serves resized copies under /content/images/size/<w>/..., so a
     * 64px-wide thumbnail costs a fraction of the feature image. Anything not
     * matching that path (an external or already-sized URL) is used as is.
     */
    var thumbUrl = function (url) {
        return url.replace(/(\/content\/images\/)(?!size\/)/, '$1size/w160/');
    };

    var hitRow = function (href, icon, title, snippet, metaLine, thumb) {
        var a = document.createElement('a');
        a.className = 'ns__hit';
        a.href = href;

        // The thumbnail takes the icon's slot, so the row layout is unchanged.
        if (thumb) {
            var img = document.createElement('img');
            img.className = 'ns__hit-thumb';
            img.src = thumbUrl(thumb);
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            var slot = document.createElement('span');
            slot.className = 'ns__hit-icon ns__hit-icon--thumb';
            slot.appendChild(img);
            a.appendChild(slot);
        } else {
            a.innerHTML = '<span class="ns__hit-icon">' + icon + '</span>';
        }
        var body = document.createElement('span');
        body.className = 'ns__hit-body';

        var h = document.createElement('span');
        h.className = 'ns__hit-title';
        body.appendChild(marked(h, title.hit, title.attribute, title.fallback));

        if (snippet) {
            var p = document.createElement('span');
            p.className = 'ns__hit-snippet';
            if (snippet.prefix) {
                var who = document.createElement('span');
                who.className = 'ns__hit-who';
                who.textContent = snippet.prefix;
                p.appendChild(who);
            }
            body.appendChild(marked(p, snippet.hit, snippet.attribute, snippet.fallback));
        }

        body.appendChild(meta(metaLine));
        a.appendChild(body);
        return a;
    };

    var section = function (pane, label, count, rows, footer) {
        pane.textContent = '';

        if (!rows.length) {
            pane.hidden = true;
            return;
        }

        var head = document.createElement('div');
        head.className = 'ns__section-head';
        head.innerHTML = '<span class="ns__section-label"></span><span class="ns__section-count"></span>';
        head.querySelector('.ns__section-label').textContent = label;
        head.querySelector('.ns__section-count').textContent = count;
        pane.appendChild(head);
        rows.forEach(function (row) {
            pane.appendChild(row);
        });

        if (footer) {
            pane.appendChild(footer);
        }

        pane.hidden = false;
    };

    /* ------------------------------------------------------------ rendering */

    var counts = { posts: null, topics: null };

    var paint = function () {
        var state = panes.state;
        state.textContent = '';

        if (!lastQuery) {
            var chips = cfg.commonSearches || [];
            if (!chips.length) {
                return;
            }
            var wrap = document.createElement('div');
            wrap.className = 'ns__chips';
            var label = document.createElement('div');
            label.className = 'ns__section-label';
            label.textContent = t(['Búsquedas frecuentes', 'Common searches']);
            wrap.appendChild(label);
            chips.forEach(function (text) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'ns__chip';
                b.textContent = text;
                b.addEventListener('click', function () {
                    input.value = text;
                    refine(text);
                    input.focus();
                });
                wrap.appendChild(b);
            });
            state.appendChild(wrap);
            return;
        }

        if (counts.posts === 0 && counts.topics === 0) {
            var none = document.createElement('p');
            none.className = 'ns__none';
            none.textContent = t(['Sin resultados para ', 'No results for ']) + '“' + lastQuery + '”';
            state.appendChild(none);
        }
    };

    var renderPosts = function (hits) {
        counts.posts = hits.length;
        var rows = hits.slice(0, cfg.maxPosts || 3).map(function (hit) {
            return hitRow(
                hit.url || '/',
                ICON_POST,
                { hit: hit, attribute: 'title', fallback: hit.title },
                { hit: hit, attribute: 'excerpt', fallback: hit.excerpt },
                [hit.tags && hit.tags[0], date(hit.published_at)],
                hit.feature_image
            );
        });
        section(panes.posts, t(['Artículos y publicaciones', 'Posts']), hits.length, rows);
    };

    var renderTopics = function (hits) {
        /* One row per discussion. The index holds a document per forum post, so
         * a topic whose replies all match would otherwise fill the whole
         * section; keeping the first hit per topic_id keeps the best-matching
         * reply and drops the rest. Done here rather than with Typesense's
         * group_by so it does not depend on the adapter passing that through.
         */
        var seen = {};
        var topics = hits.filter(function (hit) {
            if (seen[hit.topic_id]) {
                return false;
            }
            seen[hit.topic_id] = true;
            return true;
        });

        counts.topics = topics.length;

        var rows = topics.slice(0, cfg.maxTopics || 6).map(function (hit) {
            return hitRow(
                hit.url || '/',
                ICON_TOPIC,
                { hit: hit, attribute: 'title', fallback: hit.title },
                { hit: hit, attribute: 'text', fallback: hit.text, prefix: hit.username ? '@' + hit.username + ': ' : '' },
                [
                    hit.category,
                    hit.reply_count ? hit.reply_count + ' ' + t(['respuestas', 'replies']) : '',
                    hit.like_count ? hit.like_count + ' ♥' : ''
                ]
            );
        });

        var footer = null;
        if (rows.length && cfg.forumUrl) {
            footer = document.createElement('a');
            footer.className = 'ns__more';
            footer.href = cfg.forumUrl.replace(/\/$/, '') + '/search?q=' + encodeURIComponent(lastQuery);
            footer.textContent = t(['Buscar en la comunidad →', 'Search on Community →']);
        }

        section(panes.topics, t(['Historias en la comunidad', 'Community discussions']), topics.length, rows, footer);
    };

    /* --------------------------------------------------------- instantsearch */

    var start = function () {
        var adapter = new window.TypesenseInstantSearchAdapter({
            server: {
                apiKey: cfg.typesenseApiKey,
                nodes: cfg.typesenseNodes,
                cacheSearchResultsForSeconds: 120
            },
            additionalSearchParameters: {
                highlight_start_tag: MARK_OPEN,
                highlight_end_tag: MARK_CLOSE
            },
            collectionSpecificSearchParameters: (function () {
                var params = {};
                params[cfg.postsCollection] = {
                    query_by: 'title,excerpt,plaintext',
                    highlight_fields: 'title,excerpt'
                };
                /* The API key here is public, so anything in the collection is
                 * readable by anyone who reads this file. The indexer stores a
                 * members-only post's full plaintext, and a snippet of it is
                 * exactly the paywalled part - so filter those out rather than
                 * relying on nobody querying Typesense directly. */
                if (cfg.postsFilter) {
                    params[cfg.postsCollection].filter_by = cfg.postsFilter;
                }
                params[cfg.topicsCollection] = {
                    query_by: 'title,text',
                    highlight_fields: 'title,text'
                };
                return params;
            })()
        });

        var search = window.instantsearch({
            indexName: cfg.postsCollection,
            searchClient: adapter.searchClient,
            future: { preserveSharedStateOnUnmount: true }
        });

        var box = window.instantsearch.connectors.connectSearchBox(function (opts, first) {
            refine = opts.refine;
            if (first) {
                input.addEventListener('input', function () {
                    refine(input.value);
                });
            }
            if (opts.query !== lastQuery) {
                lastQuery = opts.query;
            }
            if (input.value !== opts.query && document.activeElement !== input) {
                input.value = opts.query;
            }
        });

        var hits = window.instantsearch.connectors.connectHits;

        search.addWidgets([
            box({
                // Typing is cheap for Typesense but not free; one request per
                // burst of keystrokes instead of one per keystroke.
                queryHook: (function () {
                    var timer = null;
                    return function (query, doRefine) {
                        window.clearTimeout(timer);
                        timer = window.setTimeout(function () {
                            doRefine(query);
                        }, 120);
                    };
                })()
            }),
            window.instantsearch.widgets.configure({ hitsPerPage: 8 }),
            hits(function (opts) {
                renderPosts(lastQuery ? opts.hits : []);
                paint();
            })({}),
            window.instantsearch.widgets.index({ indexName: cfg.topicsCollection }).addWidgets([
                // Over-fetch: several hits can collapse into one discussion.
                window.instantsearch.widgets.configure({ hitsPerPage: 24 }),
                hits(function (opts) {
                    renderTopics(lastQuery ? opts.hits : []);
                    paint();
                })({})
            ])
        ]);

        search.start();
        started = true;
    };

    /* ------------------------------------------------------------- keyboard */

    var move = function (delta) {
        var rows = Array.prototype.slice.call(root.querySelectorAll('.ns__hit'));
        if (!rows.length) {
            return;
        }
        var current = rows.indexOf(root.querySelector('.ns__hit.is-active'));
        var next = current + delta;
        if (next < 0) {
            next = rows.length - 1;
        } else if (next >= rows.length) {
            next = 0;
        }
        rows.forEach(function (row) {
            row.classList.remove('is-active');
        });
        rows[next].classList.add('is-active');
        rows[next].scrollIntoView({ block: 'nearest' });
    };

    function onKeydown(event) {
        if (event.key === 'Escape') {
            close();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
        }
    }

    /* ----------------------------------------------------------- open/close */

    var opener = null;

    var open = function (query) {
        if (!root) {
            build();
        }
        if (!started) {
            start();
        }

        opener = document.activeElement;
        root.hidden = false;
        document.documentElement.classList.add('ns-open');

        if (query != null) {
            input.value = query;
            refine(query);
        }
        paint();
        input.focus();
        input.select();
    };

    var close = function () {
        if (!root || root.hidden) {
            return;
        }
        root.hidden = true;
        document.documentElement.classList.remove('ns-open');
        if (opener && typeof opener.focus === 'function') {
            opener.focus();
        }
    };

    window.nautasSearch = { open: open, close: close };

    document.addEventListener('click', function (event) {
        var trigger = event.target.closest('[data-ghost-search]');
        if (trigger) {
            event.preventDefault();
            open();
        }
    });

    document.addEventListener('keydown', function (event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
            event.preventDefault();
            open();
        }
    });

    // #/search/<query> links, the shape the previous search UI used.
    var fromHash = function () {
        var match = /^#\/search\/(.*)$/.exec(window.location.hash);
        if (match) {
            open(decodeURIComponent(match[1]));
        }
    };

    window.addEventListener('hashchange', fromHash);
    fromHash();
})();
