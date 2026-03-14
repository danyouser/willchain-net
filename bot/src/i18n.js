/**
 * WillChain Bot — Minimal i18n
 * Loads JSON locale files from bot/locales/{lang}.json
 * Falls back: requested lang → 'en' → raw key
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');
const cache = {};

const SUPPORTED_LANGS = ['uk', 'en', 'ru', 'de', 'fr', 'es', 'pt', 'pl', 'it', 'nl', 'tr'];

function loadLocale(lang) {
  if (cache[lang]) return cache[lang];
  const file = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    cache[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
    return cache[lang];
  } catch {
    return null;
  }
}

// Preload all available locales at startup
for (const lang of SUPPORTED_LANGS) {
  loadLocale(lang);
}

/**
 * Translate a key with optional interpolation: {{var}}
 * @param {string} lang - ISO 639-1 code (e.g. 'uk', 'en')
 * @param {string} key - dot-free flat key (e.g. 'start.welcome')
 * @param {Record<string, string|number>} [params]
 */
function t(lang, key, params) {
  const locale = cache[lang] || cache['en'] || {};
  let text = locale[key] ?? cache['en']?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/**
 * Get user language from grammY context
 * @param {object} ctx - grammY context
 * @returns {string} two-letter lang code
 */
function getLang(ctx) {
  const code = ctx?.from?.language_code?.slice(0, 2);
  if (code && cache[code]) return code;
  return 'en';
}

module.exports = { t, getLang, SUPPORTED_LANGS };
