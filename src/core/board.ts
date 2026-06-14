// Helpers для FieldState: валидация тира, координатные конверсии, генерация поля.
// Pure-функции, без DOM.

import type { FieldState, Tier, SpecialKind } from '../types';
import { balance } from '../config/balance';

export function isValidTier(v: number | null | undefined): v is Tier {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= balance.maxTier;
}

export function idxToXY(i: number, cols: number): { x: number; y: number } {
  return { x: i % cols, y: Math.floor(i / cols) };
}

export function xyToIdx(x: number, y: number, cols: number): number {
  return y * cols + x;
}

/**
 * Гарантирует наличие field.special (параллельный cells массив спецтайлов) и
 * возвращает его. Ленивая инициализация all-null — закрывает старые сейвы без
 * поля special и любые рассинхроны длины.
 */
export function getSpecial(field: FieldState): (SpecialKind | null)[] {
  if (!field.special || field.special.length !== field.cells.length) {
    field.special = field.cells.map(() => null);
  }
  return field.special;
}

/** Создать новое поле cols×rows со случайной раскладкой тиров [minTier..maxTier] (без спецтайлов). */
export function makeBoard(
  cols: number,
  rows: number,
  minTier: Tier,
  maxTier: Tier,
  rng: () => number = Math.random,
): FieldState {
  const cells: (Tier | null)[] = [];
  const special: (SpecialKind | null)[] = [];
  const span = maxTier - minTier + 1;
  for (let i = 0; i < cols * rows; i++) {
    cells.push(minTier + Math.floor(rng() * span));
    special.push(null);
  }
  return { cols, rows, cells, special };
}
