// Логика окна «Build» (прокачка построек локации) — PURE, без DOM и без storage.
// Цены — геометрическая лесенка по всем (building × step) ячейкам: от balance.build.costMin
// (1-й шаг 1-й постройки) до costMax (последний шаг последней постройки). «Равномерно
// распределить» = равные множители между соседними шагами (ровная кривая в лог-масштабе).
//
// Цена округляется до 3 значащих цифр, чтобы списанная сумма ТОЧНО совпадала с тем, что
// показывает formatMoney в карточке (например 1.24M ⇒ списываем ровно 1 240 000).

import { balance } from '../config/balance';

/** Округление до 3 значащих цифр (совпадает с точностью отображения formatMoney). */
function round3sig(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const exp = Math.floor(Math.log10(v));
  const f = Math.pow(10, exp - 2);
  return Math.round(v / f) * f;
}

/** Текущий шаг постройки id из карты сейва (0..upgradesPerBuilding), с защитой от мусора. */
export function buildStep(steps: Record<string, number>, id: string): number {
  const max = balance.build.upgradesPerBuilding;
  const v = steps?.[id];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
  return Math.min(max, Math.floor(v));
}

/**
 * Цена прокачки постройки с индексом b (0-based, по возрастанию цены) с её шага `step`
 * (0-based: 0 = первая прокачка). Геометрическая лесенка costMin→costMax по всем ячейкам.
 * Если step ≥ upgradesPerBuilding (постройка на максимуме) — возвращает 0.
 */
export function buildUpgradeCost(b: number, step: number): number {
  const B = balance.build.buildings.length;
  const S = balance.build.upgradesPerBuilding;
  if (step >= S || b < 0 || b >= B) return 0;
  const cells = B * S;
  const pos = b * S + step;                       // позиция ячейки в общей лесенке
  const t = cells > 1 ? pos / (cells - 1) : 0;    // 0..1
  const { costMin, costMax } = balance.build;
  const raw = costMin * Math.pow(costMax / costMin, t);
  return round3sig(raw);
}

/** Постройка b на максимуме (прокачана upgradesPerBuilding раз)? */
export function isMaxed(steps: Record<string, number>, b: number): boolean {
  const def = balance.build.buildings[b];
  if (!def) return true;
  return buildStep(steps, def.id) >= balance.build.upgradesPerBuilding;
}

/** Можно ли прокачать постройку b: не максимум И хватает денег на следующий шаг. */
export function canUpgrade(money: number, steps: Record<string, number>, b: number): boolean {
  const def = balance.build.buildings[b];
  if (!def) return false;
  const step = buildStep(steps, def.id);
  if (step >= balance.build.upgradesPerBuilding) return false;
  return money >= buildUpgradeCost(b, step);
}

/** Суммарный прогресс построек активной локации: Σ шагов / (построек × шагов), 0..1. */
export function locationProgress(steps: Record<string, number>): number {
  const B = balance.build.buildings.length;
  const S = balance.build.upgradesPerBuilding;
  const total = B * S;
  if (total <= 0) return 0;
  let sum = 0;
  for (let b = 0; b < B; b++) sum += buildStep(steps, balance.build.buildings[b]!.id);
  return Math.max(0, Math.min(1, sum / total));
}
