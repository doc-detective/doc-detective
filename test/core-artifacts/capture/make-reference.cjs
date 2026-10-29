// Write a solid white PNG reference of an exact size, for fixtures that need a
// reference whose dimensions differ from the capture (ADR 01144).
//   node make-reference.cjs <file> [<width>x<height>]
// The size falls back to process.env.REFERENCE_SIZE so a fixture can pass a
// measured size through step `variables` instead of textual substitution.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const [file, size = process.env.REFERENCE_SIZE] = process.argv.slice(2);
const [width, height] = String(size).split("x").map(Number);
if (!file || !(width > 0) || !(height > 0)) {
  console.error(`usage: make-reference.cjs <file> <width>x<height> (got ${size})`);
  process.exit(1);
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8; // bit depth
header[9] = 2; // RGB
// Each row: filter byte 0, then white pixels.
const rows = Buffer.alloc((width * 3 + 1) * height, 255);
for (let y = 0; y < height; y++) rows[y * (width * 3 + 1)] = 0;

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(
  file,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ])
);
