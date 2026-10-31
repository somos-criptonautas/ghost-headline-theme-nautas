/* The error page's art: the status code in block digits drawn as text, with
 * anonist's mask floating to and fro beneath it, looking where it goes and
 * blinking now and then. Frames are the symbols of
 * assets/images/anonist-sprite.svg. The copy stays in error.hbs, in the site's
 * language. With reduced motion the mask holds still. Ships inside main.min.js.
 *
 * The digits and the drift are adapted from src/pieces/not-found.ts of https://github.com/bas3line/ascii
 *
 * MIT License
 *
 * Copyright (c) 2026 bas3line (https://github.com/bas3line)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function () {
    var el = document.querySelector('.error-art');
    if (!el) return;

    var COLS = 60, ROWS = 10, FPS = 15, PERIOD = 9;
    // A 3x5 font, each column drawn 4 cells wide and the rows 2,1,2,1,2 tall.
    var FONT = {
        0: '###,#.#,#.#,#.#,###',
        1: '##.,.#.,.#.,.#.,###',
        2: '###,..#,###,#..,###',
        3: '###,..#,###,..#,###',
        4: '#.#,#.#,###,..#,..#',
        5: '###,#..,###,..#,###',
        6: '###,#..,###,#.#,###',
        7: '###,..#,..#,..#,..#',
        8: '###,#.#,###,#.#,###',
        9: '###,#.#,###,..#,###'
    };
    var RH = [2, 1, 2, 1, 2];
    var DW = 12, GAP = 4, TOP = 1;
    // Em per cell across, and half a row.
    var CELL = 0.6, BOB = 0.5;

    var base = new Array(COLS * ROWS);
    var face = new Uint8Array(COLS * ROWS);
    var digits = (el.getAttribute('data-code') || '').replace(/[^0-9]/g, '').slice(0, 3).split('');
    if (!digits.length) digits = ['4', '0', '4'];
    var x0 = Math.floor((COLS - (digits.length * DW + (digits.length - 1) * GAP + 1)) / 2);
    digits.forEach(function (d, i) {
        var r = TOP;
        FONT[d].split(',').forEach(function (bits, fr) {
            for (var k = 0; k < RH[fr]; k++, r++) {
                for (var fc = 0; fc < 3; fc++) {
                    if (bits[fc] !== '#') continue;
                    for (var c = 0; c < 4; c++) face[r * COLS + x0 + i * (DW + GAP) + fc * 4 + c] = 1;
                }
            }
        });
    });

    function at(r, c) {
        return r >= 0 && c >= 0 && r < ROWS && c < COLS && face[r * COLS + c] === 1;
    }

    // The shadow is the face moved one cell down and right, in double lines.
    for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
            if (at(r, c)) {
                base[r * COLS + c] = '░';
                continue;
            }
            var L = at(r, c - 1), U = at(r - 1, c), UL = at(r - 1, c - 1);
            base[r * COLS + c] = L && U ? '╔' : L ? (UL ? '║' : '╗') : U ? (UL ? '═' : '╚') : UL ? '╝' : ' ';
        }
    }

    var lines = [];
    for (var row = 0; row < ROWS; row++) lines.push(base.slice(row * COLS, (row + 1) * COLS).join(''));
    el.querySelector('pre').textContent = lines.join('\n');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var mask = el.querySelector('svg');
    var use = mask.querySelector('use');
    var sprite = use.getAttribute('href').split('#')[0];
    var shown = '';
    var last = 0;
    requestAnimationFrame(function tick(now) {
        if (now - last >= 1000 / FPS) {
            last = now;
            var t = now / 1000;
            var ph = (t / PERIOD) * Math.PI * 2;
            // Whole cells across and half a row up and down, as the art moves.
            var x = Math.round(18 * Math.sin(ph)) * CELL;
            var y = Math.round(Math.sin((t / 1.5) * Math.PI * 2)) * BOB;
            mask.style.transform = 'translate(calc(-50% + ' + x + 'em), ' + y + 'em)';
            var frame = t % 5 < 0.2 ? 'blink' : Math.cos(ph) >= 0 ? 'eyes-right' : 'eyes-left';
            if (frame !== shown) {
                shown = frame;
                use.setAttribute('href', sprite + '#anonist-48-mask-' + frame);
            }
        }
        requestAnimationFrame(tick);
    });
})();
