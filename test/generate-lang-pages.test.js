/**
 * Tests for pure utility functions in scripts/generate-lang-pages.mjs
 * (escapeAttr, getUrl, buildHreflangTags, processHtml)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Inline the pure functions under test ──

const SITE_URL = 'https://willchain.io';
const LANGUAGES = ['en', 'es', 'pt', 'ru', 'de', 'fr', 'tr', 'uk', 'pl', 'it', 'nl'];
const DEFAULT_LANG = 'en';
const OG_LOCALES = {
  en: 'en_US', es: 'es_ES', pt: 'pt_BR', ru: 'ru_RU',
  de: 'de_DE', fr: 'fr_FR', tr: 'tr_TR', uk: 'uk_UA',
  pl: 'pl_PL', it: 'it_IT', nl: 'nl_NL',
};

function getUrl(lang) {
  return lang === DEFAULT_LANG ? `${SITE_URL}/` : `${SITE_URL}/${lang}/`;
}

function buildHreflangTags() {
  const tags = LANGUAGES.map(l =>
    `    <link rel="alternate" hreflang="${l}" href="${getUrl(l)}">`
  ).join('\n');
  const xDefault = `    <link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`;
  return tags + '\n' + xDefault;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── escapeAttr ──
describe('escapeAttr', () => {
  test('returns plain string unchanged', () => {
    assert.equal(escapeAttr('hello world'), 'hello world');
  });

  test('escapes ampersand', () => {
    assert.equal(escapeAttr('a & b'), 'a &amp; b');
  });

  test('escapes double quotes', () => {
    assert.equal(escapeAttr('say "hi"'), 'say &quot;hi&quot;');
  });

  test('escapes less-than', () => {
    assert.equal(escapeAttr('a < b'), 'a &lt; b');
  });

  test('escapes greater-than', () => {
    assert.equal(escapeAttr('a > b'), 'a &gt; b');
  });

  test('escapes all special chars together', () => {
    assert.equal(escapeAttr('<a href="x&y">'), '&lt;a href=&quot;x&amp;y&quot;&gt;');
  });

  test('converts non-string to string first', () => {
    assert.equal(escapeAttr(42), '42');
    assert.equal(escapeAttr(null), 'null');
  });

  test('empty string stays empty', () => {
    assert.equal(escapeAttr(''), '');
  });
});

// ── getUrl ──
describe('getUrl', () => {
  test('en returns root URL', () => {
    assert.equal(getUrl('en'), 'https://willchain.io/');
  });

  test('uk returns /uk/ subdirectory', () => {
    assert.equal(getUrl('uk'), 'https://willchain.io/uk/');
  });

  test('all non-default langs get subdirectory', () => {
    for (const lang of LANGUAGES.filter(l => l !== 'en')) {
      assert.equal(getUrl(lang), `https://willchain.io/${lang}/`);
    }
  });
});

// ── buildHreflangTags ──
describe('buildHreflangTags', () => {
  const tags = buildHreflangTags();

  test('contains all 11 language tags', () => {
    for (const lang of LANGUAGES) {
      assert.ok(tags.includes(`hreflang="${lang}"`), `missing hreflang="${lang}"`);
    }
  });

  test('contains x-default tag pointing to root', () => {
    assert.ok(tags.includes('hreflang="x-default"'));
    assert.ok(tags.includes(`href="${SITE_URL}/"`));
  });

  test('en hreflang points to root (not /en/)', () => {
    assert.ok(tags.includes(`hreflang="en" href="${SITE_URL}/"`));
  });

  test('uk hreflang points to /uk/ subdirectory', () => {
    assert.ok(tags.includes(`hreflang="uk" href="${SITE_URL}/uk/"`));
  });
});

// ── Minimal HTML template for processHtml tests ──
// This mirrors the structure of frontend/index.html

function makeHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>WillChain — Blockchain Inheritance</title>
    <meta name="description" content="Original description">
    <meta property="og:title" content="Original OG Title">
    <meta property="og:description" content="Original OG Desc">
    <meta name="twitter:title" content="Original Twitter Title">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://willchain.io/">
    <meta property="og:locale" content="en_US">
    <link rel="canonical" href="https://willchain.io/">
    <!-- hreflang -->
    <link rel="alternate" hreflang="en" href="https://willchain.io/">
    <link rel="alternate" hreflang="x-default" href="https://willchain.io/">
    <!-- DNS prefetch -->
    <link rel="stylesheet" href="src/styles.css">
    <script src="src/lang-init.js"></script>
</head>
<body><h1>Test</h1></body>
</html>`;
}

// Inline processHtml (same as in the script)
function processHtml(html, lang, translations, isSubdir) {
  const m = translations.meta || {};
  const title = m.title || 'WillChain';
  const desc = m.description || '';
  const ogTitle = m.og_title || title;
  const ogDesc = m.og_description || desc;
  const canonicalUrl = getUrl(lang);
  const ogLocale = OG_LOCALES[lang] || 'en_US';
  const hreflangTags = buildHreflangTags();

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeAttr(desc)}">`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${escapeAttr(ogTitle)}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${escapeAttr(ogDesc)}">`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${escapeAttr(ogTitle)}">`
  );

  if (html.includes('<meta property="og:url"')) {
    html = html.replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${canonicalUrl}">`
    );
  }
  if (html.includes('<meta property="og:locale"')) {
    html = html.replace(
      /<meta property="og:locale" content="[^"]*">/,
      `<meta property="og:locale" content="${ogLocale}">`
    );
  }

  if (html.includes('<link rel="canonical"')) {
    html = html.replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${canonicalUrl}">`
    );
    html = html.replace(
      /<!-- hreflang -->\n(    <link rel="alternate"[^\n]*\n)+    <link rel="alternate" hreflang="x-default"[^\n]*/,
      `<!-- hreflang -->\n${hreflangTags}`
    );
  }

  if (isSubdir) {
    html = html.replace(/href="assets\//g, 'href="../assets/');
    html = html.replace(/href="src\//g, 'href="../src/');
    html = html.replace(/href="lang\//g, 'href="../lang/');
    html = html.replace(/src="assets\//g, 'src="../assets/');
    html = html.replace(/src="src\//g, 'src="../src/');
  }

  html = html.replace(/<script[^>]*>.*?willchain_lang.*?<\/script>/g, '');
  html = html.replace(/<script src="[^"]*lang-init\.js"><\/script>/g, '');
  const langInitSrc = isSubdir ? 'lang-init.js' : 'src/lang-init.js';
  html = html.replace('</head>', `    <script src="${langInitSrc}"></script>\n</head>`);

  return html;
}

describe('processHtml', () => {
  const ukTranslations = {
    meta: {
      title: 'WillChain — Блокчейн успадкування',
      description: 'Опис українською',
      og_title: 'WillChain OG UA',
      og_description: 'OG опис UA',
    },
  };

  test('sets html lang attribute', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('<html lang="uk"'));
  });

  test('updates <title> tag', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('<title>WillChain — Блокчейн успадкування</title>'));
  });

  test('updates meta description', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('content="Опис українською"'));
  });

  test('updates og:title', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('content="WillChain OG UA"'));
  });

  test('updates og:url to canonical subdirectory URL', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes(`og:url" content="${SITE_URL}/uk/"`));
  });

  test('updates og:locale for Ukrainian', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('content="uk_UA"'));
  });

  test('updates canonical link to subdirectory URL', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes(`canonical" href="${SITE_URL}/uk/"`));
  });

  test('isSubdir=true rewrites href="src/ to href="../src/', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('href="../src/'));
    assert.ok(!result.includes('href="src/'));
  });

  test('isSubdir=false does NOT rewrite href="src/ paths', () => {
    const result = processHtml(makeHtml(), 'en', ukTranslations, false);
    assert.ok(result.includes('href="src/styles.css'));
  });

  test('replaces old lang-init.js script with correct path for subdir', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    assert.ok(result.includes('<script src="lang-init.js"></script>'));
    assert.ok(!result.includes('<script src="src/lang-init.js"></script>'));
  });

  test('replaces old lang-init.js script with correct path for root', () => {
    const result = processHtml(makeHtml(), 'en', { meta: {} }, false);
    assert.ok(result.includes('<script src="src/lang-init.js"></script>'));
  });

  test('falls back to "WillChain" title when meta missing', () => {
    const result = processHtml(makeHtml(), 'uk', {}, true);
    assert.ok(result.includes('<title>WillChain</title>'));
  });

  test('escapes special chars in title', () => {
    const t = { meta: { title: 'WillChain & "Test" <v2>' } };
    const result = processHtml(makeHtml(), 'uk', t, true);
    assert.ok(result.includes('WillChain &amp; &quot;Test&quot; &lt;v2&gt;'));
  });

  test('hreflang block contains all 11 languages after replacement', () => {
    const result = processHtml(makeHtml(), 'uk', ukTranslations, true);
    for (const lang of LANGUAGES) {
      assert.ok(result.includes(`hreflang="${lang}"`), `missing hreflang="${lang}"`);
    }
  });

  test('canonical for en points to root (not /en/)', () => {
    const result = processHtml(makeHtml(), 'en', { meta: {} }, false);
    assert.ok(result.includes(`canonical" href="${SITE_URL}/"`));
    assert.ok(!result.includes(`canonical" href="${SITE_URL}/en/"`));
  });
});
