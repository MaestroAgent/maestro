#!/usr/bin/env node
/**
 * Process brand assets: compress, resize, and generate variants
 */
import sharp from 'sharp';
import { optimize } from 'svgo';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const assetsDir = join(rootDir, 'assets', 'brand');

// Ensure directories exist
['icons', 'social', 'hero'].forEach(dir => {
  mkdirSync(join(assetsDir, dir), { recursive: true });
});

async function processEnzoPng() {
  const inputPath = join(rootDir, 'enzo.png');
  console.log('Processing enzo.png...');

  // Read original
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  console.log(`  Original: ${metadata.width}x${metadata.height}`);

  // Generate variants
  const variants = [
    { name: 'enzo-hero.png', width: 600, dir: 'hero' },
    { name: 'enzo-hero@2x.png', width: 1200, dir: 'hero' },
    { name: 'enzo-128.png', width: 128, dir: 'icons' },
    { name: 'enzo-64.png', width: 64, dir: 'icons' },
    { name: 'enzo-32.png', width: 32, dir: 'icons' },
    { name: 'favicon-32.png', width: 32, dir: 'icons' },
    { name: 'favicon-16.png', width: 16, dir: 'icons' },
    { name: 'apple-touch-icon.png', width: 180, dir: 'icons' },
  ];

  for (const variant of variants) {
    const outputPath = join(assetsDir, variant.dir, variant.name);
    await sharp(inputPath)
      .resize(variant.width, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(outputPath);
    console.log(`  Created: ${variant.dir}/${variant.name}`);
  }

  // Create optimized main version
  await sharp(inputPath)
    .resize(800, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(join(assetsDir, 'enzo.png'));
  console.log('  Created: enzo.png (optimized)');
}

async function processSvg() {
  const inputPath = join(rootDir, 'maestro_logo_simple.svg');
  console.log('\nProcessing maestro_logo_simple.svg...');

  const svgContent = readFileSync(inputPath, 'utf-8');
  const originalSize = Buffer.byteLength(svgContent, 'utf-8');
  console.log(`  Original size: ${(originalSize / 1024).toFixed(1)}KB`);

  // Optimize SVG
  const result = optimize(svgContent, {
    multipass: true,
    plugins: [
      'preset-default',
      'removeDimensions',
      { name: 'removeViewBox', active: false },
      'sortAttrs',
      'cleanupIds',
    ],
  });

  const optimizedSize = Buffer.byteLength(result.data, 'utf-8');
  console.log(`  Optimized size: ${(optimizedSize / 1024).toFixed(1)}KB`);
  console.log(`  Reduction: ${((1 - optimizedSize / originalSize) * 100).toFixed(1)}%`);

  writeFileSync(join(assetsDir, 'enzo.svg'), result.data);
  console.log('  Created: enzo.svg');
}

async function createSocialPreview() {
  console.log('\nCreating social preview image...');

  const inputPath = join(rootDir, 'enzo.png');
  const width = 1200;
  const height = 630;

  // Create background with brand color
  const background = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 26, g: 31, b: 54, alpha: 1 }, // #1a1f36
    },
  }).png().toBuffer();

  // Resize Enzo
  const enzo = await sharp(inputPath)
    .resize(350, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Composite
  await sharp(background)
    .composite([
      { input: enzo, gravity: 'west', left: 80, top: 140 },
    ])
    .png({ quality: 90 })
    .toFile(join(assetsDir, 'social', 'og-image.png'));

  console.log('  Created: social/og-image.png (1200x630)');
  console.log('  Note: Add text overlay in design tool or during website build');
}

async function createFavicon() {
  console.log('\nCreating favicon.ico...');

  const inputPath = join(rootDir, 'enzo.png');

  // Create multi-size ICO (we'll use the 32px version as main favicon)
  // Sharp doesn't support ICO directly, so we'll just note this
  console.log('  Note: Use https://favicon.io or similar to create .ico from favicon-32.png');

  // Create 192x192 for PWA
  await sharp(inputPath)
    .resize(192, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(join(assetsDir, 'icons', 'icon-192.png'));
  console.log('  Created: icons/icon-192.png');

  // Create 512x512 for PWA
  await sharp(inputPath)
    .resize(512, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(join(assetsDir, 'icons', 'icon-512.png'));
  console.log('  Created: icons/icon-512.png');
}

async function main() {
  console.log('=== Maestro Brand Assets Processing ===\n');

  await processEnzoPng();
  await processSvg();
  await createSocialPreview();
  await createFavicon();

  console.log('\n=== Done! ===');
  console.log('\nAssets created in:', assetsDir);
}

main().catch(console.error);
