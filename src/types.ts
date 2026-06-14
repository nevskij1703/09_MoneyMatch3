// Общие типы домена MoneyMatch3. Игровая логика (core/*) и вью (ui/*) опираются на них.

import type { BoosterId } from './core/boosters';

/** Тип денежного объекта на поле (1..tierCount). Старт — T1..T4 (4 типа). */
export type Tier = number;

/**
 * Спецтайл-бустер на поле (классический match-3):
 *   'bomb'  — рождается из квадрата 2×2; при срабатывании сносит область 3×3 вокруг себя.
 *   'color' — рождается из линии в 5; при срабатывании сносит ВСЕ плитки одного тира.
 */
export type SpecialKind = 'bomb' | 'color';

/**
 * Состояние поля. cells — row-major, длина = cols*rows; tier либо null (пусто).
 * special — параллельный cells массив той же длины: тип спецтайла в клетке или null.
 * Опционален для обратной совместимости со старыми сейвами (тогда трактуется как all-null).
 */
export interface FieldState {
  cols: number;
  rows: number;
  cells: (Tier | null)[];
  special?: (SpecialKind | null)[];
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
}

/**
 * Игровые данные внутри SaveState.data. Кор-механика — классический match-3
 * (свайп-обмен двух соседних плиток → авто-схлоп линий 3+ и квадратов 2×2 →
 * спецтайлы за 2×2/линию-5 → каскадная гравитация и досыпка сверху).
 */
export interface SaveData {
  /** Баланс — главная валюта, собранные деньги. Растёт при сборе цепочек. */
  balance: number;
  /** Премиум-валюта 💎 (на будущие цены бустеров). */
  diamonds: number;
  /** Поле cols×rows с плитками тиров 1..tierCount. */
  board: FieldState;
  /**
   * Множитель ценности сбора (будущие инвестиции его поднимают). Сбор плитки =
   * tierValue(t) × baseTileValue × investmentMultiplier. Старт = 1.
   */
  investmentMultiplier: number;
  /** Инвентарь бустеров — счётчик по id (4 типа-заглушки). */
  boosters: Record<BoosterId, number>;
  /** Всего собрано за всё время (стат + хук будущей прогрессии). */
  totalCollected: number;
  /** Самая глубокая каскад-комбинация за всё время (стат). */
  bestCombo: number;
  settings: Settings;
  /** Метка последнего save() (мс). Зарезервировано под будущие фичи (оффлайн/дейлики). */
  lastActiveTs: number;
}

/** Корневой сейв — один ключ localStorage `mmatch_save`. См. docs/SAVES.md. */
export interface SaveState {
  schemaVersion: number;
  data: SaveData;
}
