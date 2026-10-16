// Drawn signatures on the field service report (backend migration 039) are
// stored as SVG path data of only "M x y" / "L x y" commands. The <svg> markup
// is built here at render time. Mirrors ADMIN DASH src/utils/signaturePath.js.

const PATH_RE = /^M[ML0-9 ]*$/;

// Inline <svg> for a stored signature, or '' if the data is not a valid
// path. Only path data that matches the strict M/L grammar is ever embedded.
export function signatureSvg({ path_data, width, height } = {}, { maxHeight = 80 } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (typeof path_data !== 'string' || !PATH_RE.test(path_data) || !(w > 0) || !(h > 0)) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet" style="display:block;width:100%;max-height:${maxHeight}px;"><path d="${path_data}" fill="none" stroke="#004898" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
