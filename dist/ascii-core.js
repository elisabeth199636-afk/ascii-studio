(function (root) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const luminance = (r, g, b) => (r * .2126 + g * .7152 + b * .0722) / 255;

  // Analyse the source once, independently of the current character grid.
  // Alpha-weighted percentiles keep transparent pixels and isolated noise out.
  function analyseTones(pixels) {
    const histogram = new Float64Array(256);
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      if (alpha < .05) continue;
      histogram[Math.round(luminance(pixels[i], pixels[i + 1], pixels[i + 2]) * 255)] += alpha;
      total += alpha;
    }
    if (!total) return { low: 0, high: 1 };
    const percentile = target => {
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += histogram[i];
        if (sum >= total * target) return i / 255;
      }
      return 1;
    };
    const low = percentile(.005), high = percentile(.995);
    // Do not amplify sensor noise or invent a shape in an almost-flat image.
    return high - low >= 8 / 255 ? { low, high } : { low: 0, high: 1 };
  }

  function mapCell(rgba, settings, tones, chars) {
    const alpha = rgba[3] / 255;
    if (alpha < .02) return ' ';
    let tone = clamp((luminance(rgba[0], rgba[1], rgba[2]) - tones.low) / (tones.high - tones.low));
    tone = clamp((tone - .5) * settings.contrast / 100 + .5 + settings.brightness / 100);
    let strength = settings.lightBackground ? 1 - tone : tone;
    if (settings.invert) strength = 1 - strength;
    strength *= alpha;
    if (strength < settings.threshold / 100) return ' ';
    return chars[Math.min(chars.length - 1, Math.floor(strength * (chars.length - .0001)))];
  }

  // Resolution belongs to the image, not to the number of characters.
  // A denser grid must produce smaller glyphs at every preview magnification.
  function outputGeometry(imageWidth, imageHeight, cols, rows, size) {
    const aspect = imageHeight / imageWidth;
    const width = Math.max(1, Math.round(Math.min(1800, 2400 / aspect)));
    const height = Math.max(1, Math.round(Math.min(2400, 1800 * aspect)));
    const cellW = width / cols, cellH = height / rows;
    return { width, height, cellW, cellH, fontSize: Math.min(cellH, cellW / .6) * size / 100 };
  }
  const api = { analyseTones, mapCell, outputGeometry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AsciiCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
