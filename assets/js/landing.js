/* Landing (partials/landing.hbs): the page "inicio" arrives as one run of
 * paragraphs and h3 questions. Each question and its answer become one item,
 * two across from 992px (landing.css), read left to right; the last question -
 * how to go on - steps out of the grid, full width, to lead into the three
 * cards. Without this script the text reads as one column. Ships inside
 * main.min.js.
 */
(function () {
    var box = document.querySelector('.gh-landing-text .gh-content');
    var questions = box ? box.querySelectorAll(':scope > h3') : [];

    if (questions.length < 2) {
        return;
    }

    var grid = document.createElement('div');
    grid.className = 'gh-landing-faq';
    var next = document.createElement('div');
    next.className = 'gh-landing-next';
    var last = questions[questions.length - 1];

    Array.prototype.forEach.call(questions, function (question) {
        var group = [question];
        for (var el = question.nextElementSibling; el && el.tagName !== 'H3'; el = el.nextElementSibling) {
            group.push(el);
        }
        var item = question === last ? next : document.createElement('div');
        if (question !== last) {
            item.className = 'gh-landing-faq-item';
            grid.appendChild(item);
        }
        group.forEach(function (node) {
            item.appendChild(node);
        });
    });

    // What came before the first question stays first; the groups follow it.
    box.appendChild(grid);
    box.appendChild(next);
})();
