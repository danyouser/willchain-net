/**
 * WillChain — Translate uk.json into all other languages via Gemini
 * Usage: GEMINI_API_KEY=your_key node scripts/translate-langs.mjs
 */

import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LANG_DIR = path.join(ROOT, "lang");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌  Set GEMINI_API_KEY environment variable first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const TARGETS = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese (Brazil)",
  ru: "Russian",
  de: "German",
  fr: "French",
  tr: "Turkish",
  pl: "Polish",
  it: "Italian",
  nl: "Dutch",
};

// Keys that must NOT be translated (keep as-is)
const DO_NOT_TRANSLATE_KEYS = [
  "languages",           // language names stay in their own language
  "card1_icon",
  "card2_icon",
  "card3_icon",
];

// Keys that contain HTML — preserve tags
const HTML_KEYS = ["a6"]; // FAQ answer with <a href>

async function translateJSON(sourceObj, targetLang, targetLangName) {
  // Build a flat representation for translation
  const flat = flattenObj(sourceObj);

  // Remove keys we don't translate
  const toTranslate = {};
  for (const [k, v] of Object.entries(flat)) {
    const lastKey = k.split(".").pop();
    if (!DO_NOT_TRANSLATE_KEYS.includes(lastKey) && typeof v === "string") {
      toTranslate[k] = v;
    }
  }

  const prompt = `You are a professional translator for a blockchain crypto inheritance platform called WillChain.

Translate the following JSON values from Ukrainian to ${targetLangName}.

RULES:
1. Preserve JSON structure exactly — only translate the values, not the keys.
2. Keep all HTML tags intact (e.g. <a href="...">...</a>, <br>).
3. Keep "WillChain", "WILL", "MetaMask", "Base Sepolia", "Basescan", "Ethereum" — do NOT translate these.
4. Keep wallet addresses like "0x..." as-is.
5. Keep ↗ symbol as-is.
6. Keep © symbol as-is.
7. Translate naturally — not word-for-word. Use the tone appropriate for a trustworthy, human-friendly financial product.
8. For Russian: use neutral, respectful tone. Do NOT use Ukrainian-specific expressions.
9. The concept "спадкоємець" = heir/successor, "приватний ключ" = private key, "гаманець" = wallet, "таймер активності" = activity timer, "Я тут" = "I'm here" / "I'm alive".
10. Return ONLY valid JSON — no markdown, no explanation, no code blocks.

Input JSON (Ukrainian):
${JSON.stringify(toTranslate, null, 2)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in response for ${targetLang}`);
  }

  const translated = JSON.parse(jsonMatch[0]);

  // Merge back: start from source, apply translations, keep languages block
  const result = JSON.parse(JSON.stringify(sourceObj)); // deep clone
  for (const [flatKey, value] of Object.entries(translated)) {
    setNestedKey(result, flatKey, value);
  }

  // Always keep "languages" block identical (language names in their own language)
  result.languages = sourceObj.languages;

  return result;
}

function flattenObj(obj, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null) {
      Object.assign(result, flattenObj(v, fullKey));
    } else {
      result[fullKey] = v;
    }
  }
  return result;
}

function setNestedKey(obj, flatKey, value) {
  const parts = flatKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

async function main() {
  console.log("\n🌍  WillChain — Translation Script");

  const ukSource = JSON.parse(
    await readFile(path.join(LANG_DIR, "uk.json"), "utf-8")
  );

  const results = await Promise.all(
    Object.entries(TARGETS).map(async ([code, name]) => {
      console.log(`⏳  Translating → ${name} (${code})...`);
      try {
        const translated = await translateJSON(ukSource, code, name);
        const outPath = path.join(LANG_DIR, `${code}.json`);
        await writeFile(outPath, JSON.stringify(translated, null, 2) + "\n", "utf-8");
        console.log(`✅  ${code}.json saved`);
        return { code, ok: true };
      } catch (err) {
        console.error(`❌  ${code}: ${err.message}`);
        return { code, ok: false, err: err.message };
      }
    })
  );

  console.log("\n─── Summary ─────────────────────────────");
  results.forEach((r) => console.log(`  ${r.ok ? "✅" : "❌"}  ${r.code}${r.err ? " — " + r.err : ""}`));
  console.log(`\n  Done: ${results.filter((r) => r.ok).length}/${results.length}\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
