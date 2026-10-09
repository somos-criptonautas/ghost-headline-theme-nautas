/* Site search modal: blog posts, community discussions and curated links in
 * one list, each source switched on or off by the visitor.
 *
 * InstantSearch.js talks to Typesense through typesense-instantsearch-adapter,
 * so one query fans out to every collection (the adapter turns InstantSearch's
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
    var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"></path></svg>';

    var t = function (es) {
        return (document.documentElement.lang || 'es').indexOf('es') === 0 ? es[0] : es[1];
    };

    /* Sources in the order the merged list takes them. Links stay off until
     * the visitor turns them on - they are the only results that leave the
     * site - and a source without a collection configured is not offered. */
    var SOURCES = [
        { key: 'posts', collection: cfg.postsCollection, label: ['blog', 'blog'], on: true, perPage: 8 },
        { key: 'topics', collection: cfg.topicsCollection, label: ['comunidad', 'community'], on: true, perPage: 10 },
        { key: 'links', collection: cfg.linksCollection, label: ['enlaces', 'links'], on: false, perPage: 8 }
    ].filter(function (source) {
        return source.collection;
    });

    // The visitor's choice outlives the visit; storage can be blocked, so it is only a nicety.
    try {
        var saved = JSON.parse(window.localStorage.getItem('ns-sources') || 'null');
        if (saved) {
            SOURCES.forEach(function (source) {
                if (typeof saved[source.key] === 'boolean') {
                    source.on = saved[source.key];
                }
            });
        }
    } catch (e) {}

    var byCollection = function (name) {
        return SOURCES.filter(function (source) {
            return source.collection === name;
        })[0];
    };

    /* ---------------------------------------------------------------- DOM */

    var root = null;
    var input = null;
    var panes = {};
    var started = false;
    var refine = null;
    var lastQuery = '';
    var search = null;

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
            '<div class="ns__sources" role="group" aria-label="' + t(['Fuentes', 'Sources']) + '" data-ns-pane="sources"></div>' +
            '<div class="ns__body" data-ns-pane="body">' +
            '<div class="ns__list" data-ns-pane="list"></div>' +
            '<div class="ns__state" data-ns-pane="state"></div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(root);
        input = root.querySelector('.ns__input');
        ['sources', 'body', 'list', 'state'].forEach(function (name) {
            panes[name] = root.querySelector('[data-ns-pane="' + name + '"]');
        });

        SOURCES.forEach(function (source) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ns__source';
            b.innerHTML = '<span></span><span class="ns__source-count"></span>';
            b.firstChild.textContent = t(source.label);
            b.setAttribute('aria-pressed', String(source.on));
            b.addEventListener('click', function () {
                toggle(source);
            });
            source.button = b;
            panes.sources.appendChild(b);
        });

        panes.body.addEventListener('scroll', more, { passive: true });

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

    /* Epoch numbers come in seconds (forum, links) or milliseconds (the Ghost
     * indexer's published_at); anything past 1e11 cannot be seconds before
     * the year 5000. A string date field would otherwise render "Invalid Date". */
    var date = function (value) {
        if (!value) {
            return '';
        }
        var n = Number(value);
        var d = typeof value === 'number' || /^\d+$/.test(value)
            ? new Date(n > 1e11 ? n : n * 1000)
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

    var hitRow = function (href, icon, title, snippet, metaLine, thumb, external) {
        var a = document.createElement('a');
        a.className = 'ns__hit';
        a.href = href;
        // Only links leave the site, so only they get a tab of their own.
        if (external) {
            a.target = '_blank';
            a.rel = 'noopener';
        }

        // The thumbnail takes the icon's slot, so the row layout is unchanged.
        if (icon.nodeType) {
            a.appendChild(icon);
        } else if (thumb) {
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

    /* ------------------------------------------------------------ rendering */

    /* Favicons come from the Hister instance; a blocked or missing one falls
     * back to the plain link icon rather than a broken image. */
    var favicon = function (url) {
        var slot = document.createElement('span');
        slot.className = 'ns__hit-icon';
        slot.innerHTML = ICON_LINK;
        if (url) {
            var img = document.createElement('img');
            img.className = 'ns__hit-favicon';
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('load', function () {
                slot.textContent = '';
                slot.appendChild(img);
            });
            img.src = url;
        }
        return slot;
    };

    var rowFor = {
        posts: function (hit) {
            return hitRow(
                hit.url || '/',
                ICON_POST,
                { hit: hit, attribute: 'title', fallback: hit.title },
                { hit: hit, attribute: 'excerpt', fallback: hit.excerpt },
                ['Blog', hit.tags && hit.tags[0], date(hit.published_at)],
                hit.feature_image
            );
        },
        topics: function (hit) {
            return hitRow(
                hit.url || '/',
                ICON_TOPIC,
                { hit: hit, attribute: 'title', fallback: hit.title },
                { hit: hit, attribute: 'text', fallback: hit.text, prefix: hit.username ? '@' + hit.username + ': ' : '' },
                [
                    t(['Comunidad', 'Community']),
                    hit.category,
                    hit.reply_count ? hit.reply_count + ' ' + t(['respuestas', 'replies']) : '',
                    hit.like_count ? hit.like_count + ' ♥' : ''
                ]
            );
        },
        links: function (hit) {
            return hitRow(
                hit.url,
                favicon(hit.favicon),
                { hit: hit, attribute: 'title', fallback: hit.title },
                // A meaning-only match has no highlight and would fall back to the whole page.
                { hit: hit, attribute: 'text', fallback: String(hit.text || '').slice(0, 300) },
                [hit.domain + ' ↗', date(hit.added)],
                null,
                true
            );
        }
    };

    // Filled by each source's infinite-hits widget: every page so far, and how to ask for the next.
    var results = {};

    /* One list, taking each source's next hit in turn. A row's place depends
     * only on how many hits come before it in its own source, so pages that
     * arrive later only add to the end and nothing already read moves. */
    var render = function () {
        var active = root.querySelector('.ns__hit.is-active');
        var activeHref = active && active.getAttribute('href');
        var lists = SOURCES.filter(function (source) {
            return source.on && lastQuery && results[source.key];
        });

        panes.list.textContent = '';
        for (var i = 0; ; i++) {
            var added = false;
            lists.forEach(function (source) {
                var hit = results[source.key].hits[i];
                if (hit) {
                    var row = rowFor[source.key](hit);
                    if (activeHref && row.getAttribute('href') === activeHref) {
                        row.classList.add('is-active');
                    }
                    panes.list.appendChild(row);
                    added = true;
                }
            });
            if (!added) {
                break;
            }
        }

        SOURCES.forEach(function (source) {
            var r = results[source.key];
            source.button.lastChild.textContent = source.on && lastQuery && r ? r.nbHits : '';
        });

        paint();
    };

    /* Infinite scroll: near the bottom of the list, every source with pages
     * left asks for its next one. */
    var more = function () {
        var body = panes.body;
        /* One page at a time: InstantSearch keeps a page in the list only if
         * it renders it with no search in flight, so asking again before the
         * answer drops pages and re-asks for ever. A closed modal measures as
         * zero height and would read as scrolled to the end. */
        if (search.status !== 'idle' || !lastQuery || root.hidden || body.scrollTop + body.clientHeight < body.scrollHeight - 300) {
            return;
        }
        SOURCES.forEach(function (source) {
            var r = results[source.key];
            if (source.on && r && !r.isLastPage) {
                r.showMore();
            }
        });
    };

    var toggle = function (source) {
        // Never every source off: the box would search nothing.
        if (source.on && SOURCES.filter(function (s) { return s.on; }).length === 1) {
            return;
        }
        source.on = !source.on;
        source.button.setAttribute('aria-pressed', String(source.on));
        try {
            var saved = {};
            SOURCES.forEach(function (s) {
                saved[s.key] = s.on;
            });
            window.localStorage.setItem('ns-sources', JSON.stringify(saved));
        } catch (e) {}

        // Back to the first page everywhere: the list is rebuilt for the new mix.
        search.setUiState(function (ui) {
            Object.keys(ui).forEach(function (id) {
                delete ui[id].page;
            });
            return ui;
        });
        input.focus();
    };

    var paint = function () {
        var state = panes.state;
        state.textContent = '';

        if (!lastQuery) {
            var suggestions = cfg.commonSearches || [];
            if (!suggestions.length) {
                return;
            }
            /* Rows, not pills: the pills above are the source filters, and a
             * suggestion is a search - it reads and keys like a result row. */
            var wrap = document.createElement('div');
            wrap.className = 'ns__suggestions';
            var label = document.createElement('div');
            label.className = 'ns__section-label';
            label.textContent = t(['Búsquedas frecuentes', 'Common searches']);
            wrap.appendChild(label);
            suggestions.forEach(function (text) {
                var a = document.createElement('a');
                a.className = 'ns__hit ns__hit--suggestion';
                a.href = '#/search/' + encodeURIComponent(text);
                a.innerHTML = '<span class="ns__hit-icon">' + ICON_SEARCH + '</span><span class="ns__hit-title"></span>';
                a.lastChild.textContent = text;
                a.addEventListener('click', function (event) {
                    event.preventDefault();
                    input.value = text;
                    refine(text);
                    input.focus();
                });
                wrap.appendChild(a);
            });
            state.appendChild(wrap);
            return;
        }

        var answered = SOURCES.filter(function (source) {
            return source.on;
        }).every(function (source) {
            return results[source.key] && results[source.key].nbHits === 0;
        });
        if (answered) {
            var none = document.createElement('p');
            none.className = 'ns__none';
            none.textContent = t(['Sin resultados para ', 'No results for ']) + '“' + lastQuery + '”';
            state.appendChild(none);
        }
    };

    /* --------------------------------------------------------- instantsearch */

    var start = function () {
        var makeClient = function (semanticOn) {
        return new window.TypesenseInstantSearchAdapter({
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
                /* Hybrid search. Naming `embedding` in query_by makes Typesense
                 * fuse keyword and vector rank; alpha is the vector share, so
                 * 0.2 keeps keyword matches on top, and the distance threshold
                 * drops vector-only hits that are only loosely related.
                 * exclude_fields stops every hit carrying its whole vector back.
                 * Each query is embedded by the provider too, so this leans on
                 * the search box's debounce below. */
                var semantic = function (p, on, alpha, threshold) {
                    if (on) {
                        p.query_by += ',embedding';
                        p.exclude_fields = 'embedding';
                        // A fixed k: by default it grows with the page asked for, so
                        // the total grew too (87, 111, 125 topics on pages 1, 9, 20)
                        // and the infinite list never reached its last page. The
                        // threshold already cuts every query tried well under 200.
                        p.vector_query = 'embedding:([], alpha: ' + alpha + ', distance_threshold: ' + threshold + ', k: 200)';
                        // Typesense refuses prefix search on a remote embedder; the
                        // keyword fields keep it, so typing still autocompletes.
                        p.prefix = p.query_by.split(',').map(function (f) {
                            return f === 'embedding' ? 'false' : 'true';
                        }).join(',');
                        // Nobody waits on this call any more (see the progressive
                        // client below), so allow a slow wake-up; the default is 30 s x 2.
                        p.remote_embedding_timeout_ms = 10000;
                        p.remote_embedding_num_tries = 1;
                    }
                    return p;
                };

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
                /* The index holds a document per forum post; grouping by topic
                 * gives one row per discussion (its best-matching post) and
                 * lets Typesense page over discussions, which the infinite
                 * list needs - dropping repeats here would leave pages short. */
                params[cfg.topicsCollection] = {
                    query_by: 'title,text',
                    highlight_fields: 'title,text',
                    group_by: 'topic_id',
                    group_limit: 1
                };
                if (cfg.linksCollection) {
                    params[cfg.linksCollection] = {
                        query_by: 'title,text',
                        highlight_fields: 'title,text'
                    };
                }
                /* Tuned per collection against real queries. The blog is a handful
                 * of long essays, so keyword matches are mostly noise ("cómo usar
                 * Monero" led with an unrelated post) and loosely related vectors
                 * covered every post: meaning weighs 0.8 and only distances under
                 * 0.65 count (an unrelated control query scored 0.79+ on all).
                 * The forum is thousands of short posts, so distances run lower:
                 * the right answer sat at 0.22-0.28 and related ones under 0.39,
                 * while unrelated control queries started at 0.46. Keywords still
                 * pull their weight in short titles, so meaning gets half. */
                semantic(params[cfg.postsCollection], semanticOn && cfg.semanticPosts, 0.8, 0.65);
                semantic(params[cfg.topicsCollection], semanticOn && cfg.semanticTopics, 0.5, 0.42);
                // shortcut: not measured yet - tune like the two above once the collection has content.
                if (cfg.linksCollection) {
                    semantic(params[cfg.linksCollection], semanticOn && cfg.semanticLinks, 0.5, 0.5);
                }
                return params;
            })()
        }).searchClient;
        };

        /* Progressive: keyword results answer at once, the semantic ranking is
         * asked for alongside and swapped in when it arrives. The provider is
         * slow to wake (first query after idle took 5.5 s, the next ones
         * 0.7 s), so waiting on it - or giving up on it for the visit after one
         * slow answer - left visitors with keyword results. A failed semantic
         * call costs nothing: the keyword results are already on screen.
         *
         * Switched-off sources and the empty box never reach Typesense: they
         * get an empty result here, so InstantSearch still sees one answer per
         * index. */
        var keywordClient = makeClient(false);
        var semanticClient = (cfg.semanticPosts || cfg.semanticTopics || cfg.semanticLinks) ? makeClient(true) : null;
        var semanticResults = {};
        var latestKey = null;
        var wanted = function (request) {
            var source = byCollection(request.indexName);
            return source && source.on && request.params && request.params.query;
        };
        var empty = function (request) {
            return {
                hits: [], nbHits: 0, page: 0, nbPages: 0, processingTimeMS: 0,
                hitsPerPage: (request.params && request.params.hitsPerPage) || 0,
                exhaustiveNbHits: true, query: '', params: '', index: request.indexName
            };
        };
        var searchClient = {
            search: function (requests) {
                var live = requests.filter(wanted);
                var answer = function (response) {
                    var i = 0;
                    return {
                        results: requests.map(function (request) {
                            return wanted(request) ? response.results[i++] : empty(request);
                        })
                    };
                };
                var keyword = function () {
                    return keywordClient.search(live).then(answer);
                };

                if (!live.length) {
                    return Promise.resolve(answer({ results: [] }));
                }
                if (!semanticClient) {
                    return keyword();
                }
                var key = JSON.stringify(live);
                latestKey = key;
                if (semanticResults[key]) {
                    return Promise.resolve(answer(semanticResults[key]));
                }
                var semantic = semanticClient.search(live).then(function (response) {
                    semanticResults[key] = response;
                    return response;
                });
                // A further page extends a list already ranked by meaning, so
                // wait for that ranking rather than splice keyword pages into it.
                if (live.some(function (request) { return request.params.page > 0; })) {
                    return semantic.then(answer, keyword);
                }
                semantic.then(function () {
                    // Redraw only if the visitor is still on this query; the
                    // refresh comes back through here and takes the cached answer.
                    if (key === latestKey) {
                        search.refresh();
                    }
                }, function () {});
                return keyword();
            }
        };

        search = window.instantsearch({
            indexName: SOURCES[0].collection,
            searchClient: searchClient,
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

        var infiniteHits = window.instantsearch.connectors.connectInfiniteHits;
        var listFor = function (source) {
            return [
                window.instantsearch.widgets.configure({ hitsPerPage: source.perPage }),
                infiniteHits(function (opts) {
                    results[source.key] = {
                        hits: opts.items,
                        nbHits: opts.results ? opts.results.nbHits : 0,
                        // An empty page also ends it, whatever the total claims.
                        isLastPage: opts.isLastPage || !(opts.results && opts.results.hits.length),
                        showMore: opts.showMore
                    };
                    render();
                })({})
            ];
        };

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
            })
        ].concat(listFor(SOURCES[0]), SOURCES.slice(1).map(function (source) {
            return window.instantsearch.widgets.index({ indexName: source.collection }).addWidgets(listFor(source));
        })));

        // After every render, so a list shorter than the modal keeps filling.
        search.on('render', more);

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
