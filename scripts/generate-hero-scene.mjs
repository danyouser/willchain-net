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
const ASSETS = path.join(ROOT, "frontend-react", "public", "assets");

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
Ultra-premium cinematic digital illustration for WillChain — a blockchain digital inheritance platform with its own WILL token.
Wide panoramic scene, 16:9 ratio, dark space aesthetic.

SCENE CONCEPT: "You → WillChain → Heir" — a trust and protection system for WILL tokens.

COMPOSITION (horizontal, left to right):

LEFT THIRD — "You (the wallet owner)":
- A calm translucent human figure made of soft blue-white light particles (#3b82f6).
- They hold a glowing smartphone. Small orbit of abstract hexagons.
- Warm aura around them. No text, just a soft blue halo.
- FROM this figure TO the center shield: a flowing arc stream of WILL token coins (see token design below).
  The tokens travel along a curved path from the owner toward the shield.

CENTER — "WillChain smart contract":
- A monumental glowing shield-clock hybrid, floating in the center.
- The shield is geometric, faceted like a cut diamond, made of deep blue-indigo crystalline energy.
- Inside the shield: a circular clock face with EXACTLY TWO glowing electric-blue hands (hour hand and minute hand ONLY — absolutely NO third hand, NO second hand, NO extra lines through the center).
- The entire structure pulses softly, like a heartbeat.
- A faint circular energy ring (portal-like) expands outward from it.
- WILL tokens flow INTO the shield from the left AND OUT of the shield to the right.

RIGHT THIRD — "Heir (receives WILL tokens)":
- A translucent FEMALE human silhouette made of warm green-violet particles (#10b981, #8b5cf6).
- She has a feminine body shape (slender shoulders, longer hair silhouette). Arms slightly open, receiving posture.
- FROM the shield TO this figure: a flowing arc stream of WILL token coins.
  The tokens travel along a curved path from the shield toward the heir.
- Soft green halo around them, welcoming and warm.

CRITICAL — WILL TOKEN COIN DESIGN (exact logo reference):
- Each coin is a CIRCLE filled with a diagonal linear gradient from blue (#3b7dd8) at top-left to violet (#6366f1) at bottom-right.
- On the coin face: a LARGE bold white letter "W" drawn as a connected zigzag stroke (like the letter W in a bold sans-serif font). The W takes up most of the coin area.
- ABOVE the W, near the top of the coin: TWO SMALL interlocking chain links (like a short chain segment), drawn in white/light color. These chain links are small and sit above the W like a crown.
- The overall coin design looks like: [chain links on top] + [big white W below] on a blue-violet gradient circle.
- The coins glow with soft blue-violet light.
- ABSOLUTELY NO Bitcoin "B" symbol, NO Ethereum diamond shape, NO dollar sign, NO any other real cryptocurrency logo.
- Every single coin in the image must match this exact WILL token design.

ATMOSPHERE:
- Background: pure black (#080b1c).
- Subtle grid of glowing dots in the background (blockchain nodes).
- Faint nebula purples and teals in the background.
- Volumetric light rays from the center shield outward.
- Film grain, depth of field, cinematic quality.
- No text, no labels, no UI elements.

CRITICAL — ALL EDGES MUST FADE TO BLACK:
- The TOP 15% of the image: must be completely pure black (#080b1c). Empty dark space — reserved for text overlay.
- The BOTTOM 12% of the image: must be completely pure black (#080b1c). Empty dark space — reserved for text overlay.
- The LEFT edge: the scene must gradually fade into pure black. The leftmost 5% must be pure black.
- The RIGHT edge: the scene must gradually fade into pure black. The rightmost 5% must be pure black.
- All four edges of the image pixel must be indistinguishable from #080b1c.
- The three figures and central shield should be contained in the MIDDLE 70% of the image vertically.
- Think of it as a vignette: bright center, smoothly fading to pure black on all sides.

COMPOSITION RULES:
- All three figures must be fully visible and vertically centered in the middle band.
- Wide 16:9 canvas. The scene floats in a sea of black.

STYLE:
Concept art level quality. Blade Runner 2049 aesthetic. Painterly precision.
Color palette: #080b1c background, #3b82f6 blue, #8b5cf6 violet, #10b981 green, #f59e0b gold, #ffffff for glows.
Extremely high detail. Premium feel.
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
