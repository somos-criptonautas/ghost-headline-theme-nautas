/* Feedback tab (partials/feedback.hbs): idea / error / soporte, an optional
 * e-mail and an optional image the reader picks, posted as JSON to the n8n
 * webhook, which validates it and opens a Chatwoot conversation.
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

    var name = form.querySelector('.cn-feedback-shot-name');
    function showName() {
        var file = fields.shot.files && fields.shot.files[0];
        name.textContent = file ? file.name : name.dataset.empty;
    }
    fields.shot.addEventListener('change', showName);

    // The picked image, at most 1600px on its longer side, as a JPEG data
    // URL - the shape the n8n workflow already takes. One that cannot be
    // read is left out rather than holding the message back.
    var MAX_SIDE = 1600;
    function picked() {
        var file = fields.shot.files && fields.shot.files[0];
        if (!file || !window.createImageBitmap) {
            return Promise.resolve('');
        }
        return window.createImageBitmap(file).then(function (bitmap) {
            var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            var context = canvas.getContext('2d');
            // JPEG has no transparency: a white ground, not black.
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.8);
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

        picked().then(function (image) {
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
            showName();
            status.textContent = form.dataset.thanks;
        }).catch(function () {
            status.textContent = form.dataset.error;
        }).then(function () {
            form.classList.remove('is-sending');
        });
    });
})();
