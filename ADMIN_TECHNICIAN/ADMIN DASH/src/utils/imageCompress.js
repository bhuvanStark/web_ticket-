// Shrinks photos/diagram images in the browser before they are uploaded, so
// project files stay small in the database and quick to open. Also makes the
// small JPEG preview the Files grid shows instead of downloading every image.

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read')); };
  img.src = url;
});

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function draw(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  // JPEG has no transparency: paint white first so transparent PNG diagrams
  // don't turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const isImage = (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);

// Returns { file, fileName, thumbnail, originalSize }. Non-images pass through
// unchanged (no thumbnail). Images are capped at 2400px and re-encoded as
// JPEG unless the original is already smaller (small PNG line drawings stay
// crisp as PNG).
export async function prepareUpload(file) {
  if (!isImage(file)) return { file, fileName: file.name, thumbnail: null, originalSize: file.size };
  const img = await loadImage(file);

  let thumbnail = null;
  const thumbCanvas = draw(img, 360);
  for (const quality of [0.75, 0.6, 0.45]) {
    thumbnail = await toBlob(thumbCanvas, 'image/jpeg', quality);
    if (thumbnail && thumbnail.size <= 60 * 1024) break;
  }
  if (thumbnail && thumbnail.size > 60 * 1024) thumbnail = null;

  const big = Math.max(img.naturalWidth, img.naturalHeight) > 2400;
  const compressed = await toBlob(draw(img, 2400), 'image/jpeg', 0.82);
  if (compressed && (big || compressed.size < file.size * 0.9)) {
    const fileName = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
    return { file: compressed, fileName, thumbnail, originalSize: file.size };
  }
  return { file, fileName: file.name, thumbnail, originalSize: file.size };
}
