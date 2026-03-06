import fs from 'fs/promises';

function writeIndexedBmp({ width, height, indices, palette }, filename) {
  const rowSize = Math.ceil(width / 4) * 4; // rows padded to 4 bytes
  const pixelArraySize = rowSize * height;
  const paletteSize = palette.length * 4;
  const headerSize = 14 + 40 + paletteSize;
  const fileSize = headerSize + pixelArraySize;

  const buffer = Buffer.alloc(fileSize);

  let offset = 0;

  // ===== BITMAP FILE HEADER (14 bytes) =====
  buffer.write('BM', offset);
  offset += 2;
  buffer.writeUInt32LE(fileSize, offset);
  offset += 4;
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt32LE(headerSize, offset);
  offset += 4;

  // ===== DIB HEADER (BITMAPINFOHEADER 40 bytes) =====
  buffer.writeUInt32LE(40, offset);
  offset += 4;
  buffer.writeInt32LE(width, offset);
  offset += 4;
  buffer.writeInt32LE(height, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
  offset += 2; // planes
  buffer.writeUInt16LE(8, offset);
  offset += 2; // 8 bits per pixel
  buffer.writeUInt32LE(0, offset);
  offset += 4; // no compression
  buffer.writeUInt32LE(pixelArraySize, offset);
  offset += 4;
  buffer.writeInt32LE(2835, offset);
  offset += 4; // 72 DPI
  buffer.writeInt32LE(2835, offset);
  offset += 4;
  buffer.writeUInt32LE(palette.length, offset);
  offset += 4;
  buffer.writeUInt32LE(palette.length, offset);
  offset += 4;

  // ===== COLOR TABLE (BGR0 entries) =====
  for (const color of palette) {
    buffer.writeUInt8(color.b, offset++); // B
    buffer.writeUInt8(color.g, offset++); // G
    buffer.writeUInt8(color.r, offset++); // R
    buffer.writeUInt8(0, offset++); // reserved
  }

  // ===== PIXEL DATA (bottom-up!) =====
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * width;
    const bmpRowStart = headerSize + (height - 1 - y) * rowSize;

    for (let x = 0; x < width; x++) {
      buffer[bmpRowStart + x] = indices[rowStart + x];
    }
  }

  return fs.writeFile(filename, buffer);
}

function createIndexedBmpBuffer({ width, height, indices, palette }) {
  const rowSize = Math.ceil(width / 4) * 4; // rows padded to 4 bytes
  const pixelArraySize = rowSize * height;
  const paletteSize = palette.length * 4;
  const headerSize = 14 + 40 + paletteSize;
  const fileSize = headerSize + pixelArraySize;

  const buffer = Buffer.alloc(fileSize);

  let offset = 0;

  // ===== BITMAP FILE HEADER (14 bytes) =====
  buffer.write('BM', offset);
  offset += 2;
  buffer.writeUInt32LE(fileSize, offset);
  offset += 4;
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt32LE(headerSize, offset);
  offset += 4;

  // ===== DIB HEADER (BITMAPINFOHEADER 40 bytes) =====
  buffer.writeUInt32LE(40, offset);
  offset += 4;
  buffer.writeInt32LE(width, offset);
  offset += 4;
  buffer.writeInt32LE(height, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
  offset += 2; // planes
  buffer.writeUInt16LE(8, offset);
  offset += 2; // 8 bits per pixel
  buffer.writeUInt32LE(0, offset);
  offset += 4; // no compression
  buffer.writeUInt32LE(pixelArraySize, offset);
  offset += 4;
  buffer.writeInt32LE(2835, offset);
  offset += 4; // 72 DPI
  buffer.writeInt32LE(2835, offset);
  offset += 4;
  buffer.writeUInt32LE(palette.length, offset);
  offset += 4;
  buffer.writeUInt32LE(palette.length, offset);
  offset += 4;

  // ===== COLOR TABLE (BGR0 entries) =====
  for (const color of palette) {
    buffer.writeUInt8(color.b, offset++); // B
    buffer.writeUInt8(color.g, offset++); // G
    buffer.writeUInt8(color.r, offset++); // R
    buffer.writeUInt8(0, offset++); // reserved
  }

  // ===== PIXEL DATA (bottom-up!) =====
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * width;
    const bmpRowStart = headerSize + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      buffer[bmpRowStart + x] = indices[rowStart + x];
    }
  }

  return buffer;
}

export { writeIndexedBmp, createIndexedBmpBuffer };
