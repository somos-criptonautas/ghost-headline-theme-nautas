/* Emoji reactions at the end of the article (partials/reactions.hbs). Ships
 * inside main.min.js.
 *
 * The reactions are the forum's own (discourse-reactions) on the first post
 * of the article's topic. The topic is found through the comments embed's
 * public page: its "comment" button links to the topic. Then /t/{id}.json
 * gives the counts, sent with the forum cookie so a signed-in member also
 * sees their own pick. The blog and the forum are the same site, so that
 * cookie goes along; the forum allows this origin with credentials
 * (DISCOURSE_ENABLE_CORS plus "cors origins", as for community-sidebar.js).
 *
 * Discourse keeps one reaction per member per post: picking another replaces
 * it, picking the same one removes it. Anyone not signed in gets the dialog.
 */
(function () {
    // Same forum as the comments embed (discourse-embed.js).
    var ORIGIN = 'https://comunidad.criptonautas.co';

    var root = document.querySelector('.gh-reactions');

    if (!root || !window.fetch || !window.DOMParser) {
        return;
    }

    var buttons = root.querySelectorAll('.gh-reaction');
    var dialog = root.querySelector('.gh-reactions-dialog');
    var postId = null;
    var busy = false;

    var request = function (path, options) {
        options = options || {};
        options.credentials = 'include';
        options.headers = Object.assign({Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest'}, options.headers);
        return fetch(ORIGIN + path, options).then(function (response) {
            if (!response.ok) {
                throw new Error(response.status);
            }
            return response.json();
        });
    };

    var render = function (post) {
        var counts = {};
        (post.reactions || []).forEach(function (reaction) {
            counts[reaction.id] = reaction.count;
        });
        var mine = post.current_user_reaction && post.current_user_reaction.id;

        Array.prototype.forEach.call(buttons, function (button) {
            var id = button.getAttribute('data-reaction');
            button.querySelector('.gh-reaction-count').textContent = counts[id] || '';
            button.setAttribute('aria-pressed', id === mine ? 'true' : 'false');
        });
    };

    var showDialog = function () {
        if (dialog.showModal) {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    };

    var toggle = function (button) {
        if (busy || !postId) {
            return;
        }
        busy = true;

        // Only members signed in to the forum can react: the session answers
        // 404 for anyone else.
        request('/session/current.json').then(function () {
            return request('/session/csrf.json').then(function (session) {
                return request('/discourse-reactions/posts/' + postId + '/custom-reactions/' +
                    encodeURIComponent(button.getAttribute('data-reaction')) + '/toggle.json', {
                    method: 'PUT',
                    headers: {'X-CSRF-Token': session.csrf}
                }).then(render);
            }, function () {});
        }, showDialog).then(function () {
            busy = false;
        }, function () {
            busy = false;
        });
    };

    Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener('click', function () {
            toggle(button);
        });
    });

    fetch(ORIGIN + '/embed/comments?embed_url=' + encodeURIComponent(root.getAttribute('data-embed-url')), {
        credentials: 'omit'
    }).then(function (response) {
        if (!response.ok) {
            throw new Error(response.status);
        }
        return response.text();
    }).then(function (html) {
        // Parsed, never inserted: scripts in a DOMParser document never run.
        var link = new DOMParser().parseFromString(html, 'text/html').querySelector('a.button[href^="' + ORIGIN + '/t/"]');
        var match = link && link.getAttribute('href').match(/\/t\/[^/]+\/(\d+)/);
        if (!match) {
            throw new Error('no topic yet');
        }
        return request('/t/' + match[1] + '.json');
    }).then(function (topic) {
        var post = topic.post_stream.posts[0];
        postId = post.id;
        render(post);
        root.hidden = false;
    }).catch(function () {});
})();
