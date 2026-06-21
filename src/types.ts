// Общие типы домена MoneyMatch3. Игровая логика (core/*) и вью (ui/*) опираются на них.

import type { BoosterId } from './core/boosters';

/** Тип денежного объекта на поле (1..tierCount). Старт — T1..T4 (4 типа). */
export type Tier = number;

/**
 * БУСТЕР на поле — самостоятельный объект (НЕ накладка на плитку): в его клетке
 * cells[i] === null, тип лежит в special[i]. АКТИВИРУЕТСЯ свайпом/тапом/цепью.
 *   'bomb'     — из фигуры T/L (пересечение линий 3+); взрыв 3×3 вокруг себя.
 *   'rocket-h' — из линии в 4 по ГОРИЗОНТАЛИ; сносит весь свой РЯД.
 *   'rocket-v' — из линии в 4 по ВЕРТИКАЛИ; сносит весь свой СТОЛБЕЦ.
 *   'magnet'   — из линии в 5; собирает ВСЕ плитки одного тира (цель — см. core/match3.ts).
 *   'drone'    — из квадрата 2×2; собирает «плюс» вокруг себя, затем «летит» к приоритетной
 *                цели (магнит→бомба→ракета→дрон→алмаз→молния→сейф→плитка) и активирует её.
 */
export type BoosterKind = 'bomb' | 'rocket-h' | 'rocket-v' | 'magnet' | 'drone';

/**
 * СОБИРАЕМЫЙ объект на поле — самостоятельный (cells[i] === null, тип в special[i]). НЕ
 * свапается и НЕ активируется свайпом; срабатывает, когда РЯДОМ что-то схлопнулось ИЛИ по нему
 * прошёл бустер.
 *   'diamond'   — +1 💎 в баланс алмазов (без комбо-множителей), улетает в карту.
 *   'lightning' — +energy в запас энергии (balance.collect.lightningEnergy), без множителей.
 *   'safe'      — ЛУТБОКС: при срабатывании не собирается, а «открывается» — на его месте
 *                 появляется награда (бустер / алмаз / молния; обычных плиток не бывает),
 *                 которая остаётся лежать до выполнения её условия сбора.
 */
export type CollectibleKind = 'diamond' | 'lightning' | 'safe';

/** Любой самостоятельный объект в special[] (бустер или собираемый). */
export type SpecialKind = BoosterKind | CollectibleKind;

/**
 * Состояние поля. cells — row-major, длина = cols*rows; tier либо null (пусто ИЛИ бустер).
 * special — параллельный cells массив той же длины: тип бустера в клетке или null.
 * Инвариант: если special[i] задан — это самостоятельный бустер, и cells[i] === null.
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
   * tierValue(t) × baseTileValue × investmentMultiplier. Старт = 1. На экране — «Income ×N».
   */
  investmentMultiplier: number;
  /** Уровень игрока (HUD «Level»; прокачка — будущее окно). Старт = balance.startLevel. */
  level: number;
  /** Текущая энергия (HUD «Energy N/100»). Тратится за ход, регенится по таймеру. Старт = energy.max. */
  energy: number;
  /** Метка (мс) якоря регена энергии: от неё отсчитывается следующий +regenAmount. */
  energyTs: number;
  /** Инвентарь бустеров — счётчик по id (bomb/drone/rocket/magnet, кнопки внизу). */
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
