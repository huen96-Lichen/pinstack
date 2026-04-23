export function removeBackgroundByCornersRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  threshold = 32
): Uint8Array {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error('Invalid RGBA bitmap input');
  }

  const corners = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + (width - 1)) * 4
  ];
  const avgR = Math.round((rgba[corners[0]] + rgba[corners[1]] + rgba[corners[2]] + rgba[corners[3]]) / 4);
  const avgG = Math.round((rgba[corners[0] + 1] + rgba[corners[1] + 1] + rgba[corners[2] + 1] + rgba[corners[3] + 1]) / 4);
  const avgB = Math.round((rgba[corners[0] + 2] + rgba[corners[1] + 2] + rgba[corners[2] + 2] + rgba[corners[3] + 2]) / 4);

  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const dr = out[i] - avgR;
    const dg = out[i + 1] - avgG;
    const db = out[i + 2] - avgB;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance <= threshold) {
      out[i + 3] = 0;
    }
  }

  return out;
}

