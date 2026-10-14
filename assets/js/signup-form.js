/* The editor's signup cards, sent to Keila instead of Ghost. Ships inside
 * main.min.js.
 *
 * Ghost renders a signup card hidden and leaves showing it, and sending its
 * form, to Portal, which this theme does not load ({{ghost_head
 * exclude="portal"}}). With the "newsletter_form" setting (a Keila form's
 * address, https://.../forms/nfrm_...) the card shows and its e-mail goes
 * there as contact[email], the field Keila's own embed form uses. The answer
 * cannot be read across sites (no-cors), so a request that reaches Keila
 * counts as done; only a network failure shows the error. Keila's captcha
 * must be off for this form: there is no token to send.
 */
(function () {
    var root = document.documentElement;
    var action = root.getAttribute('data-newsletter-form') || '';

    if (!/^https:\/\/[^\s"'<>]+$/.test(action) || !window.fetch) {
        return;
    }

    document.querySelectorAll('.kg-signup-card').forEach(function (card) {
        var form = card.querySelector('.kg-signup-card-form');
        var input = form && form.querySelector('input[type="email"]');
        if (!input) {
            return;
        }
        // Ours now: nothing of Ghost's should pick this form up.
        form.removeAttribute('data-members-form');
        // The editor's card always says jamie@example.com.
        input.placeholder = root.getAttribute('data-newsletter-placeholder') || input.placeholder;
        card.style.display = '';

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (form.classList.contains('loading')) {
                return;
            }
            form.classList.remove('success', 'error');
            form.classList.add('loading');

            var body = new URLSearchParams();
            body.set('contact[email]', input.value.trim());

            fetch(action, {method: 'POST', mode: 'no-cors', credentials: 'omit', body: body})
                .then(function () {
                    form.classList.add('success');
                }, function () {
                    var error = form.querySelector('.kg-signup-card-error');
                    if (error) {
                        error.textContent = root.getAttribute('data-newsletter-error') || '';
                    }
                    form.classList.add('error');
                })
                .then(function () {
                    form.classList.remove('loading');
                });
        });
    });
})();
