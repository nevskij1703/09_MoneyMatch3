// Сейв в одном ключе localStorage `mmatch_save`: load/save/getState/update/reset.
// При load() читает schemaVersion, прогоняет миграции каскадно, мёрджит с дефолтами.
// См. docs/SAVES.md.

import type { SaveState, SaveData, FieldState } from '../types';
import type { BoosterId } from './boosters';
import { getCurrentSchemaVersion, runMigrations } from './migrations';
import { balance } from '../config/balance';
import { makeMatch3Board } from './match3';

const STORAGE_KEY = 'mmatch_save';

export function defaultBoosters(): Record<BoosterId, number> {
  const out: Record<string, number> = {};
  for (const d of balance.boosters.definitions) {
    out[d.id] = d.starterCount;
  }
  return out as Record<BoosterId, number>;
}

export function DEFAULT_DATA(): SaveData {
  return {
    balance: balance.economy.startBalance,
    diamonds: balance.economy.startDiamonds,
    board: makeMatch3Board(balance.board.cols, balance.board.rows, balance.tierCount),
    investmentMultiplier: balance.economy.investmentMultiplier,
    boosters: defaultBoosters(),
    totalCollected: 0,
    bestChain: 0,
    settings: { sound: true, vibration: true },
    lastActiveTs: 0,
  };
}

export function DEFAULT_STATE(): SaveState {
  return {
    schemaVersion: getCurrentSchemaVersion(),
    data: DEFAULT_DATA(),
  };
}

let cached: SaveState | null = null;

function readRaw(): any | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSchemaVersion(payload: any): number {
  return typeof payload?.schemaVersion === 'number' ? payload.schemaVersion : 0;
}

function persist(): void {
  if (!cached) return;
  cached.data.lastActiveTs = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    /* quota/private mode — игнорируем, работаем из памяти */
  }
}

function isValidBoard(b: any): b is FieldState {
  return (
    b && typeof b === 'object' &&
    typeof b.cols === 'number' && typeof b.rows === 'number' &&
    Array.isArray(b.cells) && b.cells.length === b.cols * b.rows
  );
}

function mergeBoosters(incoming: any): Record<BoosterId, number> {
  const out = defaultBoosters();
  if (incoming && typeof incoming === 'object') {
    for (const d of balance.boosters.definitions) {
      const v = incoming[d.id];
      if (typeof v === 'number' && v >= 0) out[d.id] = Math.floor(v);
    }
  }
  return out;
}

function num(v: any, def: number, min = 0): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : def;
}

/**
 * Защитный мёрдж с дефолтами при загрузке. Собираем data поле за полем по
 * дефолтам и валидации каждой ветки (НЕ spread) — deprecated-поля старых сейвов
 * не утекают. Поле берём из сейва только при совпадении форм-фактора.
 */
function mergeDefaults(state: any): SaveState {
  const d0 = DEFAULT_STATE();
  const incoming = (state && typeof state.data === 'object' && state.data !== null) ? state.data : {};

  const incomingBoard = isValidBoard(incoming.board) ? incoming.board : null;
  const board = (incomingBoard && incomingBoard.cols === balance.board.cols && incomingBoard.rows === balance.board.rows)
    ? incomingBoard : d0.data.board;

  const data: SaveData = {
    balance: num(incoming.balance, d0.data.balance),
    diamonds: Math.floor(num(incoming.diamonds, d0.data.diamonds)),
    board,
    investmentMultiplier: num(incoming.investmentMultiplier, d0.data.investmentMultiplier, 0.0001),
    boosters: mergeBoosters(incoming.boosters),
    totalCollected: num(incoming.totalCollected, 0),
    bestChain: Math.floor(num(incoming.bestChain, 0)),
    settings: { ...d0.data.settings, ...(incoming?.settings ?? {}) },
    lastActiveTs: num(incoming.lastActiveTs, 0),
  };
  return { schemaVersion: getCurrentSchemaVersion(), data };
}

export function load(): SaveState {
  if (cached) return cached;

  const parsed = readRaw();
  const target = getCurrentSchemaVersion();

  if (!parsed) {
    cached = DEFAULT_STATE();
    persist();
    return cached;
  }

  const from = readSchemaVersion(parsed);
  let state: any = parsed;

  if (from > target) {
    // Сейв из будущей версии (откат приложения) — бэкапим и стартуем с дефолта.
    try {
      localStorage.setItem(`${STORAGE_KEY}_backup_v${from}`, JSON.stringify(parsed));
    } catch { /* ignore */ }
    state = DEFAULT_STATE();
  } else if (from < target) {
    const res = runMigrations(parsed, from);
    state = res.state;
    state.schemaVersion = res.schemaVersion;
  }

  cached = mergeDefaults(state);
  persist();
  return cached;
}

export function getState(): SaveState {
  return cached ?? load();
}

export function getData(): SaveData {
  return getState().data;
}

export function save(): void {
  persist();
}

/** Мутируем data и сразу персистим. Возвращает актуальный data. */
export function update(mutator: (d: SaveData) => void): SaveData {
  const s = getState();
  mutator(s.data);
  persist();
  return s.data;
}

export function reset(): SaveState {
  cached = DEFAULT_STATE();
  persist();
  return cached;
}
