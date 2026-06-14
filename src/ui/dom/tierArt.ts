// Tier-визуал: PNG-арт T1..T28 из Figma-сета «maney-icon» (public/assets/tiers/).
// Каждый арт позиционируется в своём квадратном боксе по инсетам из макета
// (вариант «Property 1=N» компонента 219:132) — пропорции и смещения 1-в-1.
// Для T>28 — fallback: цветной круг + номер (цвет из getTierStyle).

import type { Tier } from '../../types';
import { getTierStyle } from '../../core/money';
import { el, hexColor } from './dom';

/** Максимальный тир, для которого есть готовый арт в public/assets/tiers/. */
export const MAX_TIER_WITH_ART = 28;

/**
 * Инсеты арта внутри иконного бокса, % [top, right, bottom, left] — из
 * Figma-вариантов maney-icon. Сохраняют пропорции исходного PNG и его
 * положение в клетке (например стопки монет ниже центра, сейфы — крупнее).
 */
const TIER_INSETS: Record<number, [number, number, number, number]> = {
  1: [11.72, 12.11, 12.11, 12.11],
  2: [21.09, 4.69, 20.7, 5.08],
  3: [8.2, 17.19, 8.2, 17.19],
  4: [11.72, 12.5, 12.11, 12.5],
  5: [18.75, 1.69, 19.14, 3.78],
  6: [8.98, 16.8, 8.98, 16.41],
  7: [8.98, 11.33, 9.38, 10.94],
  8: [21.88, 10.29, 21.88, 3.39],
  9: [7.42, 19.79, 7.81, 13.02],
  10: [13.67, 3.13, 14.06, 2.73],
  11: [7.03, 7.81, 7.03, 7.81],
  12: [10.94, 4.3, 11.33, 4.3],
  13: [4.69, 5.47, 5.08, 5.47],
  14: [3.13, 9.38, 3.13, 9.38],
  15: [10.55, 10.55, 10.94, 10.55],
  16: [9.77, 10.55, 10.16, 10.16],
  17: [14.45, 21.48, 14.84, 21.09],
  18: [17.58, 14.84, 17.58, 14.45],
  19: [15.63, 7.03, 16.02, 6.64],
  20: [18.36, 2.73, 18.36, 2.73],
  21: [19.14, 4.3, 19.14, 3.91],
  22: [16.02, 11.33, 16.41, 10.94],
  23: [10.55, 7.03, 10.55, 7.03],
  24: [5.86, 7.81, 5.86, 7.42],
  25: [5.08, 17.19, 5.08, 0],
  26: [5.08, 15.23, 5.08, 14.84],
  27: [4.69, 14.45, 4.69, 14.45],
  28: [5.47, 8.59, 5.47, 8.2],
};

/** Есть ли арт-спрайт для тира. */
export function hasTierArt(tier: number): boolean {
  return Number.isFinite(tier) && tier >= 1 && tier <= MAX_TIER_WITH_ART;
}

/** Путь к арт-спрайту тира. base:'./' → относительный путь работает в WebView/APK. */
export function tierArtUrl(tier: number): string {
  return `assets/tiers/T${tier}.png`;
}

/**
 * Иконка тира размером sizePx×sizePx: <img> с инсетами макета (object-fit:
 * contain внутри инсет-бокса), либо круг + цифра для T>28. numFontPx —
 * размер цифры fallback'а (по умолчанию ≈ 0.36×size).
 */
export function makeTierIcon(tier: Tier, sizePx: number, numFontPx?: number): HTMLDivElement {
  const wrap = el('div', { cls: 'tier', style: `width:${sizePx}px;height:${sizePx}px;` });
  if (hasTierArt(tier)) {
    const [t, r, b, l] = TIER_INSETS[tier] ?? [8, 8, 8, 8];
    const img = el('img', {
      cls: 'tier-art',
      style: `left:${l}%;top:${t}%;width:${100 - l - r}%;height:${100 - t - b}%;`,
    }) as HTMLImageElement;
    img.src = tierArtUrl(tier);
    img.alt = `T${tier}`;
    img.draggable = false;
    wrap.appendChild(img);
  } else {
    const style = getTierStyle(tier);
    const circle = el('div', {
      cls: 'tier-circle',
      style: `background:${hexColor(style.tint)};`,
      parent: wrap,
    });
    const str = String(tier);
    const lenScale = str.length <= 2 ? 1 : str.length === 3 ? 0.78 : 0.65;
    const base = numFontPx ?? Math.max(9, Math.floor(sizePx * 0.36));
    el('div', {
      cls: 'tier-num',
      text: str,
      style: `font-size:${Math.floor(base * lenScale)}px;`,
      parent: circle,
    });
  }
  return wrap;
}
