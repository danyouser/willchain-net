/**
 * WillChain — Generate hero-scene illustration (replaces video)
 * Usage: GEMINI_API_KEY=your_key node scripts/generate-hero-scene.mjs
 */

import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "frontend", "assets");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌  Set GEMINI_API_KEY environment variable first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function generate(prompt, outputPath) {
  const name = path.basename(outputPath);
  console.log(`\n⏳  Generating ${name}...`);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: prompt,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imagePart?.inlineData) {
      const textPart = parts.find((p) => p.text);
      console.error(`   ⚠️  No image returned. ${textPart?.text ?? ""}`);
      return false;
    }
    const buffer = Buffer.from(imagePart.inlineData.data, "base64");
    await writeFile(outputPath, buffer);
    console.log(`   ✅  Saved: ${outputPath.replace(ROOT + "/", "")}`);
    return true;
  } catch (err) {
    console.error(`   ❌  ${err.message}`);
    return false;
  }
}

const prompt = `
Ultra-premium cinematic digital illustration for a blockchain crypto inheritance platform.
Wide panoramic scene, 16:9 ratio, dark space aesthetic.

SCENE CONCEPT: "You → WillChain → Heir" — a trust and protection system for crypto assets.

COMPOSITION (horizontal, left to right):

LEFT THIRD — "You (the wallet owner)":
- A calm translucent human figure made of soft blue-white light particles (#3b82f6).
- They hold a glowing hardware wallet / smartphone with crypto symbols on screen.
- Warm aura around them. Small orbit of blockchain hexagons.
- Subtle inscription floating near them: no text, just a soft blue halo.

CENTER — "WillChain smart contract":
- A monumental glowing shield-clock hybrid, floating in the center.
- The shield is geometric, faceted like a cut diamond, made of deep blue-indigo crystalline energy.
- Inside the shield: a circular clock face with glowing electric-blue hands.
- The entire structure pulses softly, like a heartbeat.
- A faint circular energy ring (portal-like) expands outward from it.
- From the left figure to the shield: a flowing stream of glowing blue data particles (dashed dotted arc, like a secure connection).
- The stream is animated-looking: dots and nodes along the arc.

RIGHT THIRD — "Heir (receives assets)":
- A translucent human silhouette made of warm green-violet particles (#10b981, #8b5cf6).
- Their arms are slightly open, receiving posture.
- Flowing from the shield to this figure: golden glowing crypto coins/tokens in an arc stream.
- Soft green halo around them, welcoming and warm.

ATMOSPHERE:
- Background: near-black deep space (#050810), ultra-dark indigo-black gradient that fills the ENTIRE frame edge to edge.
- Subtle grid of glowing dots in the background (blockchain nodes).
- Faint nebula purples and teals in the background.
- Volumetric light rays from the center shield outward.
- Film grain, depth of field, cinematic quality.
- No text, no labels, no UI elements.

CRITICAL COMPOSITION RULES:
- The image must be filled edge to edge with content and atmosphere — NO black bars, NO letterbox, NO empty black bands at top or bottom.
- The background gradient must extend fully to all four corners and edges.
- All three figures must be fully visible and vertically centered in the frame.
- The scene fills the entire 16:9 canvas from corner to corner.

STYLE:
Concept art level quality. Blade Runner 2049 aesthetic. Painterly precision.
Color palette: #050810 background, #3b82f6 blue, #8b5cf6 violet, #10b981 green, #f59e0b gold (coins), #ffffff for glows.
Extremely high detail. Premium feel. Full-bleed 16:9 image, no borders, no padding.
`.trim();

async function main() {
  if (!existsSync(ASSETS)) await mkdir(ASSETS, { recursive: true });

  console.log("\n🍌  WillChain — Hero Scene Generator (Nano Banana 2)");

  const outputPath = path.join(ASSETS, "hero-scene.png");
  const ok = await generate(prompt, outputPath);

  if (ok) {
    console.log("\n✅  Done! Convert to webp with:");
    console.log(`   cwebp -q 90 ${outputPath} -o ${outputPath.replace(".png", ".webp")}`);
    console.log("   or: npx sharp-cli --input hero-scene.png --output hero-scene.webp");
  } else {
    console.log("\n❌  Generation failed.");
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
