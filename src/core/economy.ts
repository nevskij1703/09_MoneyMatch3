// Экономика MoneyMatch3 — ценность схлопнутых плиток и зачисление в Баланс.
// Pure-функции (кроме addCollected, которая мутирует переданный SaveData).
//
// Модель денег (классический match-3 с каскадами и комбо):
//   ценность плитки t = tierValue(t) × baseTileValue × investmentMultiplier
//   ценность шага     = Σ плиток × комбо-множитель(comboLevel)
//   комбо-множитель   = comboLevel≤0 ? 1 : 1 + comboBaseBonus + (comboLevel−1)·comboBonusStep
//                       (Комбо +5%, ×2 +6%, ×3 +7%, …; считаются только натуральные матчи,
//                        взрывы спецтайлов комбо не повышают)
// investmentMultiplier поднимают будущие инвестиции (трата Баланса). Старт = 1.

import type { SaveData, Tier } from '../types';
import { balance } from '../config/balance';
import { tierValue } from './money';

/** Ценность одной плитки тира t в деньгах (с учётом множителя инвестиций). */
export function tileCollectValue(t: Tier, investmentMultiplier: number): number {
  return tierValue(t) * balance.match.baseTileValue * investmentMultiplier;
}

/**
 * Денежный множитель за уровень комбо. comboLevel 0 → ×1 (нет комбо); уровень L≥1 →
 * +comboBaseBonus и затем +comboBonusStep за каждый следующий (Комбо +5%, ×2 +6%, ×3 +7%, …).
 */
export function comboMoneyMultiplier(comboLevel: number): number {
  if (comboLevel <= 0) return 1;
  return 1 + balance.match.comboBaseBonus + (comboLevel - 1) * balance.match.comboBonusStep;
}

/** Полная ценность одного шага каскада с учётом комбо (округлена до целого). */
export function clearValue(tiers: Tier[], comboLevel: number, investmentMultiplier: number): number {
  let sum = 0;
  for (const t of tiers) sum += tileCollectValue(t, investmentMultiplier);
  return Math.round(sum * comboMoneyMultiplier(comboLevel));
}

/**
 * Применить схлоп одного шага каскада к сейву: растит balance и totalCollected,
 * обновляет bestCombo (макс. достигнутый уровень комбо). Возвращает сумму (для попа «+$N»).
 */
export function addCollected(d: SaveData, tiers: Tier[], comboLevel: number): number {
  const gained = clearValue(tiers, comboLevel, d.investmentMultiplier);
  d.balance += gained;
  d.totalCollected += gained;
  if (comboLevel > d.bestCombo) d.bestCombo = comboLevel;
  return gained;
}
