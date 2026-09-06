const {series, parallel, watch, src, dest} = require('gulp');
const pump = require('pump');
const fs = require('fs');
const path = require('path');
const order = require('ordered-read-streams');

// gulp plugins and utils
const livereload = require('gulp-livereload');
const postcss = require('gulp-postcss');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const beeper = require('beeper');
const zip = require('gulp-zip');

// postcss plugins
const easyimport = require('postcss-easy-import');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

// The shared theme flips to the mobile nav at 767px; we want the burger through
// tablet. Retarget that one breakpoint to 991/992 — but ONLY inside the shared
// theme's nav CSS. A global rewrite would collapse this theme's own deliberate
// 768-991px blocks into `min-width: 992px and max-width: 991px`, which never
// matches. This replaces hand-editing assets/built/screen.css after every build.
const mobileNavBreakpoint = () => ({
    postcssPlugin: 'mobile-nav-breakpoint',
    AtRule: {
        media(rule) {
            const file = (rule.source && rule.source.input && rule.source.input.file) || '';
            if (!/shared-theme-assets\/assets\/css\/v\d\/components\/(header|navbar)\.css$/.test(file)) {
                return;
            }
            rule.params = rule.params
                .replace(/max-width:\s*767px/g, 'max-width: 991px')
                .replace(/min-width:\s*768px/g, 'min-width: 992px');
        }
    }
});
mobileNavBreakpoint.postcss = true;

// translations support
const { mergeLocales } = require('@tryghost/theme-translations/build');
const sharedThemeAssetsPath = path.dirname(require.resolve('@tryghost/shared-theme-assets/package.json'));

function serve(done) {
    livereload.listen();
    done();
}

function handleError(done) {
    return function (err) {
        if (err) {
            beeper();
        }
        return done(err);
    };
};

function hbs(done) {
    pump([
        src(['*.hbs', 'partials/**/*.hbs']),
        livereload()
    ], handleError(done));
}

function css(done) {
    pump([
        src('assets/css/screen.css', {sourcemaps: true}),
        src('assets/css/home.css', {sourcemaps: true}),
        postcss([
            easyimport,
            mobileNavBreakpoint(),
            autoprefixer(),
            cssnano()
        ]),
        dest('assets/built/', {sourcemaps: '.'}),
        livereload()
    ], handleError(done));
}

function getJsFiles(version) {
    const jsFiles = [
        src(`${sharedThemeAssetsPath}/assets/js/${version}/lib/**/*.js`),
        src(`${sharedThemeAssetsPath}/assets/js/${version}/main.js`),
    ];

    if (fs.existsSync(`assets/js/lib`)) {
        jsFiles.push(src(`assets/js/lib/*.js`));
    }

    jsFiles.push(src(`assets/js/main.js`));

    return jsFiles;
}

function js(done) {
    pump([
        // Order matters: the shared main.js calls reframe(), which the vendor
        // lib defines. A single src([...]) with several globs does not preserve
        // order across patterns - it emitted main.js first and the bundle threw
        // "reframe is not defined", aborting every script after it.
        order([
            src(`${sharedThemeAssetsPath}/assets/js/v1/lib/**/*.js`, {sourcemaps: true}),
            src(`${sharedThemeAssetsPath}/assets/js/v1/main.js`, {sourcemaps: true}),
            // theme.js is loaded on its own in <head> before first paint;
            // bundling it too would register the toggle handler twice and
            // cancel every click.
            //
            // typesense-search.min.js is a third-party build, already minified
            // and shipped with its own sourcemap comment; it has its own
            // <script> tag in site-scripts.hbs.
            src([
                'assets/js/*.js',
                '!assets/js/theme.js',
                '!assets/js/typesense-search.min.js',
            ], {sourcemaps: true}),
        ], {sourcemaps: true}),
        concat('main.min.js'),
        uglify(),
        dest('assets/built/', {sourcemaps: '.'}),
        livereload()
    ], handleError(done));
}

function zipper(done) {
    const filename = require('./package.json').name + '.zip';

    pump([
        src([
            '**',
            '!node_modules', '!node_modules/**',
            '!dist', '!dist/**',
            '!.git', '!.git/**',
            '!.github', '!.github/**',
            '!*.map',
            '!pnpm-debug.log',
            '!pnpm-lock.yaml',
            '!pnpm-workspace.yaml',
            '!headline.zip',
            '!AGENTS.md',
            '!CLAUDE.md',
        ], {encoding: false}),
        zip(filename),
        dest('dist/')
    ], handleError(done));
}

function locales(done) {
    mergeLocales({
        local: './locales-local',
        output: './locales'
    })(done);
}

const localesWatcher = () => watch('./locales-local/**/*.json', locales);
const hbsWatcher = () => watch(['*.hbs', 'partials/**/*.hbs'], hbs);
const cssWatcher = () => watch('assets/css/**/*.css', css);
const jsWatcher = () => watch('assets/js/*.js', js);
const watcher = parallel(hbsWatcher, cssWatcher, jsWatcher);

const build = series(css, js);

exports.build = build;
exports.zip = series(build, zipper);
exports.default = series(build, serve, watcher);
