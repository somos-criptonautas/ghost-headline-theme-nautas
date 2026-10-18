/* Community sidebar mascot (partials/community-sidebar.hbs): anonist sits on
 * the box's top border over the heading and blinks; every 20 s he walks the
 * border, waves or, less often, scratches his head. In the Mask style (.is-mask)
 * only the mask floats over the border: it glides instead of walking, spins
 * instead of waving and winks instead of scratching. Clicks go through the
 * three phrases of the day, one from each list of PHRASES in its order,
 * drawn by the local date: the same for every visitor. Frames are the symbols of
 * assets/images/anonist-sprite.svg, swapped in steps. With reduced motion he
 * stays seated and only answers clicks.
 * Ships inside main.min.js.
 */
(function () {
    // Freedom / tech, care (body and mind), community / growth.
    var PHRASES = [
        [
            'use foss', 'use monero', 'do it yourself', 'verify, don\'t trust', 'own your keys',
            'run your node', 'stay private', 'encrypt it', 'pay in cash', 'trade p2p',
            'build in public', 'question everything', 'use tor', 'run linux', 'opt out',
            'stay sovereign', 'self-host it', 'own your data', 'back up your seed',
            'mind your opsec', 'keep it local', 'stack monero', 'check the source', 'no kyc'
        ],
        [
            'eat food', 'just breathe', 'look at stars', 'play music', 'enjoy it',
            'move your body', 'just relax', 'drink water', 'take a walk', 'sleep well',
            'touch grass', 'cook at home', 'laugh often', 'plant something', 'stretch your body',
            'be yourself', 'trust yourself', 'sh*t happens', 'here and now', 'be patient',
            'rest when tired', 'dance a little', 'feel it all', 'forgive yourself'
        ],
        [
            'keep going', 'keep it simple', 'mutual aid', 'be kindly', 'be humble',
            'start small', 'think big', 'talk about it', 'make it worth', 'trust your guts',
            'follow your instinct', 'make it real', 'make it happen', 'say it loud',
            'share your art', 'help someone', 'say thank you', 'stay curious', 'less is more',
            'learn something', 'listen first', 'stay open', 'be the change', 'give credit'
        ]
    ];
    var STEP = 160;
    var mascot = document.querySelector('.gh-mascot');

    if (!mascot) {
        return;
    }

    var aside = mascot.closest('.gh-community');
    var title = aside.querySelector('.gh-community-title');
    var bubble = mascot.querySelector('.gh-mascot-bubble');
    var use = mascot.querySelector('use');
    var sprite = use.getAttribute('href').split('#')[0];
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var busy = false;
    var x = 0;
    var talking;
    var said = 0;
    var masked = mascot.classList.contains('is-mask');
    var REST = masked ? 'mask-idle' : 'sit';

    var show = function (frame) {
        use.setAttribute('href', sprite + '#anonist-48-' + frame);
        // Seated frames rest on the border, the others stand on it (community.css).
        mascot.classList.toggle('is-standing', !/^(sit|scratch)/.test(frame));
    };

    var place = function (to) {
        mascot.classList.toggle('is-left', to < x);
        x = to;
        mascot.style.transform = 'translateX(' + x + 'px)';
    };

    // His seat: over the middle of the heading.
    var home = function () {
        return Math.round(title.offsetLeft + (title.offsetWidth - mascot.offsetWidth) / 2);
    };

    // Steps are {frame, x}, one every STEP ms; he sits back down after the last.
    var play = function (steps) {
        busy = true;
        var i = 0;
        var tick = function () {
            if (i === steps.length) {
                show(REST);
                mascot.classList.remove('is-left');
                busy = false;
                return;
            }
            show(steps[i].frame);
            if (steps[i].x !== undefined) {
                place(steps[i].x);
            }
            i += 1;
            setTimeout(tick, STEP);
        };
        tick();
    };

    var repeat = function (frames, times) {
        var steps = [];
        for (var i = 0; i < times; i += 1) {
            steps.push({frame: frames[i % frames.length]});
        }
        return steps;
    };

    // To the right end, the left end and back to his seat, 8 px a step.
    var walk = function () {
        var steps = [];
        var at = x;
        [aside.clientWidth - mascot.offsetWidth, 0, home()].forEach(function (to) {
            while (at !== to) {
                at += Math.max(-8, Math.min(8, to - at));
                steps.push({frame: masked ? 'mask-idle' : steps.length % 2 ? 'walk-b' : 'walk-a', x: at});
            }
        });
        return steps;
    };

    // One phrase from each list for the local date, from a small seeded generator.
    var today = function () {
        var seed = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
        return PHRASES.map(function (list) {
            seed = (seed * 9301 + 49297) % 233280;
            return list[seed % list.length];
        });
    };

    // One turn of the mask, showing the strap on its back, as on the forum.
    var wave = masked
        ? repeat(['mask-idle', 'mask-turn-a', 'mask-side', 'mask-back', 'mask-side', 'mask-turn-b'], 6)
        : [{frame: 'idle'}].concat(repeat(['salute'], 8), [{frame: 'idle'}]);
    var scratch = masked ? repeat(['mask-wink'], 6) : repeat(['scratch-a', 'scratch-b'], 10);

    mascot.hidden = false;

    // The aside opens once the forum answers, and its width can change: keep his seat.
    new ResizeObserver(function () {
        if (!busy) {
            place(home());
            mascot.classList.remove('is-left');
        }
    }).observe(aside);

    mascot.querySelector('button').addEventListener('click', function () {
        bubble.textContent = today()[said % 3];
        said += 1;
        // In the right half of the box the balloon opens on his left (community.css).
        mascot.classList.toggle('is-flipped', x > aside.clientWidth / 2);
        clearTimeout(talking);
        // Emptied, the bubble hides (community.css) and the next click is announced again.
        talking = setTimeout(function () {
            bubble.textContent = '';
        }, 3000);
        if (!busy && !still) {
            play(wave);
        }
    });

    if (still) {
        return;
    }

    setInterval(function () {
        if (busy || aside.hidden) {
            return;
        }
        var roll = Math.random();
        play(roll < 0.55 ? walk() : roll < 0.85 ? wave : scratch);
    }, 20000);

    var blink = function () {
        if (!busy) {
            play([{frame: masked ? 'mask-blink' : 'sit-blink'}]);
        }
        setTimeout(blink, 3000 + Math.random() * 3000);
    };
    setTimeout(blink, 3000);
})();
