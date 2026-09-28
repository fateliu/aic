import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Notify, Palette, Theme } from '../types';
const savedPalette = (): Palette | null => {
  try { const value = localStorage.getItem('manxiang.palette'); return value === 'sky' || value === 'flare' ? value : null; } catch { return null; }
};
export const assetPath = (value?: string) => /^\/assets\/[\w-]+\.(png|jpe?g|webp|avif)$/.test(value || '') ? value : undefined;
export function useAppearance(theme: Theme | undefined, notify: Notify) {
  const [palette, setPalette] = useState<Palette>(() => savedPalette() || 'sky');
  const chosen = useRef(savedPalette() !== null);
  const [variation, setVariation] = useState('original');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string>();
  const [opacity, setOpacity] = useState(.28);
  useEffect(() => {
    if (!chosen.current) setPalette(theme?.palette === 'flare' ? 'flare' : 'sky');
    setOpacity(Number.isFinite(theme?.backgroundOpacity) ? Math.min(.65, Math.max(0, theme!.backgroundOpacity!)) : .28);
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.palette = palette; }, [palette]);
  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); }, [backgroundUrl]);
  function selectPalette(value: Palette) {
    chosen.current = true; setPalette(value);
    try { localStorage.setItem('manxiang.palette', value); } catch { /* Works for this session without storage. */ }
  }
  function shuffle() {
    const values = crypto.getRandomValues(new Uint32Array(3));
    const range = (i: number, min: number, max: number) => min + values[i] / 0xffffffff * (max - min);
    document.documentElement.style.setProperty('--type-tilt', range(0, -11, -4).toFixed(1) + 'deg');
    document.documentElement.style.setProperty('--art-shift', range(1, -6, 6).toFixed(1) + 'px');
    document.documentElement.style.setProperty('--portrait-offset', range(2, -4, 4).toFixed(1) + 'px');
    setVariation(values[0] % 2 ? 'alternate' : 'original');
  }
  useEffect(() => { shuffle(); }, []);
  async function chooseBackground(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type) || file.size > 15 * 1024 * 1024) { notify('请选择 15 MB 以内的 PNG、JPG、WebP 或 AVIF 图片。', true); return; }
    const url = URL.createObjectURL(file), image = new Image(); image.src = url;
    try { await image.decode(); setBackgroundUrl(url); notify('已应用本机背景预览，图片没有上传；刷新后恢复默认。'); }
    catch { URL.revokeObjectURL(url); notify('这张图片无法读取，请选择其他图片。', true); }
  }
  function resetBackground() {
    setBackgroundUrl(undefined);
    setOpacity(Number.isFinite(theme?.backgroundOpacity) ? Math.min(.65, Math.max(0, theme!.backgroundOpacity!)) : .28);
  }
  const background = backgroundUrl || assetPath(theme?.backgroundImage);
  const backgroundStyle: CSSProperties = { backgroundImage: background ? 'url("' + background + '")' : 'none', backgroundPosition: ['top', 'bottom'].includes(theme?.backgroundPosition || '') ? theme?.backgroundPosition : 'center', opacity };
  return { palette, selectPalette, variation, shuffle, dialogOpen, setDialogOpen, opacity, setOpacity, chooseBackground, resetBackground, backgroundStyle,
    skyImage: assetPath(theme?.heroSkyImage) || '/assets/hero-sky.png', flareImage: assetPath(theme?.heroFlareImage) || '/assets/hero-flare.png' };
}
export type Appearance = ReturnType<typeof useAppearance>;
