import fs from "node:fs";
import zlib from "node:zlib";

// Function to generate a valid PNG file in pure Node.js without native dependencies
function createPng(width, height, drawFn) {
  // RGBA buffer: width * height * 4
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  // PNG filter type 0 (None) prepended to each scanline
  const scanlineLength = width * 4 + 1;
  const filtered = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowStart = y * scanlineLength;
    filtered[rowStart] = 0; // Filter: None
    rgba.copy(filtered, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(filtered);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // CRC32 helper
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);

    const crcBuf = Buffer.alloc(4);
    const toCrc = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(toCrc), 0);

    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: 0 (deflate)
  ihdrData[11] = 0; // Filter: 0
  ihdrData[12] = 0; // Interlace: 0

  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon Drawer: Saban Flow Navy Blue background, Gold accents, Crane truck emblem
function sabanTruckDrawer(maskable = false) {
  return (x, y, w, h) => {
    const nx = x / w;
    const ny = y / h;

    // Background gradient: #0F172A to #1E3A8A
    const bgR = Math.round(15 + (30 - 15) * ny);
    const bgG = Math.round(23 + (58 - 23) * ny);
    const bgB = Math.round(42 + (138 - 42) * ny);

    // Center coordinates (-1 to 1)
    const cx = (nx - 0.5) * 2;
    const cy = (ny - 0.5) * 2;
    const dist = Math.sqrt(cx * cx + cy * cy);

    // In non-maskable, make slightly rounded corners if desired, or full-bleed
    if (!maskable && dist > 1.25) {
      return [0, 0, 0, 0];
    }

    // Outer emblem circle
    if (dist < 0.85 && dist > 0.81) {
      return [234, 179, 8, 255]; // Amber border
    }

    // Saban Truck Cab (x from -0.4 to 0.35, y from 0.05 to 0.4)
    // Cabin (front of truck): x: 0.1 to 0.35, y: 0.12 to 0.36
    if (cx >= 0.1 && cx <= 0.35 && cy >= 0.12 && cy <= 0.36) {
      // Windshield
      if (cx >= 0.18 && cx <= 0.32 && cy >= 0.14 && cy <= 0.23) {
        return [191, 219, 254, 255]; // Light blue glass
      }
      return [37, 99, 235, 255]; // Royal blue cab
    }

    // Truck Flatbed / Cargo: x: -0.38 to 0.08, y: 0.22 to 0.36
    if (cx >= -0.38 && cx <= 0.08 && cy >= 0.22 && cy <= 0.36) {
      return [71, 85, 105, 255]; // Slate cargo bed
    }

    // Big Bag / Bale on bed: x: -0.32 to -0.08, y: 0.02 to 0.22
    if (cx >= -0.32 && cx <= -0.08 && cy >= 0.02 && cy <= 0.22) {
      // Sand bag color: Golden sand
      if (cx >= -0.3 && cx <= -0.1 && cy >= 0.04 && cy <= 0.2) {
        return [245, 158, 11, 255]; // Amber big bag
      }
      return [217, 119, 6, 255];
    }

    // Crane Arm (from x: 0.02 to -0.25, angle up):
    // Crane base at x: 0.05, y: 0.1 to 0.22
    if (cx >= 0.03 && cx <= 0.08 && cy >= 0.08 && cy <= 0.22) {
      return [239, 68, 68, 255]; // Red crane base
    }
    // Arm extending upward to left:
    const armX = cx - 0.05;
    const armY = cy - 0.08;
    // Line: armY = -1.2 * armX (armX < 0, armY < 0)
    if (armX <= 0 && armX >= -0.28 && Math.abs(armY - armX * 0.9) < 0.035) {
      return [239, 68, 68, 255]; // Red crane arm
    }

    // Wheels:
    // Wheel 1 (front): cx around 0.22, cy around 0.38
    const w1Dist = Math.sqrt((cx - 0.22) * (cx - 0.22) + (cy - 0.38) * (cy - 0.38));
    if (w1Dist < 0.08) {
      if (w1Dist < 0.035) return [203, 213, 225, 255]; // Silver hub
      return [15, 23, 42, 255]; // Tire
    }

    // Wheel 2 (rear front): cx around -0.12, cy around 0.38
    const w2Dist = Math.sqrt((cx - -0.12) * (cx - -0.12) + (cy - 0.38) * (cy - 0.38));
    if (w2Dist < 0.08) {
      if (w2Dist < 0.035) return [203, 213, 225, 255];
      return [15, 23, 42, 255];
    }

    // Wheel 3 (rear back): cx around -0.28, cy around 0.38
    const w3Dist = Math.sqrt((cx - -0.28) * (cx - -0.28) + (cy - 0.38) * (cy - 0.38));
    if (w3Dist < 0.08) {
      if (w3Dist < 0.035) return [203, 213, 225, 255];
      return [15, 23, 42, 255];
    }

    // Ground line
    if (cy >= 0.44 && cy <= 0.46 && Math.abs(cx) <= 0.55) {
      return [100, 116, 139, 200];
    }

    // Background
    return [bgR, bgG, bgB, 255];
  };
}

// Generate files
const p192 = createPng(192, 192, sabanTruckDrawer(false));
fs.writeFileSync("public/pwa-192x192.png", p192);

const p512 = createPng(512, 512, sabanTruckDrawer(false));
fs.writeFileSync("public/pwa-512x512.png", p512);
fs.writeFileSync("public/icon-512.png", p512);

const pMask = createPng(512, 512, sabanTruckDrawer(true));
fs.writeFileSync("public/pwa-maskable-512x512.png", pMask);

const appleIcon = createPng(180, 180, sabanTruckDrawer(false));
fs.writeFileSync("public/apple-touch-icon.png", appleIcon);

console.log("Successfully generated PWA PNG icons!");
