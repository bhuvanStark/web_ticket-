// Drawn signatures as vector strokes (backend migration 039). A signature is
// stored as an SVG path string of only "M x y" / "L x y" commands with integer
// coordinates in canvas space; the <svg> markup is built here at render time.

const PATH_RE = /^M[ML0-9 ]*$/;
const MAX_PATH_LENGTH = 40000;

// strokes: [[{ x, y }, ...], ...] in canvas coordinates. Points closer than
// `minDist` to the previous kept point are dropped; if the result is still
// over the backend's size cap, it is re-simplified with a coarser step.
export function strokesToPath(strokes, width, height, minDist = 1.5) {
  const clamp = (v, max) => Math.min(Math.max(Math.round(v), 0), max);
  let path = '';
  for (const stroke of strokes || []) {
    if (!stroke?.length) continue;
    let last = null;
    let part = '';
    for (const p of stroke) {
      const x = clamp(p.x, width);
      const y = clamp(p.y, height);
      if (!last) {
        part += `M${x} ${y}`;
      } else if (Math.hypot(x - last.x, y - last.y) >= minDist) {
        part += `L${x} ${y}`;
      } else {
        continue;
      }
      last = { x, y };
    }
    // A single tap still shows as a dot (round line cap on a zero-length line).
    if (!part.includes('L')) part += `L${last.x} ${last.y}`;
    path += part;
  }
  if (path.length > MAX_PATH_LENGTH && minDist < 50) {
    return strokesToPath(strokes, width, height, minDist * 2);
  }
  return path;
}

// Inline <svg> for a stored signature, or '' if the data is not a valid
// path. Only path data that matches the strict M/L grammar is ever embedded.
export function signatureSvg({ path_data, width, height } = {}, { maxHeight = 80 } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (typeof path_data !== 'string' || !PATH_RE.test(path_data) || !(w > 0) || !(h > 0)) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet" style="display:block;width:100%;max-height:${maxHeight}px;"><path d="${path_data}" fill="none" stroke="#004898" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
