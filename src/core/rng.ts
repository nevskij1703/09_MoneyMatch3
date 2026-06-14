// Pure-функции взвешенного случайного выбора (тир спавна, тир клиента — вес в
// пользу низких). rng() — генератор чисел 0..1 (по умолчанию Math.random).
// Детерминированный PRNG для симулятора живёт локально в dev/balanceSim.ts.

/**
 * Геометрический выбор индекса 0..count-1: P(k) ∝ ratio^k (ratio<1 → в пользу
 * низких k). Используется для тира спавна и тира клиента (вес в пользу низких).
 */
export function pickGeometric(count: number, ratio: number, rng: () => number = Math.random): number {
  if (count <= 1) return 0;
  let total = 0;
  let w = 1;
  for (let i = 0; i < count; i++) { total += w; w *= ratio; }
  let r = rng() * total;
  w = 1;
  for (let i = 0; i < count; i++) {
    r -= w;
    if (r <= 0) return i;
    w *= ratio;
  }
  return count - 1;
}

/** Выбор индекса по массиву весов (weights[i] ≥ 0). Возвращает -1 если сумма 0. */
export function pickWeightedIndex(weights: number[], rng: () => number = Math.random): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]!);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
