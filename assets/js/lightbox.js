/* Lightbox on PhotoSwipe 5 (assets/js/vendor/photoswipe.umd.min.js).
 *
 * The shared main.js (@tryghost/shared-theme-assets) calls lightbox(selector)
 * for image cards, galleries and the feature image. This replaces the shared
 * PhotoSwipe 4 version, which gulpfile.js leaves out of the bundle together
 * with its vendor files; it is bundled before the shared main.js.
 *
 * Over the defaults: the device's back button closes the lightbox instead of
 * leaving the article, the figure's caption shows under the image, and the
 * image opened is the largest one in its srcset, so zooming stays sharp.
 */
function lightbox(trigger) {
    var isImageCard = function (el) {
        return !!el && (el.classList.contains('kg-image-card') || el.classList.contains('kg-gallery-card'));
    };

    var largest = function (image) {
        var best = image.currentSrc || image.getAttribute('src');
        var bestWidth = 0;
        (image.getAttribute('srcset') || '').split(',').forEach(function (candidate) {
            var parts = candidate.trim().split(/\s+/);
            var width = parseInt(parts[1], 10);
            if (parts[0] && width > bestWidth) {
                bestWidth = width;
                best = parts[0];
            }
        });
        return best;
    };

    var slide = function (image) {
        var figure = image.closest('figure');
        var caption = figure && figure.querySelector('figcaption');
        return {
            src: largest(image),
            msrc: image.currentSrc || image.getAttribute('src'),
            // Images without dimensions in the markup, like feature images,
            // are measured from what the browser loaded.
            width: parseInt(image.getAttribute('width'), 10) || image.naturalWidth,
            height: parseInt(image.getAttribute('height'), 10) || image.naturalHeight,
            alt: image.getAttribute('alt') || '',
            caption: caption ? caption.innerHTML : '',
            element: image
        };
    };

    // An image card or gallery opens together with the image cards and
    // galleries right before and after it; anything else opens on its own.
    var group = function (image) {
        var card = image.closest('.kg-image-card, .kg-gallery-card');
        if (!card) {
            return [image];
        }
        while (isImageCard(card.previousElementSibling)) {
            card = card.previousElementSibling;
        }
        var images = [];
        for (; isImageCard(card); card = card.nextElementSibling) {
            Array.prototype.push.apply(images, card.querySelectorAll('img'));
        }
        return images;
    };

    var open = function (images, index) {
        var pswp = new PhotoSwipe({
            dataSource: images.map(slide),
            index: index
        });

        pswp.on('uiRegister', function () {
            pswp.ui.registerElement({
                name: 'caption',
                order: 9,
                isButton: false,
                appendTo: 'root',
                onInit: function (el) {
                    pswp.on('change', function () {
                        var caption = pswp.currSlide.data.caption;
                        el.innerHTML = caption;
                        el.hidden = !caption;
                    });
                }
            });
        });

        // Back closes the lightbox: an entry is pushed on open, back pops it,
        // and closing any other way removes it again.
        var closedByBack = false;
        var onBack = function () {
            closedByBack = true;
            pswp.close();
        };
        history.pushState({lightbox: true}, '');
        window.addEventListener('popstate', onBack);
        pswp.on('destroy', function () {
            window.removeEventListener('popstate', onBack);
            if (!closedByBack && history.state && history.state.lightbox) {
                history.back();
            }
        });

        pswp.init();
    };

    document.querySelectorAll(trigger).forEach(function (image) {
        image.addEventListener('click', function (event) {
            event.preventDefault();
            var images = group(image);
            open(images, Math.max(0, images.indexOf(image)));
        });
    });
}
