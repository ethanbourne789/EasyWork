import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, 'src-tauri/icons');

async function createIcons() {
  // 创建 PNG 图标
  const sizes = [32, 128, 256, 512];
  for (const size of sizes) {
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 }
      }
    })
    .png()
    .toFile(path.join(iconsDir, `${size}x${size}.png`));
  }

  // 创建 128x128@2x.png (256x256)
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 59, g: 130, b: 246, alpha: 1 }
    }
  })
  .png()
  .toFile(path.join(iconsDir, '128x128@2x.png'));

  // 创建 icon.png (512x512)
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 59, g: 130, b: 246, alpha: 1 }
    }
  })
  .png()
  .toFile(path.join(iconsDir, 'icon.png'));

  // 创建简单的 .ico 文件（使用 PNG 数据）
  // 实际上 .ico 需要特殊格式，这里先复制 256x256 PNG 作为临时方案
  fs.copyFileSync(
    path.join(iconsDir, '256x256.png'),
    path.join(iconsDir, 'icon.ico')
  );

  // 创建 icon.icns (macOS 图标，复制 PNG 作为临时方案)
  fs.copyFileSync(
    path.join(iconsDir, '512x512.png'),
    path.join(iconsDir, 'icon.icns')
  );

  console.log('✓ All icons created successfully');
}

createIcons().catch(console.error);
