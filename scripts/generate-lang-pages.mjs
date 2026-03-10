/**
 * generate-lang-pages.mjs
 *
 * Generates pre-rendered HTML pages for each language under frontend/{lang}/index.html
 * Each page has correct meta tags (title, description, og:title, og:description)
 * and all asset paths adjusted for the subdirectory.
 *
 * Usage: node scripts/generate-lang-pages.mjs [SITE_URL]
 * Example: SITE_URL=https://willchain.io node scripts/generate-lang-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FRONTEND = join(ROOT, 'frontend');
const LANG_DIR = join(FRONTEND, 'lang');

const SITE_URL = (process.env.SITE_URL || 'https://willchain.io').replace(/\/$/, '');

const LANGUAGES = ['en', 'es', 'pt', 'ru', 'de', 'fr', 'tr', 'uk', 'pl', 'it', 'nl'];
// en is the default (served from root /), others get /{lang}/ subdirectory
const DEFAULT_LANG = 'en';

// OG locale mapping
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

function processHtml(html, lang, translations, isSubdir) {
  const m = translations.meta || {};
  const title = m.title || 'WillChain';
  const desc = m.description || '';
  const ogTitle = m.og_title || title;
  const ogDesc = m.og_description || desc;
  const canonicalUrl = getUrl(lang);
  const ogLocale = OG_LOCALES[lang] || 'en_US';
  const hreflangTags = buildHreflangTags();

  // 1. Update <html lang>
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);

  // 2. Update <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);

  // 3. Update <meta name="description">
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeAttr(desc)}">`
  );

  // 4. Update og:title
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${escapeAttr(ogTitle)}">`
  );

  // 5. Update og:description
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${escapeAttr(ogDesc)}">`
  );

  // 6. Update twitter:title
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${escapeAttr(ogTitle)}">`
  );

  // 6b. Make og:image and twitter:image absolute (required by social crawlers)
  html = html.replace(
    /<meta property="og:image" content="(?!https?:\/\/)([^"]+)"/,
    `<meta property="og:image" content="${SITE_URL}/$1"`
  );
  html = html.replace(
    /<meta name="twitter:image" content="(?!https?:\/\/)([^"]+)"/,
    `<meta name="twitter:image" content="${SITE_URL}/$1"`
  );

  // 7. Add/update og:url
  if (html.includes('<meta property="og:url"')) {
    html = html.replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${canonicalUrl}">`
    );
  } else {
    html = html.replace(
      '<meta property="og:type"',
      `<meta property="og:url" content="${canonicalUrl}">\n    <meta property="og:type"`
    );
  }

  // 8. Add/update og:locale
  if (html.includes('<meta property="og:locale"')) {
    html = html.replace(
      /<meta property="og:locale" content="[^"]*">/,
      `<meta property="og:locale" content="${ogLocale}">`
    );
  } else {
    html = html.replace(
      '<meta property="og:type"',
      `<meta property="og:locale" content="${ogLocale}">\n    <meta property="og:type"`
    );
  }

  // 9. Add/update canonical + hreflang block
  const hreflangBlock = `<link rel="canonical" href="${canonicalUrl}">\n    <!-- hreflang -->\n${hreflangTags}`;
  if (html.includes('<link rel="canonical"')) {
    // Replace existing canonical
    html = html.replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${canonicalUrl}">`
    );
    // Replace existing hreflang block (from <!-- hreflang --> to last <link rel="alternate"...)
    html = html.replace(
      /<!-- hreflang -->\n(    <link rel="alternate"[^\n]*\n)+    <link rel="alternate" hreflang="x-default"[^\n]*/,
      `<!-- hreflang -->\n${hreflangTags}`
    );
  } else {
    html = html.replace(
      '<!-- DNS prefetch',
      `${hreflangBlock}\n    <!-- DNS prefetch`
    );
  }

  // 10. Fix asset paths for subdirectory (../assets, ../src, ../lang)
  if (isSubdir) {
    // href="assets/... → href="../assets/...
    html = html.replace(/href="assets\//g, 'href="../assets/');
    html = html.replace(/href="src\//g, 'href="../src/');
    html = html.replace(/href="lang\//g, 'href="../lang/');
    // src="assets/... → src="../assets/...
    html = html.replace(/src="assets\//g, 'src="../assets/');
    html = html.replace(/src="src\//g, 'src="../src/');
    // preload hrefs
    html = html.replace(/href="assets\//g, 'href="../assets/');
    // manifest
    html = html.replace(/href="assets\/manifest\.webmanifest"/, 'href="../assets/manifest.webmanifest"');
  }

  // 11. Inject/replace initial lang hint so JS picks it up immediately (avoids flash)
  // For subdir pages: always set the lang (user navigated to /uk/ explicitly)
  // For root (/): only set if no saved preference (don't override user's choice)
  if (html.includes("localStorage.setItem('willchain_lang'") || html.includes("__LANG_HINT__")) {
    html = html.replace(
      /\s*<script>[^<]*willchain_lang[^<]*<\/script>/g,
      ''
    );
  }
  const langInitSrc = isSubdir ? 'lang-init.js' : 'src/lang-init.js';
  // Replace existing inline lang script or external lang-init reference
  html = html.replace(/<script[^>]*>.*?willchain_lang.*?<\/script>/g, '');
  html = html.replace(/<script src="[^"]*lang-init\.js"><\/script>/g, '');
  html = html.replace(
    '</head>',
    `    <script src="${langInitSrc}"></script>\n</head>`
  );

  return html;
}

async function main() {
  const baseHtml = readFileSync(join(FRONTEND, 'index.html'), 'utf8');

  // Update base index.html (en — default lang) with hreflang + canonical
  console.log(`📝  Updating base index.html (${DEFAULT_LANG})...`);
  const defaultTranslations = JSON.parse(readFileSync(join(LANG_DIR, `${DEFAULT_LANG}.json`), 'utf8'));
  const updatedBase = processHtml(baseHtml, DEFAULT_LANG, defaultTranslations, false);
  writeFileSync(join(FRONTEND, 'index.html'), updatedBase, 'utf8');
  console.log('  ✅  frontend/index.html updated');

  // Generate pages for all non-default languages
  for (const lang of LANGUAGES) {
    if (lang === DEFAULT_LANG) continue;

    const langFile = join(LANG_DIR, `${lang}.json`);
    if (!existsSync(langFile)) {
      console.warn(`  ⚠️  ${lang}.json not found, skipping`);
      continue;
    }

    const translations = JSON.parse(readFileSync(langFile, 'utf8'));
    const outDir = join(FRONTEND, lang);
    mkdirSync(outDir, { recursive: true });

    const processed = processHtml(baseHtml, lang, translations, true);
    writeFileSync(join(outDir, 'index.html'), processed, 'utf8');
    writeFileSync(join(outDir, 'lang-init.js'), `localStorage.setItem('willchain_lang','${lang}');\n`, 'utf8');
    console.log(`  ✅  frontend/${lang}/index.html`);
  }

  console.log('\n✅  Done! Generated pages for all languages.');
  console.log('   Add nginx rules: location /en/ { try_files $uri /en/index.html; }');
}

main().catch(e => { console.error(e); process.exit(1); });
