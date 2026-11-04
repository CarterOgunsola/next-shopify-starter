// A dataset's images (dataset.mjs), served by `pnpm dev:synthetic` on the
// port after the site's (serve.mjs) and uploaded by the dev store seeder.
// An image is either a solid-colour placeholder, drawn on request, or a
// file of the dataset's own in e2e/support/datasets/<name>/images (kept
// out of git).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

// Larger than any image a page asks for.
export const MAX_SIDE = 4000;

const TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};
// A dataset's own image file, in its images folder.
export const IMAGE_FILE = /^[\w.-]+\.(png|jpe?g|webp|avif)$/i;
const PLACEHOLDER = /^\/placeholder\/(\d+)x(\d+)\/([0-9a-f]{6})\.png$/;

export const mimeType = (name) =>
  TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

// Where an image entry ({ color, width, height } or { file, width,
// height }) is served, from the image server's root.
export function imagePath(entry) {
  if (entry.file) return `/${encodeURIComponent(entry.file)}`;
  const hex = entry.color.slice(1).toLowerCase();
  return `/placeholder/${entry.width}x${entry.height}/${hex}.png`;
}

// A PNG of one colour (#rrggbb), width by height pixels.
export function solidPng(width, height, color) {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  // Each row starts with its filter type, 0 (none).
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// The bytes and type of an image entry: drawn, or read from folder.
export async function imageBytes(entry, folder) {
  if (entry.color) {
    return {
      type: "image/png",
      body: solidPng(entry.width, entry.height, entry.color),
    };
  }
  return {
    type: mimeType(entry.file),
    body: await readFile(join(folder, entry.file)),
  };
}

// The image server's answer to a path: { status, type?, body? }. Images
// only; anything else is a 404.
export async function imageResponse(pathname, folder) {
  const drawn = PLACEHOLDER.exec(pathname);
  if (drawn) {
    const [width, height] = [Number(drawn[1]), Number(drawn[2])];
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) {
      return { status: 404 };
    }
    return {
      status: 200,
      ...(await imageBytes({ color: `#${drawn[3]}`, width, height })),
    };
  }
  let name;
  try {
    name = decodeURIComponent(pathname.slice(1));
  } catch {
    return { status: 404 };
  }
  if (!folder || !IMAGE_FILE.test(name)) return { status: 404 };
  try {
    return { status: 200, ...(await imageBytes({ file: name }, folder)) };
  } catch {
    return { status: 404 };
  }
}
