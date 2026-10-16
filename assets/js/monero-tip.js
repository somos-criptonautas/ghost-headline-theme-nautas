/* Monero tips: the pill at the end of the article (partials/reactions.hbs)
 * and the icon among the author's social links (author.hbs), both opening
 * partials/monero-tip-dialog.hbs. Ships inside main.min.js.
 *
 * The forum's discourse-monero-tips plugin answers /monero-tips/{username}.json
 * with the address, a QR data URL and the monero: link; it 404s while the
 * account has no address, and the button stays hidden. Sent with the forum
 * cookie so a member signed in there gets their own attributed subaddress
 * when the account has verified tips on (same CORS setup as reactions.js).
 *
 * The words follow the browser's language (Spanish or English), not the
 * site's, so they are filled here rather than with {{t}}.
 */
(function () {
    // Same forum as the comments embed (discourse-embed.js).
    var ORIGIN = (document.documentElement.getAttribute('data-discourse') || '').replace(/\/+$/, '');

    var dialog = document.querySelector('.gh-monero-tip-dialog');

    if (!ORIGIN || !dialog || !window.fetch) {
        return;
    }

    // The "Monero tips username" setting: the forum account every tip goes to.
    var USERNAME = encodeURIComponent(dialog.getAttribute('data-username') || '');

    if (!USERNAME) {
        return;
    }

    var WORDS = /^es\b/i.test(navigator.language || '') ? {
        tips: 'tips en XMR',
        intro: 'El tip va directo a la wallet del autor.',
        scan: 'Escanear desde wallet',
        address: 'Dirección de Monero',
        copy: 'copiar dirección',
        copied: 'copiada',
        wallet: 'abrir en wallet',
        close: 'cerrar'
    } : {
        tips: 'XMR tips',
        intro: "The tip goes straight to the author's wallet.",
        scan: 'Scan from wallet',
        address: 'Monero address',
        copy: 'copy address',
        copied: 'copied',
        wallet: 'open in wallet',
        close: 'close'
    };

    [['data-i18n', null], ['data-i18n-aria', 'aria-label'], ['data-i18n-alt', 'alt']].forEach(function (pair) {
        Array.prototype.forEach.call(document.querySelectorAll('[' + pair[0] + ']'), function (el) {
            var text = WORDS[el.getAttribute(pair[0])];
            if (pair[1]) {
                el.setAttribute(pair[1], text);
            } else {
                el.textContent = text;
            }
        });
    });

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
            copy.textContent = WORDS.copied;
        };
        input.select();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(done, function () {});
        } else if (document.execCommand('copy')) {
            done();
        }
    });
})();
