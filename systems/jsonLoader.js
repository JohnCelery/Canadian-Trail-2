// systems/jsonLoader.js
// - Required pattern: fetch(new URL(path, import.meta.url))
// - Paths you pass to loadJSON() must be relative to THIS file's location.
//   Example from anywhere: loadJSON('../data/manifest.json')
// - Includes a friendly error banner overlay.

export async function loadJSON(path) {
  const url = new URL(path, import.meta.url);
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (err) {
    throw new Error(`Network error while fetching ${path}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
}

/** Show an error banner at the bottom of the screen */
export function showInitError(err) {
  const msg = typeof err === 'string' ? err : (err?.message || 'Unknown error');
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <div>⚠️ <strong>Initialization problem</strong></div>
    <small>${escapeHTML(msg)}</small>
    <small class="mono">Check the browser console for details.</small>
  `;
  document.body.appendChild(banner);
}

function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
