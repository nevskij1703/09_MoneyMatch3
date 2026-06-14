// Кор-логика match-3 (вариант «соединение цепочки»): pure-функции над FieldState.
//
// Механика: игрок проводит пальцем по цепочке СОСЕДНИХ одинаковых плиток (длина
// ≥ minChain) — на отпускании они собираются в Баланс. Затем гравитация: плитки
// над пустотами падают вниз, сверху досыпаются новые БЕСПЛАТНО (тех же тиров).
//
// Здесь — только расчёт/мутация поля. Ввод (pointer, подсветка, анимации) — в
// ui/dom/boardView.ts. Ценность сбора (деньги) — в core/economy.ts.

import type { FieldState, Tier } from '../types';
import { balance } from '../config/balance';
import { idxToXY, xyToIdx, isValidTier, makeBoard } from './board';

/** Индексы смежных клеток (ортогонально; при diagonal — +4 диагонали). */
export function neighbors(idx: number, field: FieldState, diagonal: boolean): number[] {
  const { x, y } = idxToXY(idx, field.cols);
  const dirs = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const out: number[] = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx!;
    const ny = y + dy!;
    if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) continue;
    out.push(xyToIdx(nx, ny, field.cols));
  }
  return out;
}

/** Смежны ли две клетки (по правилу diagonal). */
export function isAdjacent(a: number, b: number, field: FieldState, diagonal: boolean): boolean {
  return neighbors(a, field, diagonal).includes(b);
}

/**
 * Можно ли добавить клетку `idx` в конец цепочки: та же плитка (тир цепочки),
 * смежна с хвостом, ещё не в цепочке. Пустой chain → любая валидная плитка.
 */
export function canExtendChain(chain: number[], idx: number, field: FieldState, diagonal: boolean): boolean {
  const v = field.cells[idx];
  if (!isValidTier(v)) return false;
  if (chain.length === 0) return true;
  if (chain.includes(idx)) return false;
  const tier = field.cells[chain[0]!];
  if (tier !== v) return false;
  return isAdjacent(chain[chain.length - 1]!, idx, field, diagonal);
}

/** Собрать цепочку: вернуть собранные тиры (по порядку) и обнулить эти клетки. */
export function collectChain(field: FieldState, chain: number[]): Tier[] {
  const tiers: Tier[] = [];
  for (const idx of chain) {
    const t = field.cells[idx];
    if (isValidTier(t)) tiers.push(t);
    field.cells[idx] = null;
  }
  return tiers;
}

export interface GravityResult {
  /** Существующие плитки, сдвинувшиеся вниз: { from: старый idx, to: новый idx }. */
  falls: { from: number; to: number }[];
  /** Новые плитки, досыпанные сверху: { idx, tier }. */
  spawns: { idx: number; tier: Tier }[];
}

/**
 * Гравитация по столбцам + досыпка сверху. Для каждого столбца: существующие
 * плитки уплотняются вниз (сохраняя порядок), сверху добавляются новые случайные
 * тиры [1..tierCount]. Mutates field. Возвращает перемещения и спавны для анимаций.
 */
export function applyGravityAndRefill(field: FieldState, tierCount: number, rng: () => number = Math.random): GravityResult {
  const falls: { from: number; to: number }[] = [];
  const spawns: { idx: number; tier: Tier }[] = [];
  const { cols, rows } = field;
  for (let x = 0; x < cols; x++) {
    let writeY = rows - 1; // следующий свободный слот снизу
    for (let y = rows - 1; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      const v = field.cells[idx];
      if (!isValidTier(v)) continue;
      const toIdx = xyToIdx(x, writeY, cols);
      if (toIdx !== idx) {
        field.cells[toIdx] = v;
        field.cells[idx] = null;
        falls.push({ from: idx, to: toIdx });
      }
      writeY--;
    }
    // Оставшиеся сверху слоты (writeY..0) — новые плитки.
    for (let y = writeY; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      const tier = 1 + Math.floor(rng() * tierCount);
      field.cells[idx] = tier;
      spawns.push({ idx, tier });
    }
  }
  return { falls, spawns };
}

/**
 * Есть ли на поле хоть одна связная группа одинаковых плиток размера ≥ minChain
 * (т.е. возможный ход). BFS по компонентам. Для авто-перемешивания при дедлоке.
 */
export function hasAnyChain(field: FieldState, minChain: number, diagonal: boolean): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < field.cells.length; i++) {
    const t = field.cells[i];
    if (!isValidTier(t) || seen.has(i)) continue;
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const nb of neighbors(cur, field, diagonal)) {
        if (!seen.has(nb) && field.cells[nb] === t) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (size >= minChain) return true;
  }
  return false;
}

/**
 * Стартовое поле cols×rows тирами [1..tierCount] с гарантией хотя бы одного хода
 * (иначе перегенерируем). Начальные пары допустимы — они не «схлопываются» сами,
 * это просто доступные ходы (механика инициируется игроком).
 */
export function makeMatch3Board(cols: number, rows: number, tierCount: number, rng: () => number = Math.random): FieldState {
  let field = makeBoard(cols, rows, 1, tierCount, rng);
  for (let tries = 0; tries < 50 && !hasAnyChain(field, balance.match.minChain, balance.match.diagonal); tries++) {
    field = makeBoard(cols, rows, 1, tierCount, rng);
  }
  return field;
}
