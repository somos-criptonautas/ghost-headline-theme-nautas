/* Monero tips: the pill at the end of the article (partials/reactions.hbs)
 * and the icon among the author's social links (author.hbs), both opening
 * partials/monero-tip-dialog.hbs. Ships inside main.min.js.
 *
 * The forum's discourse-monero-tips plugin answers /monero-tips/{username}.json
 * with the address, a QR data URL and the monero: link; it 404s while the
 * account has no address, and the button stays hidden. Sent with the forum
 * cookie so a member signed in there gets their own attributed subaddress
 * when the account has verified tips on (same CORS setup as reactions.js).
 */
(function () {
    var ORIGIN = 'https://comunidad.criptonautas.co';
    // The forum account every article's tips go to.
    var USERNAME = 'anonist';

    var dialog = document.querySelector('.gh-monero-tip-dialog');

    if (!dialog || !window.fetch) {
        return;
    }

    var input = dialog.querySelector('.gh-monero-tip-address');
    var copy = dialog.querySelector('.gh-monero-tip-copy');

    fetch(ORIGIN + '/monero-tips/' + USERNAME + '.json', {
        credentials: 'include',
        headers: {Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest'}
    }).then(function (response) {
        if (!response.ok) {
            throw new Error(response.status);
        }
        return response.json();
    }).then(function (tip) {
        input.value = tip.address;
        dialog.querySelector('.gh-monero-tip-qr').src = tip.qr;
        dialog.querySelector('.gh-monero-tip-wallet').href = tip.uri;
        Array.prototype.forEach.call(document.querySelectorAll('[data-monero-tip]'), function (el) {
            el.hidden = false;
        });
    }).catch(function () {});

    Array.prototype.forEach.call(document.querySelectorAll('.gh-monero-tip-open'), function (button) {
        button.addEventListener('click', function () {
            if (dialog.showModal) {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        });
    });

    copy.addEventListener('click', function () {
        var done = function () {
            copy.textContent = copy.getAttribute('data-copied');
        };
        input.select();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(done, function () {});
        } else if (document.execCommand('copy')) {
            done();
        }
    });
})();
