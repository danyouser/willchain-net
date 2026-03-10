/**
 * WillChain — Translate React uk/translation.json into all other languages via Gemini
 * Usage: GEMINI_API_KEY=your_key node scripts/translate-react-langs.mjs
 */

import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "frontend-react", "public", "locales");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌  Set GEMINI_API_KEY environment variable first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Note: 'en' is maintained manually in frontend-react/public/locales/en/translation.json
// Only generate the other 9 languages from the Ukrainian source
const TARGETS = {
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

// Top-level keys that must NOT be translated (keep as-is)
const DO_NOT_TRANSLATE_TOP_KEYS = [
  "languages", // language names stay in their own language
];

async function translateJSON(sourceObj, targetLang, targetLangName) {
  const flat = flattenObj(sourceObj);

  const toTranslate = {};
  for (const [k, v] of Object.entries(flat)) {
    const topKey = k.split(".")[0];
    if (!DO_NOT_TRANSLATE_TOP_KEYS.includes(topKey) && typeof v === "string") {
      toTranslate[k] = v;
    }
  }

  const prompt = `You are a professional translator for a blockchain crypto inheritance platform called WillChain.

Translate the following JSON values from Ukrainian to ${targetLangName}.

RULES:
1. Preserve JSON structure exactly — only translate the values, not the keys.
2. Keep all HTML tags intact (e.g. <a href="...">...</a>, <br>).
3. Keep "WillChain", "WILL", "MetaMask", "Base Sepolia", "Basescan", "Ethereum", "WillChainBot" — do NOT translate these.
4. Keep wallet addresses like "0x..." as-is.
5. Keep ↗, ©, ℹ️, ⚠️ symbols as-is.
6. Keep interpolation placeholders like {{year}}, {{days}}, {{address}} — do NOT translate or remove these.
7. Translate naturally — not word-for-word. Use the tone appropriate for a trustworthy, human-friendly financial product.
8. For Russian: use neutral, respectful tone. Do NOT use Ukrainian-specific expressions.
9. Key concepts: "спадкоємець" = heir/successor, "приватний ключ" = private key, "гаманець" = wallet, "таймер активності" = activity timer, "пільговий період" = grace period.
10. Return ONLY valid JSON — no markdown, no explanation, no code blocks.

Input JSON (Ukrainian):
${JSON.stringify(toTranslate, null, 2)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in response for ${targetLang}`);
  }

  const translated = JSON.parse(jsonMatch[0]);

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
  console.log("\n🌍  WillChain React — Translation Script");

  const ukSource = JSON.parse(
    await readFile(path.join(LOCALES_DIR, "uk", "translation.json"), "utf-8")
  );

  const results = await Promise.all(
    Object.entries(TARGETS).map(async ([code, name]) => {
      console.log(`⏳  Translating → ${name} (${code})...`);
      try {
        const translated = await translateJSON(ukSource, code, name);
        const outDir = path.join(LOCALES_DIR, code);
        await mkdir(outDir, { recursive: true });
        const outPath = path.join(outDir, "translation.json");
        await writeFile(outPath, JSON.stringify(translated, null, 2) + "\n", "utf-8");
        console.log(`✅  ${code}/translation.json saved`);
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
