const paletteKey = 'manxiang.palette';
const allowed = new Set(['sky', 'flare']);
export function setupAppearance() {
  let saved;
  try { saved = localStorage.getItem(paletteKey); } catch { /* Themes also work when storage is unavailable. */ }
  function apply(palette, persist = false) {
    const selected = allowed.has(palette) ? palette : 'sky';
    document.documentElement.dataset.palette = selected;
    document.querySelectorAll('[data-palette-option]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.paletteOption === selected)));
    document.querySelector('#palette-label').textContent = selected === 'sky' ? 'SKY EDITION' : 'FLARE EDITION';
    if (persist) { saved = selected; try { localStorage.setItem(paletteKey, selected); } catch { /* Session preference still applies. */ } }
  }
  function shuffle() {
    const values = new Uint32Array(3); crypto.getRandomValues(values);
    const range = (index, min, max) => min + values[index] / 0xffffffff * (max - min);
    const style = document.documentElement.style;
    style.setProperty('--type-tilt', `${range(0, -11, -4).toFixed(1)}deg`);
    style.setProperty('--art-shift', `${range(1, -6, 6).toFixed(1)}px`);
    style.setProperty('--portrait-offset', `${range(2, -4, 4).toFixed(1)}px`);
    document.querySelector('.hero').dataset.variation = values[0] % 2 ? 'alternate' : 'original';
  }
  document.querySelectorAll('[data-palette-option]').forEach(button => button.addEventListener('click', () => apply(button.dataset.paletteOption, true)));
  document.querySelector('#scene-shuffle').addEventListener('click', shuffle);
  apply(saved); shuffle();
  return { configure(theme = {}) {
    apply(allowed.has(saved) ? saved : theme.palette);
    for (const [key, selector] of [['heroSkyImage', '.character-sky'], ['heroFlareImage', '.character-flare']]) {
      if (/^\/assets\/[\w-]+\.(png|jpe?g|webp|avif)$/.test(theme[key] || '')) document.querySelector(selector).src = theme[key];
    }
  } };
}
