// Tier-визуал: PNG-арт фишек из public/assets/tiers/ (T1..MAX). Арт — квадратные 128×128, нарисованные
// «в край» бокса, поэтому рендерим его НА ВСЮ клетку (object-fit:contain, без инсетов — 128×128 ровно
// ложится в квадрат ячейки). Для тира без арта (T>MAX_TIER_WITH_ART) — fallback: цветной круг + номер.

import type { Tier } from '../../types';
import { getTierStyle } from '../../core/money';
import { el, hexColor } from './dom';

/** Максимальный тир, для которого есть готовый арт в public/assets/tiers/ (сейчас T1..T6). */
export const MAX_TIER_WITH_ART = 6;

/** Есть ли арт-спрайт для тира. */
export function hasTierArt(tier: number): boolean {
  return Number.isFinite(tier) && tier >= 1 && tier <= MAX_TIER_WITH_ART;
}

/** Путь к арт-спрайту тира (имена из Figma-экспорта «Property 1=T<N>.png»; пробел → %20 через encodeURI). */
export function tierArtUrl(tier: number): string {
  return encodeURI(`assets/tiers/Property 1=T${tier}.png`);
}

/**
 * Иконка тира размером sizePx×sizePx: <img> арта НА ВЕСЬ бокс (128×128 ровно вписывается в клетку),
 * либо круг + цифра для тира без арта. numFontPx — размер цифры fallback'а (по умолч. ≈ 0.36×size).
 */
export function makeTierIcon(tier: Tier, sizePx: number, numFontPx?: number): HTMLDivElement {
  const wrap = el('div', { cls: 'tier', style: `width:${sizePx}px;height:${sizePx}px;` });
  if (hasTierArt(tier)) {
    const img = el('img', { cls: 'tier-art', parent: wrap }) as HTMLImageElement;
    img.src = tierArtUrl(tier);
    img.alt = `T${tier}`;
    img.draggable = false;
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
