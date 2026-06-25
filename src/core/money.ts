// Денежные утилы: ценность тира, форматирование, цвет/имя.
// Pure-функции, без зависимостей от SaveData. Используются UI-модулями и core.
//
// Ценность тира — ЛИНЕЙНАЯ: tierValue(t) = t (T1=$1, T2=$2, T3=$3, …). Классический match-3 без
// мерджа, поэтому ни степеней двойки, ни era-множителей нет. Итог сбора плитки считает
// core/economy.ts: tileCollectValue = tierValue(t) × baseTileValue × investmentMultiplier.

import type { Tier } from '../types';
import { balance } from '../config/balance';

/**
 * Ценность тира — ЛИНЕЙНАЯ, равна номеру тира: T1=1, T2=2, T3=3, … (каждая собранная плитка тира t
 * даёт t денег при baseTileValue=1). Без мердж-арифметики (степеней двойки) — это классический match-3.
 */
export function tierValue(t: Tier): number {
  if (!Number.isFinite(t) || t < 1) return 0;
  return Math.floor(t);
}

// Суффиксы тысячных порядков: '' K M B T, далее idle-нотация Qa..Vg (до ~1e63).
const MONEY_SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UD', 'DD', 'TD', 'QaD', 'QiD', 'SxD', 'SpD', 'OcD', 'NoD', 'Vg',
];

/**
 * Формат денег с суффиксами K/M/B/T и далее idle-нотацией (Qa, Qi, …, Vg).
 * За пределами таблицы (~1e63) — научная запись. До 10 — 2 знака (2.12M),
 * до 100 — 1 знак, дальше целое (как в Figma-макете «2.12M»).
 */
export function formatMoney(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  const neg = v < 0;
  let abs = Math.abs(v);
  if (abs < 1000) return (neg ? '-' : '') + Math.floor(abs).toString();
  let i = 0;
  while (abs >= 1000 && i < MONEY_SUFFIXES.length - 1) {
    abs /= 1000;
    i++;
  }
  if (abs >= 1000) return (neg ? '-' : '') + v.toExponential(2);
  const digits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
  return (neg ? '-' : '') + abs.toFixed(digits) + MONEY_SUFFIXES[i];
}

/**
 * Полное число БЕЗ сокращений (все знаки), группировка неразрывными пробелами: «2 450 000».
 * Для главного Баланса / комбо / полёта денег (UI сам уменьшает шрифт, если не влезает).
 */
export function formatMoneyFull(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
}

/**
 * То же что formatMoney, но для мелких сумм показывает дробную часть с центами:
 *   $0..$99    → 2 знака после запятой ($0.05, $99.99)
 *   $100..$999 → 1 знак ($123.5)
 *   $1K+       → как formatMoney (суффиксы K/M/B/T)
 * Используется для дохода в секунду, где значения часто < $1.
 */
export function formatMoneyPrecise(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  const abs = Math.abs(v);
  if (abs < 100) return v.toFixed(2);
  if (abs < 1000) return v.toFixed(1);
  return formatMoney(v);
}

/** Доход за секунду — формат с центами для мелких значений («$0.05/сек», «$1.2K/сек»). */
export function formatIncomePerSec(incomePerSec: number): string {
  return `${formatMoneyPrecise(incomePerSec)}/сек`;
}

export interface TierStyle {
  name: string;
  /** Hex-цвет (0xRRGGBB). */
  tint: number;
}

/** HSL → 0xRRGGBB. h: 0..360, s/l: 0..1. */
function hslToHex(hDeg: number, s: number, l: number): number {
  const h = ((hDeg % 360) + 360) % 360 / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

/**
 * Имя + цвет тира. Для T в пределах namedTiers (1..9) берём из balance.
 * Для T > namedTiers.length — генерируем по золотому углу 137.5° (даёт
 * хорошее визуальное разнообразие).
 */
export function getTierStyle(t: Tier): TierStyle {
  const named = balance.namedTiers;
  if (t >= 1 && t <= named.length) {
    return { name: named[t - 1]!.name, tint: named[t - 1]!.tint };
  }
  const hue = ((t - 1) * 137.5) % 360;
  const sat = 0.55 + ((t % 3) * 0.12);
  const light = 0.5 + ((t % 5) * 0.06);
  return { name: `T${t}`, tint: hslToHex(hue, sat, light) };
}
