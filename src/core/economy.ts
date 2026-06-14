// Экономика MoneyMatch3 — ценность схлопнутых плиток и зачисление в Баланс.
// Pure-функции (кроме addCollected, которая мутирует переданный SaveData).
//
// Модель денег (классический match-3 с каскадами):
//   ценность плитки t = tierValue(t) × baseTileValue × investmentMultiplier
//   ценность шага     = Σ плиток × каскад-множитель(comboIndex)
//   каскад-множитель  = 1 + (comboIndex − 1) × comboStep   (1-й шаг ×1, 2-й ×1.25, …)
// investmentMultiplier поднимают будущие инвестиции (трата Баланса). Старт = 1.

import type { SaveData, Tier } from '../types';
import { balance } from '../config/balance';
import { tierValue } from './money';

/** Ценность одной плитки тира t в деньгах (с учётом множителя инвестиций). */
export function tileCollectValue(t: Tier, investmentMultiplier: number): number {
  return tierValue(t) * balance.match.baseTileValue * investmentMultiplier;
}

/** Каскад-множитель за глубину комбо (1-й шаг = ×1, каждый следующий дороже). */
export function cascadeComboMultiplier(comboIndex: number): number {
  const over = Math.max(0, comboIndex - 1);
  return 1 + over * balance.match.comboStep;
}

/** Полная ценность одного шага каскада (округлена до целого). */
export function clearValue(tiers: Tier[], comboIndex: number, investmentMultiplier: number): number {
  let sum = 0;
  for (const t of tiers) sum += tileCollectValue(t, investmentMultiplier);
  return Math.round(sum * cascadeComboMultiplier(comboIndex));
}

/**
 * Применить схлоп одного шага каскада к сейву: растит balance и totalCollected,
 * обновляет bestCombo. Возвращает начисленную сумму (для попа «+$N»).
 */
export function addCollected(d: SaveData, tiers: Tier[], comboIndex: number): number {
  const gained = clearValue(tiers, comboIndex, d.investmentMultiplier);
  d.balance += gained;
  d.totalCollected += gained;
  if (comboIndex > d.bestCombo) d.bestCombo = comboIndex;
  return gained;
}
