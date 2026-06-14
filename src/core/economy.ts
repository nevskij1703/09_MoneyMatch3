// Экономика MoneyMatch3 — ценность сбора цепочек и зачисление в Баланс.
// Pure-функции (кроме addCollected, которая мутирует переданный SaveData).
//
// Модель денег:
//   ценность плитки t = tierValue(t) × baseTileValue × investmentMultiplier
//   ценность цепочки  = Σ плиток × комбо-множитель(длина)
//   комбо-множитель   = 1 + (длина − minChain) × comboStep
// investmentMultiplier поднимают будущие инвестиции (трата Баланса). Старт = 1.

import type { SaveData, Tier } from '../types';
import { balance } from '../config/balance';
import { tierValue } from './money';

/** Ценность одной плитки тира t в деньгах (с учётом множителя инвестиций). */
export function tileCollectValue(t: Tier, investmentMultiplier: number): number {
  return tierValue(t) * balance.match.baseTileValue * investmentMultiplier;
}

/** Комбо-множитель за длину цепочки сверх минимума. */
export function chainComboMultiplier(chainLength: number): number {
  const over = Math.max(0, chainLength - balance.match.minChain);
  return 1 + over * balance.match.comboStep;
}

/** Полная ценность собранной цепочки (округлена до целого). */
export function chainValue(tiers: Tier[], investmentMultiplier: number): number {
  let sum = 0;
  for (const t of tiers) sum += tileCollectValue(t, investmentMultiplier);
  return Math.round(sum * chainComboMultiplier(tiers.length));
}

/**
 * Применить сбор цепочки к сейву: растит balance и totalCollected, обновляет
 * bestChain. Возвращает начисленную сумму (для попа «+$N»).
 */
export function addCollected(d: SaveData, tiers: Tier[]): number {
  const gained = chainValue(tiers, d.investmentMultiplier);
  d.balance += gained;
  d.totalCollected += gained;
  if (tiers.length > d.bestChain) d.bestChain = tiers.length;
  return gained;
}
