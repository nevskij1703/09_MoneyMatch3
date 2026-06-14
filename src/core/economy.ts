// Экономика MoneyMatch3 — ценность схлопнутых плиток и зачисление в Баланс.
// Pure-функции (кроме commitMove, которая мутирует переданный SaveData).
//
// Модель денег (классический match-3 с каскадами и комбо):
//   ценность плитки t = tierValue(t) × baseTileValue × investmentMultiplier
//   за ход копится baseSum (Σ ценность ВСЕХ схлопнутых плиток) и уровень комбо
//   (число натуральных матч-групп за ход; спецвзрывы не считаются, старт ×1).
//   Итог хода = round(baseSum × комбо-множитель(ФИНАЛЬНЫЙ уровень))   — НЕ аддитивно по шагам:
//   за ×1 и ×2 даётся не 5%+6%, а 6% (бонус финального уровня на всю сумму).
//   комбо-множитель = level≤0 ? 1 : 1 + comboBaseBonus + (level−1)·comboBonusStep  (×1 +5%, ×2 +6%, …)
//   Деньги зачисляются в Баланс ОДИН раз в конце хода (когда поле перестало матчиться).
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

/** Итог хода: накопленная база × множитель ФИНАЛЬНОГО уровня комбо (округлён до целого). */
export function comboTotal(baseSum: number, comboLevel: number): number {
  return Math.round(baseSum * comboMoneyMultiplier(comboLevel));
}

/**
 * Зафиксировать ход в сейве (когда поле перестало матчиться): начислить накопленную
 * сумму с бонусом финального уровня комбо в Баланс. Растит balance/totalCollected,
 * обновляет bestCombo. Возвращает начисление (для анимации полёта в баланс).
 */
export function commitMove(d: SaveData, baseSum: number, comboLevel: number): number {
  const gained = comboTotal(baseSum, comboLevel);
  d.balance += gained;
  d.totalCollected += gained;
  if (comboLevel > d.bestCombo) d.bestCombo = comboLevel;
  return gained;
}
