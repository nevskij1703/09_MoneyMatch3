// Общие типы домена MoneyMatch3. Игровая логика (core/*) и вью (ui/*) опираются на них.

import type { BoosterId } from './core/boosters';

/** Тип денежного объекта на поле (1..tierCount). Старт — T1..T4 (4 типа). */
export type Tier = number;

/** Состояние поля. cells — row-major, длина = cols*rows; tier либо null (пусто). */
export interface FieldState {
  cols: number;
  rows: number;
  cells: (Tier | null)[];
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
}

/**
 * Игровые данные внутри SaveState.data. Кор-механика — match-3 (соединение
 * цепочки одинаковых плиток → сбор в Баланс → гравитация и досыпка сверху).
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
  /** Самая длинная собранная цепочка (стат). */
  bestChain: number;
  settings: Settings;
  /** Метка последнего save() (мс). Зарезервировано под будущие фичи (оффлайн/дейлики). */
  lastActiveTs: number;
}

/** Корневой сейв — один ключ localStorage `mmatch_save`. См. docs/SAVES.md. */
export interface SaveState {
  schemaVersion: number;
  data: SaveData;
}
