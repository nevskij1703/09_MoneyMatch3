// Кор-логика классического match-3: pure-функции над FieldState.
//
// Механика: игрок свайпом меняет местами две ОРТОГОНАЛЬНО соседние плитки. Если
// после обмена образовалась линия 3+ (верт./гориз.) или квадрат 2×2 — поле
// разрешается каскадами: матчи схлопываются (деньги в Баланс), спецматчи рождают
// спецтайлы (квадрат 2×2 → bomb, линия из 5 → color), сработавшие спецтайлы сносят
// область/тир (цепная реакция), затем гравитация уплотняет столбцы и досыпает новые
// плитки — и так пока есть матчи. Свап без матча откатывается (если ни одна из двух
// плиток не спецтайл; спецтайл можно «применить» всегда).
//
// Здесь — только расчёт/мутация поля. Ввод (pointer, анимации) — в ui/dom/boardView.ts.
// Ценность сбора (деньги) — в core/economy.ts.

import type { FieldState, Tier, SpecialKind } from '../types';
import { balance } from '../config/balance';
import { idxToXY, xyToIdx, isValidTier, getSpecial } from './board';

// ─── Базовые операции ────────────────────────────────────────────────────────

/** Ортогонально ли смежны клетки a и b (свап разрешён только между такими). */
export function areOrthoNeighbors(a: number, b: number, cols: number): boolean {
  const A = idxToXY(a, cols);
  const B = idxToXY(b, cols);
  return Math.abs(A.x - B.x) + Math.abs(A.y - B.y) === 1;
}

/** Поменять местами две клетки (cells + special). Mutates field. */
export function swapCells(field: FieldState, a: number, b: number): void {
  const sp = getSpecial(field);
  const tc = field.cells[a]; field.cells[a] = field.cells[b]; field.cells[b] = tc;
  const ts = sp[a]; sp[a] = sp[b]; sp[b] = ts;
}

// ─── Поиск матчей ──────────────────────────────────────────────────────────────

/** Спавн спецтайла на anchor-клетке матч-группы. */
export interface MatchSpawn { idx: number; kind: SpecialKind; tier: Tier; }
/** Результат поиска матчей: какие клетки схлопнуть + где родить спецтайлы. */
export interface MatchResult { cleared: Set<number>; spawns: MatchSpawn[]; }

/**
 * Найти все матчи на поле: линии ≥ minLine (верт./гориз.) и квадраты 2×2 одного тира.
 * Линии ≥ colorLineLen рождают `color`, квадраты 2×2 — `bomb`. `moved` (если задан) —
 * клетки последнего свапа: anchor спавна выбирается среди них (спецтайл рождается там,
 * где играл игрок), иначе — в середине линии / низ-лево квадрата.
 */
export function findMatches(field: FieldState, moved?: Iterable<number>): MatchResult {
  const { cols, rows } = field;
  const cells = field.cells;
  const cleared = new Set<number>();
  const spawnMap = new Map<number, MatchSpawn>();
  const movedSet = new Set<number>(moved ?? []);
  const { minLine, colorLineLen } = balance.match;

  // color > bomb при совпадении anchor.
  const addSpawn = (idx: number, kind: SpecialKind, tier: Tier): void => {
    const ex = spawnMap.get(idx);
    if (ex && (ex.kind === 'color' || kind !== 'color')) return;
    spawnMap.set(idx, { idx, kind, tier });
  };
  const pickAnchor = (group: number[]): number => {
    for (const i of group) if (movedSet.has(i)) return i;
    return group[Math.floor(group.length / 2)];
  };

  // Горизонтальные линии.
  for (let y = 0; y < rows; y++) {
    let run = 1;
    for (let x = 1; x <= cols; x++) {
      const prev = cells[xyToIdx(x - 1, y, cols)];
      const cur = x < cols ? cells[xyToIdx(x, y, cols)] : null;
      if (x < cols && isValidTier(cur) && cur === prev) { run++; continue; }
      if (isValidTier(prev) && run >= minLine) {
        const group: number[] = [];
        for (let k = x - run; k < x; k++) { const i = xyToIdx(k, y, cols); cleared.add(i); group.push(i); }
        if (run >= colorLineLen) addSpawn(pickAnchor(group), 'color', prev);
      }
      run = 1;
    }
  }
  // Вертикальные линии.
  for (let x = 0; x < cols; x++) {
    let run = 1;
    for (let y = 1; y <= rows; y++) {
      const prev = cells[xyToIdx(x, y - 1, cols)];
      const cur = y < rows ? cells[xyToIdx(x, y, cols)] : null;
      if (y < rows && isValidTier(cur) && cur === prev) { run++; continue; }
      if (isValidTier(prev) && run >= minLine) {
        const group: number[] = [];
        for (let k = y - run; k < y; k++) { const i = xyToIdx(x, k, cols); cleared.add(i); group.push(i); }
        if (run >= colorLineLen) addSpawn(pickAnchor(group), 'color', prev);
      }
      run = 1;
    }
  }
  // Квадраты 2×2 одного тира.
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const i00 = xyToIdx(x, y, cols);
      const t = cells[i00];
      if (!isValidTier(t)) continue;
      const i10 = xyToIdx(x + 1, y, cols);
      const i01 = xyToIdx(x, y + 1, cols);
      const i11 = xyToIdx(x + 1, y + 1, cols);
      if (cells[i10] === t && cells[i01] === t && cells[i11] === t) {
        const group = [i00, i10, i01, i11];
        for (const i of group) cleared.add(i);
        addSpawn(pickAnchor(group), 'bomb', t);
      }
    }
  }
  return { cleared, spawns: [...spawnMap.values()] };
}

/** Есть ли на поле хоть один матч (линия ≥ minLine или квадрат 2×2). */
export function hasMatchAny(field: FieldState): boolean {
  return findMatches(field).cleared.size > 0;
}

// ─── Спецтайлы ─────────────────────────────────────────────────────────────────

/**
 * Клетки, которые сносит спецтайл в `idx` (включая саму клетку):
 *   bomb  — область (2·bombRadius+1)² вокруг (3×3 при radius=1);
 *   color — все клетки тира `targetTier` (по умолчанию — тир самого спецтайла).
 * Если в клетке нет спецтайла — пустое множество.
 */
export function activateSpecial(field: FieldState, idx: number, targetTier?: Tier | null): Set<number> {
  const sp = getSpecial(field);
  const kind = sp[idx];
  const out = new Set<number>();
  if (!kind) return out;
  out.add(idx);
  const { cols, rows } = field;
  if (kind === 'bomb') {
    const { x, y } = idxToXY(idx, cols);
    const r = balance.match.bombRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.add(xyToIdx(nx, ny, cols));
      }
    }
  } else {
    const tt = targetTier ?? field.cells[idx];
    if (isValidTier(tt)) {
      for (let i = 0; i < field.cells.length; i++) if (field.cells[i] === tt) out.add(i);
    }
  }
  return out;
}

/**
 * Цепная реакция: пока в clearedSet есть клетки со спецтайлом — добавляем их зону
 * поражения (и новые задетые спецтайлы тоже срабатывают). Mutates clearedSet.
 */
export function expandClearWithSpecials(field: FieldState, clearedSet: Set<number>): void {
  const sp = getSpecial(field);
  const stack: number[] = [];
  for (const i of clearedSet) if (sp[i]) stack.push(i);
  const fired = new Set<number>(stack);
  while (stack.length) {
    const i = stack.pop() as number;
    for (const t of activateSpecial(field, i)) {
      const isNew = !clearedSet.has(t);
      clearedSet.add(t);
      if (isNew && sp[t] && !fired.has(t)) { fired.add(t); stack.push(t); }
    }
  }
}

// ─── Гравитация и досыпка ──────────────────────────────────────────────────────

export interface GravityResult {
  /** Существующие плитки, сдвинувшиеся вниз: { from: старый idx, to: новый idx }. */
  falls: { from: number; to: number }[];
  /** Новые плитки, досыпанные сверху: { idx, tier }. */
  spawns: { idx: number; tier: Tier }[];
}

/**
 * Гравитация по столбцам + досыпка сверху. Существующие плитки (и их спецтайлы)
 * уплотняются вниз, сверху добавляются новые случайные тиры [1..tierCount] (без
 * спецтайлов). Mutates field. Возвращает перемещения и спавны для анимаций.
 */
export function applyGravityAndRefill(field: FieldState, tierCount: number, rng: () => number = Math.random): GravityResult {
  const falls: { from: number; to: number }[] = [];
  const spawns: { idx: number; tier: Tier }[] = [];
  const { cols, rows } = field;
  const sp = getSpecial(field);
  for (let x = 0; x < cols; x++) {
    let writeY = rows - 1; // следующий свободный слот снизу
    for (let y = rows - 1; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      const v = field.cells[idx];
      if (!isValidTier(v)) continue;
      const toIdx = xyToIdx(x, writeY, cols);
      if (toIdx !== idx) {
        field.cells[toIdx] = v;
        sp[toIdx] = sp[idx];
        field.cells[idx] = null;
        sp[idx] = null;
        falls.push({ from: idx, to: toIdx });
      }
      writeY--;
    }
    // Оставшиеся сверху слоты (writeY..0) — новые плитки без спецтайлов.
    for (let y = writeY; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      const tier = 1 + Math.floor(rng() * tierCount);
      field.cells[idx] = tier;
      sp[idx] = null;
      spawns.push({ idx, tier });
    }
  }
  return { falls, spawns };
}

// ─── Разрешение поля (каскад) ──────────────────────────────────────────────────

/** Дельта одного шага каскада для анимации в boardView. */
export interface CascadeStep {
  /** Обнулённые клетки (pop). */
  cleared: number[];
  /** Тиры обнулённых клеток — для начисления денег. */
  clearedTiers: Tier[];
  /** Anchor-клетки, ставшие спецтайлами (морфинг существующей плитки). */
  spawns: MatchSpawn[];
  /** Перемещения уцелевших плиток вниз. */
  falls: { from: number; to: number }[];
  /** Новые плитки сверху. */
  refills: { idx: number; tier: Tier }[];
  /** Число различных натуральных матч-групп в этом шаге (для комбо; спецвзрывы не считаются). */
  groups: number;
}

/**
 * Число различных матч-групп в наборе клеток — связные компоненты по 4-смежности
 * с ОДИНАКОВЫМ тиром. Две линии разных тиров (даже смежные) = 2 группы; L/+ одного
 * тира = 1 группа. Считается ДО обнуления (поле ещё содержит тиры).
 */
export function countMatchGroups(field: FieldState, cleared: Set<number>): number {
  const { cols, rows } = field;
  const seen = new Set<number>();
  let groups = 0;
  for (const start of cleared) {
    if (seen.has(start)) continue;
    const tier = field.cells[start];
    groups++;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop() as number;
      const { x, y } = idxToXY(i, cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = xyToIdx(nx, ny, cols);
        if (!seen.has(ni) && cleared.has(ni) && field.cells[ni] === tier) {
          seen.add(ni);
          stack.push(ni);
        }
      }
    }
  }
  return groups;
}

/**
 * Применить готовый clear-set + спавны: цепная реакция спецтайлов, обнуление клеток,
 * установка спецтайлов на anchor-клетки, гравитация + досыпка. Mutates field и
 * clearedSet. Возвращает дельту для анимации.
 */
export function applyClear(
  field: FieldState,
  clearedSet: Set<number>,
  spawns: MatchSpawn[],
  tierCount: number,
  rng: () => number = Math.random,
): CascadeStep {
  expandClearWithSpecials(field, clearedSet);
  const sp = getSpecial(field);
  // Anchor-клетки переживают схлоп — на их месте вырастет спецтайл.
  for (const s of spawns) clearedSet.delete(s.idx);

  const cleared: number[] = [];
  const clearedTiers: Tier[] = [];
  for (const i of clearedSet) {
    const t = field.cells[i];
    if (isValidTier(t)) clearedTiers.push(t);
    field.cells[i] = null;
    sp[i] = null;
    cleared.push(i);
  }
  for (const s of spawns) { field.cells[s.idx] = s.tier; sp[s.idx] = s.kind; }

  const g = applyGravityAndRefill(field, tierCount, rng);
  return { cleared, clearedTiers, spawns, falls: g.falls, refills: g.spawns, groups: 0 };
}

/**
 * Один шаг каскада по матчам поля: найти матчи → применить. Возвращает дельту или
 * null, если матчей нет (каскад окончен). `moved` — клетки свапа для anchor спавна
 * (актуально для первого шага).
 */
export function resolveStep(
  field: FieldState,
  tierCount: number,
  rng: () => number = Math.random,
  moved?: Iterable<number>,
): CascadeStep | null {
  const m = findMatches(field, moved);
  if (m.cleared.size === 0 && m.spawns.length === 0) return null;
  const groups = countMatchGroups(field, m.cleared); // считаем ДО обнуления и спец-расширения
  const step = applyClear(field, m.cleared, m.spawns, tierCount, rng);
  step.groups = groups;
  return step;
}

// ─── Валидность хода / дедлок ───────────────────────────────────────────────────

/** Даст ли свап a↔b матч? Спецтайл «применяется» всегда. Поле не меняется (откат). */
export function wouldSwapMatch(field: FieldState, a: number, b: number): boolean {
  const sp = getSpecial(field);
  if (sp[a] || sp[b]) return true;
  swapCells(field, a, b);
  const has = hasMatchAny(field);
  swapCells(field, a, b);
  return has;
}

/** Есть ли хоть один доступный ход (валидный свап или спецтайл на поле). */
export function hasAnyValidMove(field: FieldState): boolean {
  const { cols, rows } = field;
  const sp = getSpecial(field);
  for (let i = 0; i < sp.length; i++) if (sp[i]) return true;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = xyToIdx(x, y, cols);
      if (x < cols - 1 && wouldSwapMatch(field, i, xyToIdx(x + 1, y, cols))) return true;
      if (y < rows - 1 && wouldSwapMatch(field, i, xyToIdx(x, y + 1, cols))) return true;
    }
  }
  return false;
}

// ─── Генерация стартового поля ──────────────────────────────────────────────────

/** Поле cols×rows без стартовых линий-3 и квадратов 2×2 (заполнение с банами соседей). */
function makeCleanBoard(cols: number, rows: number, tierCount: number, rng: () => number): FieldState {
  const cells: (Tier | null)[] = new Array(cols * rows).fill(null);
  const at = (x: number, y: number): Tier | null => cells[xyToIdx(x, y, cols)];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const banned = new Set<number>();
      if (x >= 2 && at(x - 1, y) === at(x - 2, y)) banned.add(at(x - 1, y) as number);
      if (y >= 2 && at(x, y - 1) === at(x, y - 2)) banned.add(at(x, y - 1) as number);
      if (x >= 1 && y >= 1 && at(x - 1, y) === at(x, y - 1) && at(x - 1, y) === at(x - 1, y - 1)) {
        banned.add(at(x - 1, y) as number);
      }
      let t: number;
      do { t = 1 + Math.floor(rng() * tierCount); } while (banned.has(t) && banned.size < tierCount);
      cells[xyToIdx(x, y, cols)] = t;
    }
  }
  return { cols, rows, cells, special: cells.map(() => null) };
}

/**
 * Стартовое поле cols×rows: без готовых матчей и с гарантией хотя бы одного хода
 * (иначе перегенерируем). Имя сохранено — импортируется в core/storage.ts.
 */
export function makeMatch3Board(cols: number, rows: number, tierCount: number, rng: () => number = Math.random): FieldState {
  let field = makeCleanBoard(cols, rows, tierCount, rng);
  for (let tries = 0; tries < 100 && !hasAnyValidMove(field); tries++) {
    field = makeCleanBoard(cols, rows, tierCount, rng);
  }
  return field;
}
