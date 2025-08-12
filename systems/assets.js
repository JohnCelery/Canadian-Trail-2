// systems/assets.js
// Asset loader & placeholder generator.
// - Reads a manifest (already JSON-parsed) with { images: { key: {src, w, h, label?} } }.
// - For each image, tries fetch -> blob -> Image decode.
// - On 404 or error, generates a labeled checkerboard placeholder of the right size.
// - Stores registry entries: { img: HTMLImageElement, meta: {w,h,label,src}, placeholder: boolean }.
// - DPR-aware: canvas is w*h*devicePixelRatio for crispness; CSS pixels remain w/h.

const registry = new Map();

/** Load all images declared in the manifest */
export async function loadAssets(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest');
  }
  const images = manifest.images || {};
  const tasks = Object.entries(images).map(([key, meta]) => loadOneImage(key, meta));
  await Promise.all(tasks);
}

/** Get loaded image by key */
export function getImage(key) {
  return registry.get(key)?.img || null;
}

/** Get meta by key (includes placeholder flag) */
export function getMeta(key) {
  const entry = registry.get(key);
  if (!entry) return null;
  return { ...entry.meta, placeholder: entry.placeholder };
}

async function loadOneImage(key, meta) {
  const norm = normalizeMeta(meta);
  const url = resolveFromSystems(norm.src);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const imgURL = URL.createObjectURL(blob);
    const img = await decodeImage(imgURL);
    registry.set(key, { img, meta: norm, placeholder: false });
    // Revoke after decode to avoid leak
    URL.revokeObjectURL(imgURL);
  } catch {
    const dataURL = generatePlaceholder(norm.label || key, norm.w, norm.h);
    const img = await decodeImage(dataURL);
    registry.set(key, { img, meta: norm, placeholder: true });
  }
}

function normalizeMeta(meta) {
  const w = clampInt(meta?.w, 8, 4096) || 64;
  const h = clampInt(meta?.h, 8, 4096) || 64;
  const src = String(meta?.src || '').trim();
  const label = String(meta?.label || '').trim();
  return { w, h, src, label };
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Resolve a project-relative path from /systems to the file */
function resolveFromSystems(relPath) {
  // Allow plain 'assets/img/...' without leading slash.
  const normalized = relPath.startsWith('./') || relPath.startsWith('../')
    ? relPath
    : `../${relPath}`;
  return new URL(normalized, import.meta.url);
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Image decode failed'));
    img.src = src;
  });
}

/** Generate a checkerboard placeholder as a data URL (DPR aware) */
export function generatePlaceholder(label, w, h) {
  const dpr = Math.max(1, Math.floor(globalThis.devicePixelRatio || 1));
  const cw = Math.max(8, Math.floor(w * dpr));
  const ch = Math.max(8, Math.floor(h * dpr));
  const step = Math.max(4, Math.floor(8 * dpr));

  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');

  // Checkerboard
  const a = '#95a3b8';
  const b = '#c7d0df';
  for (let y = 0; y < ch; y += step) {
    for (let x = 0; x < cw; x += step) {
      const odd = ((x / step) + (y / step)) % 2 === 1;
      ctx.fillStyle = odd ? a : b;
      ctx.fillRect(x, y, step, step);
    }
  }

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, Math.floor(2 * dpr));
  ctx.strokeRect(0.5 * dpr, 0.5 * dpr, cw - dpr, ch - dpr);

  // Label
  const text = String(label || 'Asset').slice(0, 40);
  const pad = 6 * dpr;
  const boxH = Math.min(ch, Math.max(20 * dpr, Math.floor(ch * 0.28)));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, ch - boxH, cw, boxH);

  ctx.fillStyle = '#fff';
  ctx.font = `${Math.floor(Math.max(10 * dpr, boxH * 0.45))}px ui-sans-serif,system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, cw / 2, ch - boxH / 2, cw - pad * 2);

  return c.toDataURL('image/png');
}
