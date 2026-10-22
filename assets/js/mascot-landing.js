/* Landing mascot (partials/landing.hbs): anonist's mask floats over the top
 * border of the first row of questions, the grid landing.js builds (it comes
 * first in the bundle: files join in name order). He says hello once, when the
 * questions scroll in, for 6 s; after that he only talks when clicked, a
 * random line each time, one balloon at a time with a pause between them; a
 * click anywhere else closes it. Every 12 s he glides along his card, hops the gap to the other
 * one, winks, smiles or plays peek-a-boo: he sinks behind the border, peeks
 * out, sinks again and comes back up in the other style, mask or whole figure.
 * Frames are the symbols of assets/images/anonist-sprite.svg, swapped in steps.
 * With reduced motion he stays put and only talks. Ships inside main.min.js.
 */
(function () {
    var HELLO = 'Hello, amigo! I’m anonist, and I live here.';
    var PHRASES = [
        'Take your time. You can join us whenever you like.',
        'Feeling weird? Me too, just join us.',
        'Looking for something? Just get in.',
        'I’m made of everything this community knows.',
        'Today is a great day to be alive, isn’t it? Bonan tagon!',
        'We’re all the same ✊'
    ];
    var STEP = 160;
    var ARC = [0, -6, -12, -16, -18, -16, -12, -6, 0];
    var grid = document.querySelector('.gh-landing-faq');
    var mascot = document.querySelector('.gh-landing-mascot');

    if (!grid || !mascot) {
        return;
    }

    var bubble = mascot.querySelector('.gh-mascot-bubble');
    var use = mascot.querySelector('use');
    var sprite = use.getAttribute('href').split('#')[0];
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var masked = true;
    var busy = false;
    var seen = false;
    var greeted = false;
    var x = 0;
    var talking;
    var said = -1;
    // When the next click may open a balloon: a pause after each one closes.
    var ready = 0;

    // Frames shared by both styles go by their bare name; the mask's carry mask-.
    var show = function (frame) {
        use.setAttribute('href', sprite + '#anonist-48-' + (masked ? 'mask-' : '') + frame);
    };

    var place = function (to) {
        mascot.classList.toggle('is-left', to < x);
        x = to;
        mascot.style.transform = 'translateX(' + x + 'px)';
    };

    // The cards of the first row as [left, right] spans for his 48px box: the
    // drawings' empty sides let him reach the corners. One on phones, two from 992px.
    var cards = function () {
        var items = grid.querySelectorAll('.gh-landing-faq-item');
        return Array.prototype.filter.call(items, function (item) {
            return item.offsetTop === items[0].offsetTop;
        }).map(function (item) {
            return [item.offsetLeft, item.offsetLeft + item.offsetWidth - mascot.offsetWidth];
        });
    };

    var card = function (row) {
        for (var i = 0; i < row.length; i += 1) {
            if (x >= row[i][0] && x <= row[i][1]) {
                return i;
            }
        }
        return 0;
    };

    var anywhere = function (span) {
        return Math.round(span[0] + Math.random() * (span[1] - span[0]));
    };

    // Steps are {frame, x, y, sink, swap}, one every STEP ms: y lifts him, sink
    // lowers him behind the border (landing.css), swap changes style. He rests after the last.
    var play = function (steps, state) {
        state = state || 'is-busy';
        busy = true;
        mascot.classList.add('is-busy', state);
        var i = 0;
        var tick = function () {
            var step = steps[i];
            if (!step) {
                show('idle');
                mascot.classList.remove('is-busy', 'is-left', state);
                busy = false;
                return;
            }
            if (step.swap) {
                masked = !masked;
                mascot.classList.toggle('is-mask', masked);
            }
            show(step.frame || 'idle');
            if (step.x !== undefined) {
                place(step.x);
            }
            mascot.style.setProperty('--y', (step.y || 0) + 'px');
            mascot.style.setProperty('--sink', (step.sink || 0) + 'px');
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

    // 8px a step: the mask glides, the figure walks.
    var glide = function (from, to) {
        var steps = [];
        while (from !== to) {
            from += Math.max(-8, Math.min(8, to - from));
            steps.push({frame: masked ? 'idle' : steps.length % 2 ? 'walk-b' : 'walk-a', x: from});
        }
        return steps;
    };

    var wander = function () {
        var row = cards();
        return glide(x, anywhere(row[card(row)]));
    };

    // To the edge of his card, over the gap and on into the other card.
    var hop = function () {
        var row = cards();
        if (row.length < 2) {
            return wander();
        }
        var from = card(row);
        var to = 1 - from;
        var edge = to > from ? row[from][1] : row[from][0];
        var land = to > from ? row[to][0] : row[to][1];
        var steps = glide(x, edge);
        ARC.forEach(function (y, i) {
            var end = i === 0 || i === ARC.length - 1;
            steps.push({
                frame: masked ? 'idle' : end ? 'crouch' : 'air',
                x: Math.round(edge + (land - edge) * i / (ARC.length - 1)),
                y: y
            });
        });
        return steps.concat(glide(land, anywhere(row[to])));
    };

    // Sinks out of sight, peeks over the border looking around, sinks again
    // and rises in the other style.
    var peek = function () {
        var steps = [];
        var sink = function (from, to, frame) {
            while (from !== to) {
                from += Math.max(-8, Math.min(8, to - from));
                steps.push({frame: frame, sink: from});
            }
        };
        sink(0, 48, 'idle');
        steps.push({sink: 48}, {sink: 48}, {sink: 48});
        sink(48, 28, 'eyes-left');
        steps.push({frame: 'eyes-right', sink: 28}, {frame: 'eyes-left', sink: 28}, {frame: 'blink', sink: 28});
        sink(28, 48, 'idle');
        steps.push({sink: 48, swap: true}, {sink: 48}, {sink: 48});
        sink(48, 0, 'idle');
        return steps.concat(repeat(['smile'], 4));
    };

    // The balloon opens on his side with more room and wraps to fit it (landing.css).
    var shut = function () {
        clearTimeout(talking);
        bubble.textContent = '';
        ready = Date.now() + 1500;
    };

    var say = function (text, ms) {
        var right = grid.clientWidth - x - mascot.offsetWidth - 14;
        var left = x - 14;
        mascot.classList.toggle('is-flipped', left > right);
        bubble.style.maxWidth = Math.max(left, right) + 'px';
        bubble.textContent = text;
        clearTimeout(talking);
        talking = setTimeout(shut, ms || 2000 + text.length * 50);
    };

    grid.appendChild(mascot);
    place(cards()[0][0] + 16);
    mascot.classList.remove('is-left');
    mascot.hidden = false;

    // The grid reflows at 992px and with the window: keep him on a card.
    new ResizeObserver(function () {
        var row = cards();
        if (!busy && card(row) === 0 && (x < row[0][0] || x > row[0][1])) {
            place(Math.max(row[0][0], Math.min(row[0][1], x)));
            mascot.classList.remove('is-left');
        }
    }).observe(grid);

    new IntersectionObserver(function (entries) {
        seen = entries[0].isIntersecting;
        if (seen && !greeted) {
            greeted = true;
            say(HELLO, 6000);
        }
    }).observe(grid);

    document.addEventListener('pointerdown', function (event) {
        if (bubble.textContent && !mascot.contains(event.target)) {
            shut();
        }
    });

    mascot.querySelector('button').addEventListener('click', function () {
        if (bubble.textContent || Date.now() < ready) {
            return;
        }
        // Any line but the last one he said.
        var next;
        do {
            next = Math.floor(Math.random() * PHRASES.length);
        } while (next === said);
        said = next;
        say(PHRASES[said]);
        if (!busy && !still) {
            play(masked
                ? repeat(['idle', 'turn-a', 'side', 'back', 'side', 'turn-b'], 6)
                : [{frame: 'idle'}].concat(repeat(['salute'], 8), [{frame: 'idle'}]));
        }
    });

    if (still) {
        return;
    }

    setInterval(function () {
        if (busy || !seen || bubble.textContent) {
            return;
        }
        var roll = Math.random();
        if (roll < 0.15) {
            play(peek(), 'is-peeking');
        } else {
            play(roll < 0.45 ? wander() : roll < 0.7 ? hop() : repeat([roll < 0.85 ? 'wink' : 'smile'], 6));
        }
    }, 12000);

    var blink = function () {
        if (!busy) {
            play([{frame: 'blink'}]);
        }
        setTimeout(blink, 3000 + Math.random() * 3000);
    };
    setTimeout(blink, 3000);
})();
