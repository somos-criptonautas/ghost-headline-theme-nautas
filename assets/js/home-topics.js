/* Homepage "+ More topics" (home.hbs). Ships inside main.min.js.
 *
 * Ghost renders up to nine extra tag sections, each in a hidden
 * .gh-topics-more wrapper. This reveals them three at a time - no requests,
 * they are already in the page, and their lazy images only load once shown.
 * Without this script the button stays hidden and "View all" (/blog/) shows.
 */
(function () {
    var box = document.querySelector('.gh-topics');

    if (!box) {
        return;
    }

    var BATCH = 3;
    var pending = Array.prototype.slice.call(box.querySelectorAll('.gh-topics-more[hidden]'));
    var button = box.querySelector('.gh-topics-button');
    var all = box.querySelector('.gh-topics-all');

    if (!pending.length || !button || !all) {
        return;
    }

    button.hidden = false;
    all.hidden = true;

    button.addEventListener('click', function () {
        var batch = pending.splice(0, BATCH);

        batch.forEach(function (section) {
            section.hidden = false;
        });

        // Last batch: the button gives way to the link to every tag.
        if (!pending.length) {
            button.hidden = true;
            all.hidden = false;
        }

        // Move focus to the first new section's heading link, so keyboard
        // and screen reader users land on what just appeared.
        var first = batch[0] && batch[0].querySelector('.gh-topic-name a');
        if (first) {
            first.focus();
        }
    });
})();
