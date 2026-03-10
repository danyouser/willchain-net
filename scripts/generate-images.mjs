/**
 * WillChain — Premium Image Generator via Google Gemini (Nano Banana 2)
 * Usage: GEMINI_API_KEY=your_key node scripts/generate-images.mjs
 */

import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "frontend", "assets");
const ICONS_DIR = path.join(ASSETS, "icons");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌  Set GEMINI_API_KEY environment variable first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

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

// ═══════════════════════════════════════════════════════════
// PREMIUM PROMPTS — Ultra-quality dark space aesthetic
// ═══════════════════════════════════════════════════════════

const images = [

  // ── HERO ILLUSTRATION ─────────────────────────────────────────────────────
  {
    file: path.join(ASSETS, "hero-illustration.png"),
    prompt: `
Ultra-premium cinematic digital art for a blockchain inheritance platform.
Deep space background, near-black (#050810), ultra-deep indigo to black gradient.

COMPOSITION (left to right, wide 16:9):
- LEFT: A translucent human silhouette made of flowing blue light particles (#3b82f6),
  holding a glowing crypto hardware wallet. Soft electric aura around them.
  Small floating blockchain hexagons orbit them.
- CENTER: A monumental glowing clock-shield hybrid — the clock face shows digital time,
  the shield is made of crystalline blue-violet energy panels, slightly 3D.
  It pulses with a heartbeat-like glow. Blue timer hands slowly moving.
  Below it: a faint circular energy ring, like a portal.
- RIGHT: Another translucent silhouette, warmer violet-green glow (#10b981),
  arms open as if receiving. Floating glowing coins/tokens flow toward them
  from the center shield along a luminous data-stream arc.

ATMOSPHERE:
Cinematic depth of field. Dramatic volumetric light rays from center.
Faint star field in background. Subtle nebula purples and deep teals.
Grid of tiny glowing dots (like blockchain nodes) in distant background.
Floating digital data particles throughout the scene.
Film grain overlay for premium texture.

STYLE: Concept art quality, like Blade Runner 2049 x crypto.
Painterly but precise. Extreme detail. No text, no UI elements.
Color palette: #050810 (bg), #3b82f6 (blue), #8b5cf6 (violet), #10b981 (green), #ffffff (white glows).
    `.trim(),
  },

  // ── HERO BACKGROUND ───────────────────────────────────────────────────────
  {
    file: path.join(ASSETS, "hero-bg.png"),
    prompt: `
Abstract ultra-dark atmospheric background, pure CSS overlay texture.
Absolutely pure black to deep navy (#050810) base.

Elements:
- Extremely subtle, barely visible dot-grid in very dark navy (#0d1520).
  Grid dots are 1px, spaced 48px. Almost invisible but adds depth.
- TOP-LEFT corner: one massive, very soft radial glow blob —
  deep electric blue (#1d4ed8), completely blurred, like a distant nebula.
  Opacity barely 15%, radius covers 40% of image.
- BOTTOM-RIGHT: one massive soft violet-purple glow (#4c1d95), same blur.
  Slightly smaller, even more transparent.
- Thin horizontal scan lines (barely visible, 1-2% opacity) adding premium texture.
- Extremely faint vertical light column in the very center — like a spotlight from above.

RESULT: Nearly pure black image with hints of deep color.
Must look like it was designed by Apple or Vercel.
No objects, no shapes, pure atmosphere.
Wide 16:9. Ultra-minimal. Luxury dark.
    `.trim(),
  },

  // ── OG IMAGE ──────────────────────────────────────────────────────────────
  {
    file: path.join(ASSETS, "og-image.png"),
    prompt: `
Premium social media preview card (Open Graph image, 1200x630px) for WillChain.
Dark cinematic backdrop, deep space navy (#050810).

CENTER: A glowing crystalline shield-clock monogram —
the shield is geometric, made of prismatic blue-violet energy planes.
Inside the shield: a clock face with glowing hands, electric blue.
The whole symbol floats with soft light rays emanating outward.
Subtle sparkle particles around it.

LOWER HALF: Very dark, near-black — reserved for text overlay (leave empty).
A faint gradient: transparent at top, slightly darker at bottom.

SIDES: Abstract extremely faint blockchain network lines/nodes extending outward.

Color palette: #050810 bg, #3b82f6 blue, #8b5cf6 violet, #ffffff glow.
Premium quality, like a luxury brand reveal. No text. 16:9 letterbox.
    `.trim(),
  },

  // ── ICON: LOST PASSWORD ──────────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-lock.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

A glowing broken padlock. The lock body is split diagonally —
left half electric crimson (#ef4444), right half dark steel.
The shackle is snapped open and broken.
A large stylized X made of electric red plasma overlays the lock.
Intense red-orange glow corona around the X.
Small sparks and fragments flying outward from the break point.
The broken pieces slowly dissolve into red pixel dust.

3D rendered look, Unreal Engine quality.
Hyper-detailed metal textures. Neon glow bloom.
Pure black background, no other elements.
Square 1:1 ratio. Centered. Ultra-close crop.
    `.trim(),
  },

  // ── ICON: FORGOTTEN WALLET ───────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-time.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

A dramatic hourglass made of dark crystal/obsidian material.
The glass is cracked and webbed with spider-cracks.
Golden amber sand (#f59e0b) slowly falling through, glowing from within.
Cobwebs of electric golden light thread through the cracks.
Dust motes float in the amber glow.
Bottom half is almost full — time running out.
Warm amber-gold glow corona around the entire hourglass.
Subtle dark smoke or shadow wisps rising from the base.

3D rendered, hyper-realistic glass and metal.
Pure black background. Square 1:1. Centered. Close crop.
    `.trim(),
  },

  // ── ICON: FAMILY CUT OFF ────────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-family.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

Two minimalist human silhouettes made of glowing particles —
left figure: cold blue (#3b82f6), right figure: warm green (#10b981).
Between them: a broken chain link, shattered, pieces floating apart.
From the left figure, glowing coins/tokens are flowing AWAY from the right figure —
the coins stream upward and vanish into darkness.
The two figures reach toward each other but cannot connect.
A jagged electric-red lightning bolt (#ef4444) cuts between them vertically.

Emotional, dramatic composition. Particle effects.
3D quality, deep depth of field. Pure black bg. Square 1:1.
    `.trim(),
  },

  // ── ICON: AUTOMATIC ─────────────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-auto.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

A sleek precision gear/cog made of chrome and blue energy.
The gear teeth glow with electric blue plasma (#3b82f6) at the tips.
Inside the gear: a bold lightning bolt made of pure electric blue-white light.
The bolt is crackling, dynamic, with tiny sparks.
The whole gear rotates slightly (implied by motion blur on edges).
Deep blue-violet glow halo (#8b5cf6) around entire mechanism.
Chrome/steel texture, Sci-Fi industrial aesthetic.

3D render, hyper-detailed. Pure black background. Square 1:1. Centered.
    `.trim(),
  },

  // ── ICON: YOUR KEYS ─────────────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-keys.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

A large ornate skeleton key made of pure hammered gold.
The key head (bow) is styled as a hexagonal crypto coin symbol.
The key blade has blockchain hash marks etched in.
The entire key emits a warm golden aura (#f59e0b) that transitions to electric blue (#3b82f6) at the tip.
Small stars and sparkles orbit the key like a constellation.
The key floats at a slight angle, with dramatic shadow casting below.

Gold and chrome metallic texture, ultra-detailed.
Jeweler-quality render. Pure black background. Square 1:1. Centered.
    `.trim(),
  },

  // ── ICON: NO BUREAUCRACY ────────────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-nolaw.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

Classic scales of justice, but deconstructed and glitching.
The scales are made of dark stone/marble with electric violet energy veins (#8b5cf6).
A massive electric red X (#ef4444) cuts diagonally across the entire scales.
The X is made of jagged plasma energy, burning and crackling.
The scales themselves are crumbling/fragmenting where the X hits them.
Red-orange sparks and embers fly outward.
Dramatic rim lighting on the marble surfaces.

Epic, powerful composition. High contrast. Pure black bg. Square 1:1.
    `.trim(),
  },

  // ── ICON: TRANSPARENT / OPEN ───────────────────────────────────────────
  {
    file: path.join(ICONS_DIR, "icon-open.png"),
    prompt: `
Single icon artwork. Perfect square composition.
Pure black background (#050810).

A glowing shield made of crystalline emerald-green energy (#10b981).
The shield surface is transparent like glass, showing blockchain code lines inside.
On the shield face: a large elegant checkmark made of bright white-green light.
The checkmark radiates outward in a burst of green light rays.
Small orbiting data nodes (tiny spheres) circle the shield.
A green-to-blue gradient glow halo surrounds the entire shield.
The shield has geometric facets like a cut gem.

3D render, premium quality. Pure black background. Square 1:1. Centered.
    `.trim(),
  },

];

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await ensureDir(ASSETS);
  await ensureDir(ICONS_DIR);

  console.log(`\n🍌  WillChain Premium Image Generator — Nano Banana 2`);
  console.log(`   Total: ${images.length} images\n`);

  const results = [];
  for (const img of images) {
    const ok = await generate(img.prompt, img.file);
    results.push({ file: path.basename(img.file), ok });
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n─── Summary ─────────────────────────────");
  results.forEach((r) => console.log(`  ${r.ok ? "✅" : "❌"}  ${r.file}`));
  console.log(`\n  Done: ${results.filter((r) => r.ok).length}/${results.length}\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
