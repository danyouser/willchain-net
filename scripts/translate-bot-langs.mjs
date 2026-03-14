/**
 * WillChain — Translate bot/locales/uk.json into all other languages via Gemini
 * Usage: source .env && node scripts/translate-bot-langs.mjs
 */

import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "bot", "locales");

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

async function translateJSON(sourceObj, targetLang, targetLangName) {
  const prompt = `You are a professional translator for a blockchain crypto inheritance platform called WillChain.
This is a Telegram bot — messages use Markdown formatting (*bold*, _italic_, \`code\`).

Translate the following JSON values from Ukrainian to ${targetLangName}.

RULES:
1. Preserve JSON structure exactly — only translate the values, not the keys.
2. Keep all Markdown formatting intact (*bold*, _italic_, \`code\`, etc.).
3. Keep "WillChain", "WILL", "MetaMask", "Base Sepolia", "Basescan", "Ethereum" — do NOT translate these.
4. Keep wallet addresses like "0x..." as-is.
5. Keep emoji (🔒, ✅, ❌, etc.) at their positions.
6. Keep {{variable}} placeholders exactly as-is.
7. Keep /command strings as-is (e.g. /link, /status, /verify, /email, /unlink, /notifications).
8. Translate naturally — not word-for-word. Use the tone appropriate for a trustworthy, human-friendly financial product.
9. For Russian: use neutral, respectful tone. Do NOT use Ukrainian-specific expressions.
10. The concept "спадкоємець" = heir/successor, "сховище" = vault, "гаманець" = wallet, "пільговий період" = grace period.
11. Return ONLY valid JSON — no markdown, no explanation, no code blocks.

Input JSON (Ukrainian):
${JSON.stringify(sourceObj, null, 2)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in response for ${targetLang}`);
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  console.log("\n🤖  WillChain Bot — Translation Script\n");

  const ukSource = JSON.parse(
    await readFile(path.join(LOCALES_DIR, "uk.json"), "utf-8")
  );

  const results = await Promise.all(
    Object.entries(TARGETS).map(async ([code, name]) => {
      console.log(`⏳  Translating → ${name} (${code})...`);
      try {
        const translated = await translateJSON(ukSource, code, name);
        const outPath = path.join(LOCALES_DIR, `${code}.json`);
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
