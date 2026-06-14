// Helpers для FieldState: валидация тира, координатные конверсии, генерация поля.
// Pure-функции, без DOM.

import type { FieldState, Tier } from '../types';
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

/** Создать новое поле cols×rows со случайной раскладкой тиров [minTier..maxTier]. */
export function makeBoard(
  cols: number,
  rows: number,
  minTier: Tier,
  maxTier: Tier,
  rng: () => number = Math.random,
): FieldState {
  const cells: (Tier | null)[] = [];
  const span = maxTier - minTier + 1;
  for (let i = 0; i < cols * rows; i++) {
    cells.push(minTier + Math.floor(rng() * span));
  }
  return { cols, rows, cells };
}
