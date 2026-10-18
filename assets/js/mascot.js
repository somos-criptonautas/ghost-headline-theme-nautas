/* Community sidebar mascot (partials/community-sidebar.hbs): anonist sits on
 * the box's top border over the heading and blinks; every 20 s he walks the
 * border, waves or, less often, scratches his head. A click shows the phrase
 * of the day: one per local calendar day, the same for every visitor; edit
 * PHRASES to change them. Frames are the symbols of
 * assets/images/anonist-sprite.svg, swapped in steps. With reduced motion he
 * stays seated and only answers clicks.
 * Ships inside main.min.js.
 */
(function () {
    var PHRASES = [
        'be yourself', 'use foss', 'use monero', 'do it yourself', 'keep going',
        'trust yourself', 'keep it simple', 'sh*t happens', 'mutual aid', 'eat food',
        'just breathe', 'here and now', 'look at stars', 'be kindly', 'be humble',
        'start small', 'think big', 'play music', 'enjoy it', 'talk about it',
        'make it worth', 'trust your guts', 'follow your instinct', 'make it real',
        'move your body', 'make it happen', 'just relax', 'say it loud', 'share your art'
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
                show('sit');
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
                steps.push({frame: steps.length % 2 ? 'walk-b' : 'walk-a', x: at});
            }
        });
        return steps;
    };

    var wave = [{frame: 'idle'}].concat(repeat(['salute'], 8), [{frame: 'idle'}]);
    var scratch = repeat(['scratch-a', 'scratch-b'], 10);

    mascot.hidden = false;

    // The aside opens once the forum answers, and its width can change: keep his seat.
    new ResizeObserver(function () {
        if (!busy) {
            place(home());
            mascot.classList.remove('is-left');
        }
    }).observe(aside);

    mascot.querySelector('button').addEventListener('click', function () {
        var day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
        bubble.textContent = PHRASES[day % PHRASES.length];
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
            play([{frame: 'sit-blink'}]);
        }
        setTimeout(blink, 3000 + Math.random() * 3000);
    };
    setTimeout(blink, 3000);
})();
