/**
 * WillChain — Section Background Generator via Gemini
 * Usage: source .env && node scripts/generate-section-images.mjs
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
  console.log(`\n⏳  ${name}`);
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
      console.error(`   ⚠️  No image. ${textPart?.text ?? ""}`);
      return false;
    }
    const buffer = Buffer.from(imagePart.inlineData.data, "base64");
    await writeFile(outputPath, buffer);
    console.log(`   ✅  ${outputPath.replace(ROOT + "/", "")}`);
    return true;
  } catch (err) {
    console.error(`   ❌  ${err.message}`);
    return false;
  }
}

const images = [
  // ── HOW IT WORKS — panoramic background ─────────────────────
  {
    file: path.join(ASSETS, "hiw-bg.png"),
    prompt: `
Ultra-premium wide panoramic background illustration for a "How It Works" section of a blockchain inheritance platform. 16:9 ratio, very wide.

CONCEPT: Four stages of a digital will — Get tokens → Designate heir → Use wallet → Set timer.

COMPOSITION (left to right, seamless flow):
- LEFT: A glowing abstract wallet icon with soft blue particle trails (#3b82f6).
  Small orbiting WILL token coins (blue-violet circles with white "W" letter). Warm welcoming glow.
- LEFT-CENTER: Two translucent silhouettes standing side by side warmly — a blue figure (#3b82f6) and a green figure (#10b981).
  They face each other with open body language, a glowing protective link/bond connects them.
  Caring, warm, protective feeling — like family. NOT commanding or pointing.
- RIGHT-CENTER: A hand interacting with floating holographic UI elements —
  abstract data blocks flowing. Dynamic energy lines.
- RIGHT: A beautiful crystalline hourglass/timer with blue-violet energy (#8b5cf6) sand flowing inside.
  Circular timer ring around it glowing softly.

Between each element: flowing energy streams, data particles, subtle connecting arcs of light.

CRITICAL — WILL TOKEN COIN DESIGN (exact logo reference):
- Each coin is a CIRCLE filled with a diagonal linear gradient from blue (#3b7dd8) at top-left to violet (#6366f1) at bottom-right.
- On the coin face: a LARGE bold white letter "W" drawn as a connected zigzag stroke (like the letter W in a bold sans-serif font). The W takes up most of the coin area.
- ABOVE the W, near the top of the coin: TWO SMALL interlocking chain links (like a short chain segment), drawn in white/light color.
- The overall coin design: [chain links on top] + [big white W below] on a blue-violet gradient circle.
- ABSOLUTELY NO Bitcoin "B", NO Ethereum diamond, NO dollar sign, NO any other real cryptocurrency logo anywhere.
- Every coin must be the WILL token only.

ATMOSPHERE:
- Background: ultra-dark space (#050810 to #0a0f1a gradient)
- Subtle grid of tiny dots in deep background
- Volumetric light, lens flares at key points
- Faint nebula colors: deep blue, violet, teal
- Film grain, cinematic depth of field

CRITICAL:
- Very wide 16:9 panorama
- Elements spread evenly across full width with breathing room
- Semi-transparent/ethereal — this will be used as a BACKGROUND behind text
- Keep center area slightly darker/emptier for text readability
- No text, no labels, no numbers
- Edge-to-edge atmospheric fill, no black bars

STYLE: Blade Runner 2049 aesthetic. Concept art quality.
Color palette: #050810 bg, #3b82f6 blue, #8b5cf6 violet, #10b981 green, #f59e0b gold accents.
    `.trim(),
  },

  // ── CREDITS — abstract accent strip ──────────────────────────
  {
    file: path.join(ASSETS, "credits-bg.png"),
    prompt: `
Thin horizontal energy ribbon on a pure black background.
Extremely wide aspect ratio (approximately 6:1 or wider), like a thin strip.

COMPOSITION:
- A single flowing horizontal wave/ribbon of luminous blue-violet energy (#3b82f6 → #8b5cf6)
  running through the CENTER of the image horizontally.
- The ribbon is made of intertwined glowing light strands, like fiber optic cables or neural pathways.
- Small glowing nodes/dots along the ribbon.
- The ribbon undulates gently, creating depth.

CRITICAL — EDGES FADE TO BLACK:
- The LEFT 20% of the image: the ribbon must gradually FADE OUT and DISAPPEAR into pure black.
  The leftmost edge must be completely pure black (#050810) with zero visible energy.
- The RIGHT 20% of the image: same — the ribbon must gradually FADE OUT and DISAPPEAR into pure black.
  The rightmost edge must be completely pure black (#050810) with zero visible energy.
- The ribbon is brightest and most visible in the CENTER 60% of the image.
- This creates a smooth vignette effect where the energy emerges from darkness and fades back into darkness.

BACKGROUND:
- Pure solid black (#050810) everywhere — no gradients, no noise, no grid, no texture.
- ONLY the energy ribbon and its soft glow provide visual interest.
- The background must be perfectly flat black so it blends seamlessly with any dark UI.

ATMOSPHERE:
- Soft glow/bloom around the ribbon, blue-violet haze
- Tiny floating particles near the ribbon only
- Subtle, not overwhelming — 30-40% opacity feel
- This goes BEHIND text — must not overpower

CRITICAL:
- VERY WIDE and SHORT — panoramic strip (1200x200 proportions)
- No text, no labels, no icons
- Background is PURE BLACK (#050810), not dark gray, not dark blue — BLACK
- Edge pixels must be indistinguishable from #050810

STYLE: Premium dark UI, like Vercel or Linear.
Color palette: #050810 bg, #3b82f6, #8b5cf6, subtle #10b981 green nodes.
    `.trim(),
  },
];

async function main() {
  if (!existsSync(ASSETS)) await mkdir(ASSETS, { recursive: true });

  console.log(`\n🍌  WillChain Section Image Generator`);
  console.log(`   Total: ${images.length} images\n`);

  const results = [];
  for (const img of images) {
    const ok = await generate(img.prompt, img.file);
    results.push({ file: path.basename(img.file), ok });
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n─── Summary ─────────────────────────────");
  results.forEach((r) => console.log(`  ${r.ok ? "✅" : "❌"}  ${r.file}`));
  console.log(`\n  Done: ${results.filter((r) => r.ok).length}/${results.length}`);
  console.log("  Convert: cwebp -q 85 hiw-bg.png -o hiw-bg.webp");
  console.log("           cwebp -q 85 credits-bg.png -o credits-bg.webp\n");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
