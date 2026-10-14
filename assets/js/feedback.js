/* Feedback tab (partials/feedback.hbs): idea / error / soporte, an optional
 * e-mail and an optional screenshot of the visible page, posted as JSON to the
 * n8n webhook, which validates it and opens a Chatwoot conversation.
 *
 * html-to-image (assets/js/vendor) is ~20 KB and only needed when the box is
 * ticked, so it is fetched then rather than bundled.
 */
(function () {
    var root = document.querySelector('.cn-feedback');
    if (!root) {
        return;
    }
    var tab = root.querySelector('.cn-feedback-tab');
    var form = root.querySelector('.cn-feedback-panel');
    var status = form.querySelector('.cn-feedback-status');
    var fields = form.elements;

    function toggle(open) {
        form.hidden = !open;
        tab.setAttribute('aria-expanded', String(open));
        if (open) {
            fields.message.focus();
        }
    }

    tab.addEventListener('click', function () {
        toggle(form.hidden);
    });
    root.querySelector('.cn-feedback-close').addEventListener('click', function () {
        toggle(false);
        tab.focus();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !form.hidden) {
            toggle(false);
            tab.focus();
        }
    });

    function loadLibrary() {
        if (window.htmlToImage) {
            return Promise.resolve();
        }
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = root.dataset.shotLib;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // The visible part of the page, without the tab and panel. Images from
    // other origins are left out: the CDN's CORS headers are rejected, and one
    // unreadable image fails the whole capture. A failed capture sends the
    // message without it rather than not at all.
    function screenshot() {
        return loadLibrary().then(function () {
            return window.htmlToImage.toJpeg(document.body, {
                quality: 0.7,
                pixelRatio: 1,
                width: window.innerWidth,
                height: window.innerHeight,
                style: {transform: 'translateY(-' + window.scrollY + 'px)'},
                filter: function (node) {
                    if (node.tagName === 'IMG') {
                        return new URL(node.currentSrc || node.src, location.href).origin === location.origin;
                    }
                    return node !== root;
                }
            });
        }).catch(function () {
            return '';
        });
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (form.classList.contains('is-sending')) {
            return;
        }
        form.classList.add('is-sending');
        status.textContent = form.dataset.sending;

        (fields.shot.checked ? screenshot() : Promise.resolve('')).then(function (image) {
            return fetch(root.dataset.webhook, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    type: fields.type.value,
                    message: fields.message.value,
                    email: fields.email.value,
                    website: fields.website.value,
                    page: location.href,
                    screenshot: image
                })
            });
        }).then(function (response) {
            if (!response.ok) {
                throw new Error(response.status);
            }
            form.reset();
            status.textContent = form.dataset.thanks;
        }).catch(function () {
            status.textContent = form.dataset.error;
        }).then(function () {
            form.classList.remove('is-sending');
        });
    });
})();
