// Кор-логика классического match-3: pure-функции над FieldState.
//
// Механика: игрок свайпом меняет местами две ОРТОГОНАЛЬНО соседние плитки. Если
// после обмена образовалась линия 3+ (верт./гориз.) или квадрат 2×2 — поле
// разрешается каскадами: матчи схлопываются (деньги в Баланс), спецматчи рождают
// БУСТЕРЫ (самостоятельные объекты, cells[i]=null):
//   • фигура T/L (пересечение линий 3+ по верт. и гориз.) → 💣 Бомба (взрыв 3×3);
//   • линия из 4 → 🚀 Ракета (h/v по ориентации линии; сносит весь ряд/столбец);
//   • квадрат 2×2 → 🛸 Дрон (плюс вокруг себя + полёт к приоритетной цели);
//   • линия из 5 → 🧲 Магнит (собирает весь тир).
// Затем гравитация уплотняет столбцы и досыпает новые плитки — пока есть матчи.
// Свап без матча откатывается (если ни одна из двух клеток не бустер). Бустер
// активируется свайпом с любым объектом (матч не нужен), либо цепной реакцией
// (попал под взрыв бомбы / пролёт ракеты / зону магнита).
//
// Здесь — только расчёт/мутация поля. Ввод (pointer, анимации) — в ui/dom/boardView.ts.
// Ценность сбора (деньги) — в core/economy.ts.

import type { FieldState, Tier, SpecialKind, BoosterKind, CollectibleKind } from '../types';
import { balance } from '../config/balance';
import { idxToXY, xyToIdx, isValidTier, getSpecial, isBooster, isCollectible } from './board';

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

/** Занята ли клетка (плитка ИЛИ бустер) — для гравитации и генерации. */
function isOccupied(field: FieldState, idx: number, sp: (SpecialKind | null)[]): boolean {
  return isValidTier(field.cells[idx]) || !!sp[idx];
}

// ─── Поиск матчей ──────────────────────────────────────────────────────────────

/** Спавн бустера на anchor-клетке матч-группы. tier — тир породившей группы (инфо). */
export interface MatchSpawn { idx: number; kind: SpecialKind; tier: Tier; }
/** Результат поиска матчей: какие клетки схлопнуть + где родить бустеры. */
export interface MatchResult { cleared: Set<number>; spawns: MatchSpawn[]; }

/**
 * Найти все матчи на поле: линии ≥ minLine (верт./гориз.) и квадраты 2×2 одного тира.
 * Клетки группируются (4-смежность, один тир) → СЛОЖНЫЙ матч рождает ОДИН бустер на anchor
 * по приоритету формы: линия ≥ colorLineLen → 🧲 magnet; пересечение линий 3+ (T/L/+) → 💣 bomb;
 * прямая линия ≥ rocketLineLen (4) → 🚀 rocket (h/v по ориентации линии); квадрат 2×2 → 🛸 drone.
 * Прямая линия 3 без пересечения/квадрата — обычный схлоп без бустера. `moved` (клетки свапа) —
 * anchor выбирается среди них.
 */
export function findMatches(
  field: FieldState,
  moved?: Iterable<number>,
  rng: () => number = Math.random,
): MatchResult {
  const { cols, rows } = field;
  const cells = field.cells;
  const N = cols * rows;
  const cleared = new Set<number>();
  const movedSet = new Set<number>(moved ?? []);
  const { minLine, rocketLineLen, colorLineLen } = balance.match;

  // Длина линии-матча через клетку (0 — не в линии ≥ minLine) + признак квадрата.
  const hLen = new Array<number>(N).fill(0);
  const vLen = new Array<number>(N).fill(0);
  const inSquare = new Set<number>();

  // Горизонтальные линии.
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const t = cells[xyToIdx(x, y, cols)];
      if (!isValidTier(t)) { x++; continue; }
      let x2 = x + 1;
      while (x2 < cols && cells[xyToIdx(x2, y, cols)] === t) x2++;
      const len = x2 - x;
      if (len >= minLine) for (let k = x; k < x2; k++) { const i = xyToIdx(k, y, cols); cleared.add(i); hLen[i] = len; }
      x = x2;
    }
  }
  // Вертикальные линии.
  for (let x = 0; x < cols; x++) {
    let y = 0;
    while (y < rows) {
      const t = cells[xyToIdx(x, y, cols)];
      if (!isValidTier(t)) { y++; continue; }
      let y2 = y + 1;
      while (y2 < rows && cells[xyToIdx(x, y2, cols)] === t) y2++;
      const len = y2 - y;
      if (len >= minLine) for (let k = y; k < y2; k++) { const i = xyToIdx(x, k, cols); cleared.add(i); vLen[i] = len; }
      y = y2;
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
        for (const i of [i00, i10, i01, i11]) { cleared.add(i); inSquare.add(i); }
      }
    }
  }

  // Группировка схлопнутых клеток (связные компоненты, один тир) → 1 бустер на сложную группу.
  const spawns: MatchSpawn[] = [];
  const seen = new Set<number>();
  for (const start of cleared) {
    if (seen.has(start)) continue;
    const tier = cells[start] as Tier;
    const group: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop() as number;
      group.push(i);
      const { x, y } = idxToXY(i, cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = xyToIdx(nx, ny, cols);
        if (!seen.has(ni) && cleared.has(ni) && cells[ni] === tier) { seen.add(ni); stack.push(ni); }
      }
    }
    // Форма группы → приоритет бустера.
    let maxLine = 0;
    let intersection = -1; // клетка с линиями 3+ И по верт. И по гориз. (T/L/+)
    let square = -1;
    for (const i of group) {
      const ml = Math.max(hLen[i], vLen[i]);
      if (ml > maxLine) maxLine = ml;
      if (intersection < 0 && hLen[i] >= minLine && vLen[i] >= minLine) intersection = i;
      if (square < 0 && inSquare.has(i)) square = i;
    }
    const pickMoved = (pred: (i: number) => boolean, fallback: number): number => {
      for (const i of group) if (movedSet.has(i) && pred(i)) return i;
      return fallback;
    };
    if (maxLine >= colorLineLen) {
      const onLong = group.filter((i) => hLen[i] >= colorLineLen || vLen[i] >= colorLineLen);
      const fallback = onLong.length ? onLong[Math.floor(onLong.length / 2)] : group[0];
      spawns.push({ idx: pickMoved((i) => hLen[i] >= colorLineLen || vLen[i] >= colorLineLen, fallback), kind: 'magnet', tier });
    } else if (intersection >= 0) {
      spawns.push({ idx: pickMoved((i) => hLen[i] >= minLine && vLen[i] >= minLine, intersection), kind: 'bomb', tier });
    } else if (maxLine >= rocketLineLen) {
      // Прямая линия из rocketLineLen (4) без пересечения → ракета ВДОЛЬ линии
      // (гориз. линия → rocket-h: сносит ряд; верт. → rocket-v: сносит столбец).
      const horiz = group.some((i) => hLen[i] >= rocketLineLen);
      const onLong = group.filter((i) => (horiz ? hLen[i] : vLen[i]) >= rocketLineLen);
      const fallback = onLong.length ? onLong[Math.floor(onLong.length / 2)] : group[0];
      spawns.push({ idx: pickMoved((i) => (horiz ? hLen[i] : vLen[i]) >= rocketLineLen, fallback), kind: horiz ? 'rocket-h' : 'rocket-v', tier });
    } else if (square >= 0) {
      spawns.push({ idx: pickMoved((i) => inSquare.has(i), square), kind: 'drone', tier });
    }
    // иначе — прямая линия 3: обычный схлоп без бустера.
  }
  return { cleared, spawns };
}

/** Есть ли на поле хоть один матч (линия ≥ minLine или квадрат 2×2). */
export function hasMatchAny(field: FieldState): boolean {
  return findMatches(field).cleared.size > 0;
}

// ─── Бустеры (зона поражения и цели) ─────────────────────────────────────────────

/**
 * Клетки, которые сносит бустер в `idx` (включая саму клетку):
 *   bomb     — область (2·bombRadius+1)² вокруг (3×3 при radius=1);
 *   rocket-h — весь ряд y; rocket-v — весь столбец x;
 *   magnet   — все клетки тира `targetTier` (его обязан выбрать вызывающий: тир соседа
 *              по свайпу или случайный ближайший — magnet «цвета» не имеет);
 *   drone    — «плюс» вокруг себя (центр + 4 стороны) + клетка-цель полёта (см. droneTargets;
 *              если цель — бустер, его подхватит цепная реакция в expandClearWithSpecials).
 * Если в клетке нет бустера — пустое множество. `rng` нужен дрону (выбор цели полёта).
 */
export function boosterTargets(field: FieldState, idx: number, targetTier?: Tier | null, rng: () => number = Math.random): Set<number> {
  const sp = getSpecial(field);
  const kind = sp[idx];
  const out = new Set<number>();
  if (!kind) return out;
  out.add(idx);
  const { cols, rows } = field;
  const { x, y } = idxToXY(idx, cols);
  if (kind === 'bomb') {
    const r = balance.match.bombRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.add(xyToIdx(nx, ny, cols));
      }
    }
  } else if (kind === 'rocket-h') {
    for (let nx = 0; nx < cols; nx++) out.add(xyToIdx(nx, y, cols));
  } else if (kind === 'rocket-v') {
    for (let ny = 0; ny < rows; ny++) out.add(xyToIdx(x, ny, cols));
  } else if (kind === 'drone') {
    for (const c of droneTargets(field, idx, rng).cells) out.add(c);
  } else { // magnet
    if (isValidTier(targetTier)) {
      for (let i = 0; i < field.cells.length; i++) if (field.cells[i] === targetTier) out.add(i);
    }
  }
  return out;
}

/**
 * Тир случайной БЛИЖАЙШЕЙ к idx плитки (не бустера, не пустой). Для магнита,
 * активированного цепной реакцией (взрыв/ракета/другой магнит), у которого нет
 * явной цели-соседа. null — если плиток на поле нет.
 */
export function pickNearestTileTier(field: FieldState, idx: number, rng: () => number = Math.random): Tier | null {
  const sp = getSpecial(field);
  const { cols } = field;
  const { x: ox, y: oy } = idxToXY(idx, cols);
  let best = Infinity;
  const bucket: Tier[] = [];
  for (let i = 0; i < field.cells.length; i++) {
    const t = field.cells[i];
    if (i === idx || sp[i] || !isValidTier(t)) continue;
    const { x, y } = idxToXY(i, cols);
    const d = Math.abs(x - ox) + Math.abs(y - oy);
    if (d < best) { best = d; bucket.length = 0; bucket.push(t); }
    else if (d === best) bucket.push(t);
  }
  if (!bucket.length) return null;
  return bucket[Math.floor(rng() * bucket.length)];
}

// ─── Дрон (плюс + полёт к цели) ──────────────────────────────────────────────────

/** «Плюс» вокруг idx: центр + 4 ортогональных соседа (в пределах поля). */
export function cellsInPlus(field: FieldState, idx: number): Set<number> {
  const { cols, rows } = field;
  const { x, y } = idxToXY(idx, cols);
  const out = new Set<number>([idx]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.add(xyToIdx(nx, ny, cols));
  }
  return out;
}

/**
 * Куда «летит» дрон: ПРЕИМУЩЕСТВЕННО в обычную клетку-деньги (случайную), НЕ в бустеры и НЕ в
 * собираемые. Бустеры/собираемые — лишь ФОЛБЭК (по приоритету 🧲→💣→🚀→🛸→💎→⚡→🎁), когда обычных
 * плиток на поле не осталось. `exclude` — клетки, которые нельзя выбирать. null — поле пусто.
 */
export function pickDroneFlightTarget(
  field: FieldState,
  selfIdx: number,
  rng: () => number = Math.random,
  exclude?: Iterable<number>,
): number | null {
  const sp = getSpecial(field);
  const skip = new Set<number>(exclude ?? []);
  skip.add(selfIdx);
  // Основная цель — обычные плитки-деньги (не спецобъекты).
  const money: number[] = [];
  for (let i = 0; i < field.cells.length; i++) {
    if (!skip.has(i) && !sp[i] && isValidTier(field.cells[i])) money.push(i);
  }
  if (money.length) return money[Math.floor(rng() * money.length)];
  // Фолбэк (обычных плиток нет): бустеры/собираемые по приоритету.
  const priority: SpecialKind[][] = [
    ['magnet'], ['bomb'], ['rocket-h', 'rocket-v'], ['drone'], ['diamond'], ['lightning'], ['safe'],
  ];
  for (const kinds of priority) {
    const cand: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const k = sp[i];
      if (!skip.has(i) && k && kinds.indexOf(k) >= 0) cand.push(i);
    }
    if (cand.length) return cand[Math.floor(rng() * cand.length)];
  }
  return null;
}

/** Зона дрона: «плюс» (центр + 4 стороны) + клетка-цель полёта. flightTarget=null → поле пусто. */
export function droneTargets(
  field: FieldState,
  idx: number,
  rng: () => number = Math.random,
  exclude?: Iterable<number>,
): { cells: Set<number>; flightTarget: number | null } {
  const cells = cellsInPlus(field, idx);
  const flightTarget = pickDroneFlightTarget(field, idx, rng, exclude);
  if (flightTarget != null) cells.add(flightTarget);
  return { cells, flightTarget };
}

// ─── Геометрия зон (для комбо-эффектов бустеров) ─────────────────────────────────

/** Квадрат (2r+1)² вокруг idx (bomb+bomb r=2 → 5×5). */
export function cellsInSquare(field: FieldState, idx: number, r: number): Set<number> {
  const { cols, rows } = field;
  const { x, y } = idxToXY(idx, cols);
  const out = new Set<number>();
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.add(xyToIdx(nx, ny, cols));
  }
  return out;
}

/** (2r+1) рядов вокруг idx.y целиком (r=0 → 1 ряд, r=1 → 3 ряда). */
export function cellsInRows(field: FieldState, idx: number, r: number): Set<number> {
  const { cols, rows } = field;
  const { y } = idxToXY(idx, cols);
  const out = new Set<number>();
  for (let dy = -r; dy <= r; dy++) { const ny = y + dy; if (ny >= 0 && ny < rows) for (let x = 0; x < cols; x++) out.add(xyToIdx(x, ny, cols)); }
  return out;
}

/** (2r+1) столбцов вокруг idx.x целиком. */
export function cellsInCols(field: FieldState, idx: number, r: number): Set<number> {
  const { cols, rows } = field;
  const { x } = idxToXY(idx, cols);
  const out = new Set<number>();
  for (let dx = -r; dx <= r; dx++) { const nx = x + dx; if (nx >= 0 && nx < cols) for (let y = 0; y < rows; y++) out.add(xyToIdx(nx, y, cols)); }
  return out;
}

/** Случайный тир, присутствующий на поле (для магнит-комбо). null — если плиток нет. */
export function pickRandomPresentTier(field: FieldState, rng: () => number = Math.random): Tier | null {
  const sp = getSpecial(field);
  const present: Tier[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < field.cells.length; i++) {
    const t = field.cells[i];
    if (sp[i] || !isValidTier(t) || seen.has(t)) continue;
    seen.add(t); present.push(t);
  }
  if (!present.length) return null;
  return present[Math.floor(rng() * present.length)];
}

/**
 * Цепная реакция: пока в clearedSet есть НЕсработавшие БУСТЕРЫ — добавляем их зону
 * поражения (новые задетые бустеры тоже срабатывают). Магниты в цепи бьют по
 * случайному ближайшему тиру. Собираемые (алмаз/молния/сейф), попавшие в зону, в цепь
 * НЕ вступают (не детонируют) — их сбор/открытие делает resolveCollectibles в applyClear.
 * `preFired` — бустеры, уже сработавшие с явной целью (свайп) — их не перезапускаем. Mutates clearedSet.
 */
export function expandClearWithSpecials(
  field: FieldState,
  clearedSet: Set<number>,
  rng: () => number = Math.random,
  preFired?: Iterable<number>,
): void {
  const sp = getSpecial(field);
  const fired = new Set<number>(preFired ?? []);
  const stack: number[] = [];
  for (const i of clearedSet) if (isBooster(sp[i]) && !fired.has(i)) { fired.add(i); stack.push(i); }
  while (stack.length) {
    const i = stack.pop() as number;
    const target = sp[i] === 'magnet' ? pickNearestTileTier(field, i, rng) : null;
    for (const t of boosterTargets(field, i, target, rng)) {
      clearedSet.add(t);
      if (isBooster(sp[t]) && !fired.has(t)) { fired.add(t); stack.push(t); }
    }
  }
}

// ─── Гравитация и досыпка ──────────────────────────────────────────────────────

export interface GravityResult {
  /** Существующие объекты, сдвинувшиеся вниз: { from: старый idx, to: новый idx }. */
  falls: { from: number; to: number }[];
  /** Новые объекты сверху: плитка (`tier`, kind=null) ИЛИ собираемый (`kind`, tier=null). */
  spawns: { idx: number; tier: Tier | null; kind: SpecialKind | null }[];
}

/**
 * Гравитация по столбцам + досыпка сверху. Существующие объекты (плитки, бустеры,
 * собираемые) уплотняются вниз; сверху досыпается новый объект: с шансами из
 * balance.collect — 💎 алмаз / ⚡ молния / 🎁 сейф, иначе случайный тир [1..tierCount].
 * Mutates field. Возвращает перемещения и спавны для анимаций.
 */
export function applyGravityAndRefill(field: FieldState, tierCount: number, rng: () => number = Math.random): GravityResult {
  const falls: { from: number; to: number }[] = [];
  const spawns: { idx: number; tier: Tier | null; kind: SpecialKind | null }[] = [];
  const { cols, rows } = field;
  const sp = getSpecial(field);
  const c = balance.collect;
  for (let x = 0; x < cols; x++) {
    let writeY = rows - 1; // следующий свободный слот снизу
    for (let y = rows - 1; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      if (!isOccupied(field, idx, sp)) continue;
      const toIdx = xyToIdx(x, writeY, cols);
      if (toIdx !== idx) {
        field.cells[toIdx] = field.cells[idx];
        sp[toIdx] = sp[idx];
        field.cells[idx] = null;
        sp[idx] = null;
        falls.push({ from: idx, to: toIdx });
      }
      writeY--;
    }
    // Оставшиеся сверху слоты (writeY..0) — новые объекты (собираемый по шансу, иначе плитка).
    for (let y = writeY; y >= 0; y--) {
      const idx = xyToIdx(x, y, cols);
      const r = rng();
      let kind: CollectibleKind | null = null;
      if (r < c.diamondChance) kind = 'diamond';
      else if (r < c.diamondChance + c.lightningChance) kind = 'lightning';
      else if (r < c.diamondChance + c.lightningChance + c.safeChance) kind = 'safe';
      if (kind) {
        field.cells[idx] = null;
        sp[idx] = kind;
        spawns.push({ idx, tier: null, kind });
      } else {
        const tier = 1 + Math.floor(rng() * tierCount);
        field.cells[idx] = tier;
        sp[idx] = null;
        spawns.push({ idx, tier, kind: null });
      }
    }
  }
  return { falls, spawns };
}

// ─── Разрешение поля (каскад) ──────────────────────────────────────────────────

/** Дельта одного шага каскада для анимации в boardView. */
export interface CascadeStep {
  /** Обнулённые клетки (pop). Включает собранные алмазы/молнии (их idx также в `collected`). */
  cleared: number[];
  /** Тиры обнулённых клеток — для начисления денег. */
  clearedTiers: Tier[];
  /** Anchor-клетки, ставшие спецобъектами (бустеры из матчей + награды открытых сейфов). */
  spawns: MatchSpawn[];
  /** Перемещения уцелевших объектов вниз. */
  falls: { from: number; to: number }[];
  /** Новые объекты сверху: плитка (`tier`) или собираемый (`kind`). */
  refills: { idx: number; tier: Tier | null; kind: SpecialKind | null }[];
  /** Число различных натуральных матч-групп в этом шаге (для комбо; спецвзрывы не считаются). */
  groups: number;
  /** Собранные алмазы/молнии (улетают в баланс 💎 / запас энергии; без множителей). */
  collected: { idx: number; kind: CollectibleKind }[];
  /** Открытые сейфы: на месте `idx` появилась награда `kind` (она же в `spawns`). */
  opened: { idx: number; kind: SpecialKind }[];
  /** Сколько 💎 собрано на шаге. */
  diamonds: number;
  /** Сколько энергии собрано на шаге. */
  energy: number;
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

/** Случайная награда сейфа: бустер (случайный из 5) / алмаз / молния — по весам balance.collect.safeReward. */
function rollSafeReward(rng: () => number): SpecialKind {
  const w = balance.collect.safeReward;
  let r = rng() * (w.booster + w.diamond + w.lightning);
  if ((r -= w.booster) < 0) {
    const bs: BoosterKind[] = ['bomb', 'rocket-h', 'rocket-v', 'magnet', 'drone'];
    return bs[Math.floor(rng() * bs.length)];
  }
  if ((r -= w.diamond) < 0) return 'diamond';
  return 'lightning';
}

/**
 * Сработавшие собираемые объекты в текущем clear-set. Триггер: клетка собираемого ∈ clearedSet
 * (прямое попадание бустером) ИЛИ ортогонально рядом схлопывается плитка. diamond/lightning →
 * собираются (idx добавляется в clearedSet, считается в diamonds/energy); safe → ОТКРЫВАЕТСЯ
 * (награда добавляется в spawns и переживает шаг, в clearedSet НЕ попадает). Mutates clearedSet и spawns.
 */
function resolveCollectibles(
  field: FieldState,
  clearedSet: Set<number>,
  spawns: MatchSpawn[],
  rng: () => number,
): Pick<CascadeStep, 'collected' | 'opened' | 'diamonds' | 'energy'> {
  const sp = getSpecial(field);
  const { cols, rows } = field;
  const clearedTiles = new Set<number>();
  for (const i of clearedSet) if (isValidTier(field.cells[i])) clearedTiles.add(i);
  const spawnIdx = new Set(spawns.map((s) => s.idx));

  const collected: { idx: number; kind: CollectibleKind }[] = [];
  const opened: { idx: number; kind: SpecialKind }[] = [];
  let diamonds = 0, energy = 0;
  for (let i = 0; i < sp.length; i++) {
    const k = sp[i];
    if (!isCollectible(k) || spawnIdx.has(i)) continue;
    let triggered = clearedSet.has(i);
    if (!triggered) {
      const { x, y } = idxToXY(i, cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (clearedTiles.has(xyToIdx(nx, ny, cols))) { triggered = true; break; }
      }
    }
    if (!triggered) continue;
    if (k === 'diamond') { collected.push({ idx: i, kind: 'diamond' }); diamonds += 1; clearedSet.add(i); }
    else if (k === 'lightning') { collected.push({ idx: i, kind: 'lightning' }); energy += balance.collect.lightningEnergy; clearedSet.add(i); }
    else { const reward = rollSafeReward(rng); opened.push({ idx: i, kind: reward }); spawns.push({ idx: i, kind: reward, tier: 1 }); }
  }
  return { collected, opened, diamonds, energy };
}

/**
 * Применить готовый clear-set + спавны: сначала разрешить собираемые (сбор алмазов/молний,
 * открытие сейфов в награды), затем обнуление клеток, установка спецобъектов на anchor-клетки
 * (cells=null), гравитация + досыпка. НЕ запускает цепную реакцию бустеров (её делает вызывающий
 * через expandClearWithSpecials). Mutates field и clearedSet. Возвращает дельту для анимации.
 */
export function applyClear(
  field: FieldState,
  clearedSet: Set<number>,
  spawns: MatchSpawn[],
  tierCount: number,
  rng: () => number = Math.random,
): CascadeStep {
  const sp = getSpecial(field);
  // Собираемые (алмаз/молния → сбор и в clearedSet; сейф → награда в spawns).
  const coll = resolveCollectibles(field, clearedSet, spawns, rng);
  // Anchor-клетки (бустеры из матчей + награды сейфов) переживают схлоп.
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
  // Спецобъект — самостоятельный: плитки под ним нет (cells=null).
  for (const s of spawns) { field.cells[s.idx] = null; sp[s.idx] = s.kind; }

  const g = applyGravityAndRefill(field, tierCount, rng);
  return {
    cleared, clearedTiers, spawns, falls: g.falls, refills: g.spawns, groups: 0,
    collected: coll.collected, opened: coll.opened, diamonds: coll.diamonds, energy: coll.energy,
  };
}

/**
 * Один шаг каскада по матчам поля: найти матчи → применить. Возвращает дельту или null,
 * если матчей нет (каскад окончен). `moved` (клетки свапа) — anchor спавна бустера на 1-м шаге.
 */
export function resolveStep(
  field: FieldState,
  tierCount: number,
  rng: () => number = Math.random,
  moved?: Iterable<number>,
): CascadeStep | null {
  const m = findMatches(field, moved, rng);
  if (m.cleared.size === 0 && m.spawns.length === 0) return null;
  const groups = countMatchGroups(field, m.cleared); // считаем ДО обнуления
  const step = applyClear(field, m.cleared, m.spawns, tierCount, rng);
  step.groups = groups;
  return step;
}

// ─── Валидность хода / дедлок ───────────────────────────────────────────────────

/** Даст ли свап a↔b матч? Бустер «применяется» всегда; собираемый/плитка — если после обмена есть матч. Поле не меняется (откат). */
export function wouldSwapMatch(field: FieldState, a: number, b: number): boolean {
  const sp = getSpecial(field);
  if (isBooster(sp[a]) || isBooster(sp[b])) return true;
  swapCells(field, a, b);
  const has = hasMatchAny(field);
  swapCells(field, a, b);
  return has;
}

/** Есть ли хоть один доступный ход (валидный свап или БУСТЕР на поле; собираемые ходом не считаются). */
export function hasAnyValidMove(field: FieldState): boolean {
  const { cols, rows } = field;
  const sp = getSpecial(field);
  for (let i = 0; i < sp.length; i++) if (isBooster(sp[i])) return true;
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
