#!/usr/bin/env node
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

async function makeTransparent() {
  const inputPath = join(rootDir, 'enzo.png');
  const outputPath = join(rootDir, 'assets/brand/enzo.png');

  console.log('Making logo background transparent...');

  // Read the image and get raw pixel data
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The background is approximately #f5f5f5 (light gray)
  // We'll make pixels close to white/light gray transparent
  const threshold = 240; // Pixels with R, G, B all above this become transparent

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // If pixel is very light (close to white/light gray), make it transparent
    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0; // Set alpha to 0
    }
  }

  // Save with transparency
  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  })
    .png()
    .toFile(outputPath);

  console.log(`Created transparent logo: ${outputPath}`);

  // Also create the hero version
  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  })
    .resize(600, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(rootDir, 'assets/brand/hero/enzo-hero.png'));

  console.log('Created transparent hero image');

  // Create icon versions
  const sizes = [
    { name: 'enzo-64.png', size: 64, dir: 'icons' },
    { name: 'enzo-128.png', size: 128, dir: 'icons' },
  ];

  for (const { name, size, dir } of sizes) {
    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
      .resize(size, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(rootDir, 'assets/brand', dir, name));
    console.log(`Created: ${dir}/${name}`);
  }
}

makeTransparent().catch(console.error);
