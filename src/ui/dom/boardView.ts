// Поле классического match-3 (экран Hamster Bank): синяя база + сетка 6×5 светлых плашек (58×58, шаг 60).
//
// Ввод: СВАЙП к ортогональному соседу → обмен; линия 3+/квадрат 2×2 → каскад (схлоп → деньги →
// бустер за сложный матч → гравитация → повтор). Свап без матча откатывается.
//
// БУСТЕРЫ на поле (T/L→💣, линия-4→🚀, 2×2→🛸 дрон, линия-5→🧲):
//  • активируются ПОСЛЕ перемещения (свайп: бустер переезжает на клетку соседа и срабатывает там),
//    либо ТАПОМ (без свайпа — срабатывает на своей клетке);
//  • 🛸 дрон: на СТАРТЕ взлёта собирает «плюс» вокруг себя, затем (подольше) летит ПРЕИМУЩЕСТВЕННО
//    в обычную плитку (не в бустеры/собираемые) и активирует её;
//  • комбо двух бустеров: 💣+💣 → 5×5; 💣+🚀 → 3 ряда+3 столбца; 🚀+🚀 → крест; 🧲+🧲 → ВСЁ поле;
//    🧲+любой → спавн партнёра по тиру + взрыв; 🛸+🛸 → 3 дрона; 🛸+💣/🚀 → дрон уносит бустер.
//  • ЗАВОД: перед действием бустер пульсирует на месте ~boosterActivateMs (у каждого свой таймер), затем срабатывает;
//  • сбор бустера ПОСТЕПЕННЫЙ (от ближних к дальним, ~1с); бомба — сразу всё; дрон — дольше летит.
//
// СОБИРАЕМЫЕ на поле (💎 алмаз / ⚡ молния / 🎁 сейф): СВАПАЮТСЯ как обычные фишки (обмен прилипает,
// если образовался матч; свайп на бустер активирует его и собирает их). Собираются, если рядом схлоп
// ИЛИ по ним прошёл бустер. Алмаз → +1💎, молния → +energy (без множителей, улетают в баланс).
// Сейф → открывается в награду (бустер/алмаз/молния), которая остаётся лежать до своего сбора.
//
// Логика поля — core/match3.ts; здесь — ввод и анимации. Координаты — дизайн-холст 390×844.

import type { FieldState, Tier, SpecialKind, BoosterKind, CollectibleKind } from '../../types';
import type { CascadeStep, MatchSpawn, BoosterBlast } from '../../core/match3';
import { idxToXY, isValidTier, xyToIdx, getSpecial, isBooster, isCollectible } from '../../core/board';
import { balance } from '../../config/balance';
import {
  areOrthoNeighbors, swapCells, hasMatchAny, findMatches, applyClear, resolveStep,
  boosterTargets, pickNearestTileTier, expandClearWithSpecials, collectBoosterBlasts, hasAnyValidMove,
  cellsInSquare, cellsInRows, cellsInCols, cellsInPlus, pickRandomPresentTier,
  droneTargets, pickDroneFlightTarget,
} from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { anim } from '../../config/anim';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { playCollectFx } from './match3Fx';

/**
 * Режим тайминга pop'ов при активации бустера. `span` — за сколько мс волна добегает до дальней
 * клетки (по умолч. anim.boosterWaveMs). `delays` — явная задержка pop'а на клетку (перекрывает radial;
 * дрон собирает «плюс» с delay=0 на взлёте, цель/цепь — к моменту приземления).
 */
interface ClearTiming { origin: number | null; mode: 'radial' | 'instant'; span?: number; delays?: Map<number, number>; }

export interface BoardViewCallbacks {
  /** Можно ли сделать ход (хватает ли энергии). false → свайп/тап игнорируется. */
  canMove(): boolean;
  /** Ход подтверждён (валидный свап/бустер): СПИСАТЬ энергию сразу (в момент свайпа). */
  onSpendEnergy(): void;
  /** Шаг каскада схлопнут: tiers — схлопнутые тиры (деньги), naturalGroups — число матч-групп (комбо). */
  onCascadeStep(tiers: Tier[], naturalGroups: number): void;
  /** Собран алмаз/молния (улетел в баланс 💎 / энергию). fromX/fromY — стартовая точка в дизайн-координатах. */
  onCollect(kind: 'diamond' | 'lightning', fromX: number, fromY: number): void;
  /** Поле перестало матчиться (конец хода): зафиксировать накопленное в Баланс (полёт денег). */
  onMoveEnd(): void;
  onPersist(): void;
}

// Геометрия поля из макета «Play window» (дизайн-холст 390×844).
const BASE_LEFT = 7;
const BASE_TOP = 342;
const BASE_W = 376;
const BASE_H = 316;
const PANEL_LEFT = BASE_LEFT + 9; // 16
const PANEL_TOP = BASE_TOP + 9;   // 351
const PANEL_W = 358;              // 6×58 + 5×2
const PANEL_H = 298;              // 5×58 + 4×2
const GAP = 2;                    // зазор между плашками (одинаковый по верт./гориз.)

const EASE_OUT = 'cubic-bezier(0.22,0.61,0.36,1)';
// Тайминги анимаций — в config/anim.ts (мутабельны, крутятся из дев-панели). Падение уцелевших и
// досыпка идут с ОДНОЙ скоростью anim.fallSpeed (линейно) и реакция-каскадом anim.reactionMs (снизу
// вверх: предмет над освободившимся слотом стартует через reactionMs — и для уцелевших, и для досыпки).

// Цели полёта собранных объектов (дизайн-координаты 390×844): 💎 — значение в карте, ⚡ — пилюля Energy.
const DIAMOND_TARGET = { x: 44, y: 237 } as const;
const ENERGY_TARGET = { x: 195, y: 305 } as const;

export class BoardView {
  private cellW: number;   // размер плашки (квадрат)
  private cellH: number;
  private strideX: number; // шаг между плашками (плашка + GAP)
  private strideY: number;
  private iconSize: number;
  private stageEl: HTMLElement;
  private panel: HTMLDivElement;
  private cellEls: HTMLDivElement[] = [];
  private tileByIndex = new Map<number, HTMLElement>();
  private busy = false;

  // Жест.
  private downIdx = -1;
  private downLocal = { x: 0, y: 0 };
  private gestureUsed = false;

  constructor(
    stage: HTMLElement,
    private field: FieldState,
    private callbacks: BoardViewCallbacks,
  ) {
    this.cellW = (PANEL_W - (field.cols - 1) * GAP) / field.cols; // 58
    this.cellH = (PANEL_H - (field.rows - 1) * GAP) / field.rows; // 58
    this.strideX = this.cellW + GAP; // 60
    this.strideY = this.cellH + GAP; // 60
    this.iconSize = Math.min(this.cellW, this.cellH) - 2;
    this.stageEl = stage;

    el('div', { cls: 'hb-board-base', style: `left:${BASE_LEFT}px;top:${BASE_TOP}px;width:${BASE_W}px;height:${BASE_H}px;`, parent: stage });

    this.panel = el('div', {
      cls: 'board-panel',
      style: `left:${PANEL_LEFT}px;top:${PANEL_TOP}px;width:${PANEL_W}px;height:${PANEL_H}px;`,
      parent: stage,
    });

    this.buildCells();
    this.settleInitial();

    this.panel.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private buildCells(): void {
    for (let i = 0; i < this.field.cells.length; i++) {
      const { x, y } = idxToXY(i, this.field.cols);
      const cell = el('div', {
        cls: 'board-cell',
        style: `left:${x * this.strideX}px;top:${y * this.strideY}px;width:${this.cellW}px;height:${this.cellH}px;`,
        parent: this.panel,
      });
      this.cellEls.push(cell);
    }
  }

  /** Полный rebuild всех объектов по field (плитки + бустеры + собираемые). */
  rebuildTiles(): void {
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
    const sp = getSpecial(this.field);
    for (let i = 0; i < this.field.cells.length; i++) {
      const kind = sp[i];
      const cell = this.field.cells[i];
      if (isBooster(kind)) this.tileByIndex.set(i, this.makeBoosterTile(i, kind));
      else if (isCollectible(kind)) this.tileByIndex.set(i, this.makeCollectibleTile(i, kind));
      else if (isValidTier(cell)) this.tileByIndex.set(i, this.makeTile(i, cell));
    }
    this.clearSelection();
  }

  /** Создать плитку-тир (арт + glow). */
  private makeTile(idx: number, tier: Tier): HTMLElement {
    const c = this.cellCenter(idx);
    const tile = el('div', {
      cls: 'board-tile',
      style: `left:0;top:0;width:${this.cellW}px;height:${this.cellH}px;transform:${centerTransform(c.x, c.y, 1)};`,
    });
    tile.dataset.tier = String(tier);
    const icon = makeTierIcon(tier, this.iconSize);
    icon.style.position = 'absolute';
    icon.style.left = '50%';
    icon.style.top = '50%';
    icon.style.transform = 'translate(-50%,-50%)';
    tile.appendChild(icon);
    el('div', { cls: 'tier-glow', parent: tile });
    this.panel.appendChild(tile);
    return tile;
  }

  /** Создать бустер-объект на поле (только PNG-иконка; без чипа/подсветки; ⇆/⇅ для ракеты). */
  private makeBoosterTile(idx: number, kind: BoosterKind): HTMLElement {
    const c = this.cellCenter(idx);
    const base = kind === 'bomb' ? 'bomb' : kind === 'magnet' ? 'magnet' : kind === 'drone' ? 'drone' : 'rocket';
    const tile = el('div', {
      cls: `board-tile board-booster board-booster-${base}`,
      style: `left:0;top:0;width:${this.cellW}px;height:${this.cellH}px;transform:${centerTransform(c.x, c.y, 1)};`,
    });
    tile.dataset.booster = kind;
    const icon = el('img', { cls: 'board-booster-icon', parent: tile }) as HTMLImageElement;
    icon.src = `assets/boosters/${base}.png`; icon.alt = ''; icon.draggable = false;
    if (kind === 'rocket-h' || kind === 'rocket-v') {
      el('div', { cls: 'board-booster-dir', text: kind === 'rocket-h' ? '⇆' : '⇅', parent: tile });
    }
    this.panel.appendChild(tile);
    return tile;
  }

  /** Создать собираемый объект на поле (💎 алмаз / ⚡ молния — иконки HUD; 🎁 сейф — эмодзи). */
  private makeCollectibleTile(idx: number, kind: CollectibleKind): HTMLElement {
    const c = this.cellCenter(idx);
    const tile = el('div', {
      cls: `board-tile board-collectible board-collectible-${kind}`,
      style: `left:0;top:0;width:${this.cellW}px;height:${this.cellH}px;transform:${centerTransform(c.x, c.y, 1)};`,
    });
    tile.dataset.collectible = kind;
    if (kind === 'safe') {
      el('div', { cls: 'board-collectible-emoji', text: '🎁', parent: tile });
    } else {
      const icon = el('img', { cls: 'board-collectible-icon', parent: tile }) as HTMLImageElement;
      icon.src = kind === 'diamond' ? 'assets/hud/icon-diamond.png' : 'assets/hud/icon-energy.svg';
      icon.alt = ''; icon.draggable = false;
    }
    this.panel.appendChild(tile);
    return tile;
  }

  private cellCenter(idx: number): { x: number; y: number } {
    const { x, y } = idxToXY(idx, this.field.cols);
    return { x: x * this.strideX + this.cellW / 2, y: y * this.strideY + this.cellH / 2 };
  }

  private centroidOf(indices: number[]): { x: number; y: number } {
    if (!indices.length) return { x: PANEL_W / 2, y: PANEL_H / 2 };
    let sx = 0, sy = 0;
    for (const i of indices) { const c = this.cellCenter(i); sx += c.x; sy += c.y; }
    return { x: sx / indices.length, y: sy / indices.length };
  }

  private pointerToLocal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.panel.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * PANEL_W,
      y: ((clientY - rect.top) / rect.height) * PANEL_H,
    };
  }

  private localToCell(localX: number, localY: number): number {
    const cx = Math.floor(localX / this.strideX);
    const cy = Math.floor(localY / this.strideY);
    if (cx < 0 || cy < 0 || cx >= this.field.cols || cy >= this.field.rows) return -1;
    return xyToIdx(cx, cy, this.field.cols);
  }

  // ─── Ввод (свайп + тап) ──────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (this.busy) return;
    const local = this.pointerToLocal(e.clientX, e.clientY);
    const idx = this.localToCell(local.x, local.y);
    if (idx === -1) { this.downIdx = -1; return; }
    this.downIdx = idx;
    this.downLocal = local;
    this.gestureUsed = false;
    try { this.panel.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.setSelected(idx, true);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.busy || this.downIdx === -1 || this.gestureUsed) return;
    const local = this.pointerToLocal(e.clientX, e.clientY);
    const dx = local.x - this.downLocal.x;
    const dy = local.y - this.downLocal.y;
    const thresh = Math.min(this.cellW, this.cellH) * 0.45;
    if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;

    const { x, y } = idxToXY(this.downIdx, this.field.cols);
    let nx = x, ny = y;
    if (Math.abs(dx) >= Math.abs(dy)) nx += dx > 0 ? 1 : -1;
    else ny += dy > 0 ? 1 : -1;
    if (nx < 0 || ny < 0 || nx >= this.field.cols || ny >= this.field.rows) return;

    this.gestureUsed = true;
    const a = this.downIdx;
    const b = xyToIdx(nx, ny, this.field.cols);
    this.setSelected(a, false);
    this.downIdx = -1;
    void this.trySwap(a, b);
  };

  private onPointerUp = (): void => {
    const idx = this.downIdx;
    this.downIdx = -1;
    if (idx === -1) return;
    this.setSelected(idx, false);
    // Тап (без свайпа) по БУСТЕРУ → активировать на его клетке (собираемые не тапаются).
    if (!this.gestureUsed && isBooster(getSpecial(this.field)[idx])) void this.tapBooster(idx);
  };

  // ─── Свайп: обмен / активация бустера ПОСЛЕ перемещения ──────────────────────

  private async trySwap(a: number, b: number): Promise<void> {
    if (this.busy || !areOrthoNeighbors(a, b, this.field.cols)) return;
    if (!this.callbacks.canMove()) return; // нет энергии — ход недоступен
    this.busy = true;

    const sp = getSpecial(this.field);
    if (isBooster(sp[a]) || isBooster(sp[b])) {
      // Хотя бы один — БУСТЕР: перемещаем (обмен a↔b) и активируем на новых местах.
      // Собираемый, свайпнутый на бустер, попадёт под сбор (см. resolveBoosterActivation).
      swapCells(this.field, a, b);
      this.callbacks.onSpendEnergy(); // ход состоялся → энергия сразу (в момент свайпа)
      await this.swapTilesVisual(a, b);
      await this.resolveBoosterActivation(a, b); // dest перетаскиваемого = b
    } else {
      // Плитки и/или собираемые (💎/⚡/🎁): обмен «прилипает», только если образовался матч (классика).
      swapCells(this.field, a, b);
      const matched = hasMatchAny(this.field);
      if (matched) this.callbacks.onSpendEnergy(); // валидный ход → энергия сразу
      await this.swapTilesVisual(a, b);
      if (matched) {
        await this.runNaturalCascade([a, b]);
      } else {
        swapCells(this.field, a, b);
        await this.swapTilesVisual(a, b); // откат (энергию не тратим)
      }
    }

    this.callbacks.onMoveEnd();
    this.ensureSolvable();
    this.busy = false;
    this.callbacks.onPersist();
  }

  /** Тап по бустеру (без свайпа) → активация на его клетке. */
  private async tapBooster(idx: number): Promise<void> {
    if (this.busy || !this.callbacks.canMove()) return;
    const kind = getSpecial(this.field)[idx];
    if (!isBooster(kind)) return;
    this.busy = true;
    this.callbacks.onSpendEnergy(); // тап-активация — это ход → энергия сразу
    const target = kind === 'magnet' ? pickNearestTileTier(this.field, idx, Math.random) : null;
    await this.activateOneBooster(idx, target);
    this.callbacks.onMoveEnd();
    this.ensureSolvable();
    this.busy = false;
    this.callbacks.onPersist();
  }

  /**
   * Бустер(ы) «заводятся» перед срабатыванием: пульсируют на своих клетках anim.boosterActivateMs мс,
   * и только потом действуют. У каждого свой таймер (пульсируют параллельно). 0 → без задержки.
   */
  private async pulseBoosters(indices: number[]): Promise<void> {
    const ms = anim.boosterActivateMs;
    if (ms <= 0 || !indices.length) return;
    for (const idx of indices) {
      const tile = this.tileByIndex.get(idx);
      if (!tile) continue;
      const c = this.cellCenter(idx);
      tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), filter: 'brightness(1)', offset: 0 },
          { transform: centerTransform(c.x, c.y, 1.2), filter: 'brightness(1.55)', offset: 0.3 },
          { transform: centerTransform(c.x, c.y, 0.95), filter: 'brightness(1.12)', offset: 0.6 },
          { transform: centerTransform(c.x, c.y, 1.12), filter: 'brightness(1.4)', offset: 0.85 },
          { transform: centerTransform(c.x, c.y, 1), filter: 'brightness(1)', offset: 1 },
        ],
        { duration: ms, easing: 'ease-in-out' },
      );
    }
    await this.delay(ms);
  }

  /**
   * Активировать ОДИН бустер на его клетке (магнит — по target; дрон — отдельным путём).
   * `extra` — клетка в зону (собираемый, свайпнутый на бустер). `immune` — клетки, которые НЕ
   * задеваются (только что рождённые из матча-свайпа бустеры — короткий иммунитет).
   */
  private async activateOneBooster(self: number, magnetTarget: Tier | null, extra?: number, immune?: Set<number>): Promise<void> {
    const kind = getSpecial(this.field)[self];
    if (!isBooster(kind)) return;
    if (kind === 'drone') { await this.activateDrone(self, extra, immune); return; }
    // Активация self + ЦЕПНАЯ реакция задетых бустеров, с учётом зоны КАЖДОГО: бустер на пути ракеты
    // детонирует ИЗ СВОЕГО ЦЕНТРА, когда до него дошла волна (а не «всасывается» в общую волну).
    const seed = new Set<number>();
    const blasts = collectBoosterBlasts(this.field, self, seed, magnetTarget, immune, Math.random);
    if (extra != null) seed.add(extra); // собираемый, свайпнутый на бустер, попадает в зону
    if (immune) for (const i of immune) seed.delete(i); // иммунные не сносятся
    const { delays, flights } = this.boosterChainTiming(blasts, extra);
    // Тайлы задетых дронов капчим ДО клира (animateStep удалит их из tileByIndex) — спрячем на взлёте.
    const droneTiles = new Map<number, HTMLElement>();
    for (const fl of flights) { const t = this.tileByIndex.get(fl.from); if (t) droneTiles.set(fl.from, t); }
    // Завод: пульсирует ТОЛЬКО активированный бустер; задетые по цепочке детонируют по приходу волны
    // (дрон — ВЗЛЕТАЕТ к своей цели; бомба/ракета/магнит — бьют из своего центра).
    await this.pulseBoosters([self]);
    await Promise.all([
      this.applyAndAnimate(seed, { origin: self, mode: 'radial', delays }),
      ...flights.map((fl) => this.flyChainedDrone(fl.from, fl.to, fl.at, fl.dur, droneTiles.get(fl.from))),
    ]);
    await this.runNaturalCascade();
  }

  /**
   * Тайминги цепочки детонаций: каждый бустер бьёт ИЗ СВОЕГО ЦЕНТРА начиная с fireTime (когда волна
   * предыдущего до него дошла; self → 0). Бомба — мгновенно (вся зона разом); ракета/магнит — радиально
   * по дистанции; ДРОН — собирает «плюс» на взлёте (fireTime) и улетает, цель сносится в приземлении
   * (fireTime + полёт). Возвращает карту задержек pop'ов + список взлётов дронов (для анимации спрайтов).
   */
  private boosterChainTiming(
    blasts: BoosterBlast[],
    extra?: number,
  ): { delays: Map<number, number>; flights: { from: number; to: number; at: number; dur: number }[] } {
    const stepMs = anim.boosterWaveMs / Math.max(this.field.cols, this.field.rows); // скорость волны (мс/клетку)
    const delays = new Map<number, number>();
    const flights: { from: number; to: number; at: number; dur: number }[] = [];
    const setMin = (idx: number, d: number): void => { const cur = delays.get(idx); if (cur == null || d < cur) delays.set(idx, d); };
    for (const blast of blasts) {
      const fireTime = delays.get(blast.idx) ?? 0; // когда волна дошла до этого бустера (self → 0)
      if (blast.kind === 'drone') {
        const dur = blast.flightTarget != null ? this.droneFlightDur(blast.idx, blast.flightTarget) : 0;
        for (const c of blast.cells) setMin(c, c === blast.flightTarget ? fireTime + dur : fireTime); // плюс — на взлёте, цель — в приземлении
        if (blast.flightTarget != null) flights.push({ from: blast.idx, to: blast.flightTarget, at: fireTime, dur });
      } else if (blast.kind === 'bomb') {
        for (const c of blast.cells) setMin(c, fireTime); // взрыв 3×3 разом
      } else {
        const center = this.cellCenter(blast.idx);
        for (const c of blast.cells) { const cc = this.cellCenter(c); setMin(c, fireTime + (Math.hypot(cc.x - center.x, cc.y - center.y) / this.strideX) * stepMs); }
      }
    }
    if (extra != null) setMin(extra, 0);
    return { delays, flights };
  }

  /** Задетый по цепочке дрон: на своём fireTime прячет свой (попадающий под pop) тайл и улетает к цели. */
  private async flyChainedDrone(fromIdx: number, toIdx: number, at: number, dur: number, origTile?: HTMLElement): Promise<void> {
    if (at > 0) await this.delay(at);
    if (origTile) origTile.style.visibility = 'hidden'; // pop этого тайла станет невидимым — летит спрайт
    await this.flyDrone(fromIdx, toIdx, dur);
  }

  /** Дрон: «плюс» собирается на СТАРТЕ взлёта (delay 0), цель/цепь — к моменту приземления (≈flightDur). */
  private async activateDrone(self: number, extra?: number, immune?: Set<number>): Promise<void> {
    await this.pulseBoosters([self]); // дрон «заводится» на месте, затем взлетает
    const { cells, flightTarget } = droneTargets(this.field, self, Math.random, immune);
    if (extra != null) cells.add(extra);
    const fired = new Set<number>([self]);
    if (immune) for (const i of immune) fired.add(i);
    expandClearWithSpecials(this.field, cells, Math.random, fired);
    if (immune) for (const i of immune) cells.delete(i);
    const step = applyClear(this.field, cells, [], balance.tierCount, Math.random);
    const flightDur = this.droneFlightDur(self, flightTarget);
    // delay: «плюс» — на взлёте (0); цель/цепь — к приземлению (flightDur + радиально от точки приземления).
    const plus = cellsInPlus(this.field, self);
    const lc = this.cellCenter(flightTarget ?? self);
    let maxRest = 0;
    const restD = new Map<number, number>();
    for (const idx of step.cleared) {
      if (plus.has(idx)) continue;
      const cc = this.cellCenter(idx);
      const d = Math.hypot(cc.x - lc.x, cc.y - lc.y) / this.strideX;
      restD.set(idx, d); if (d > maxRest) maxRest = d;
    }
    const restStep = maxRest > 0 ? anim.boosterWaveMs / maxRest : 0;
    const delays = new Map<number, number>();
    for (const idx of step.cleared) delays.set(idx, plus.has(idx) ? 0 : flightDur + (restD.get(idx) ?? 0) * restStep);
    await Promise.all([
      this.flyDrone(self, flightTarget, flightDur),
      this.animateStep(step, { origin: self, mode: 'radial', delays }),
    ]);
    await this.runNaturalCascade();
  }

  /** Длительность полёта дрона ~ дистанции: от anim.droneFlightMinMs (близко) до droneFlightMaxMs (далеко). */
  private droneFlightDur(from: number, to: number | null): number {
    if (to == null) return anim.droneFlightMinMs;
    const a = this.cellCenter(from), b = this.cellCenter(to);
    const dCells = Math.hypot(b.x - a.x, b.y - a.y) / this.strideX;
    const t = Math.min(1, dCells / 6);
    return Math.round(anim.droneFlightMinMs + t * (anim.droneFlightMaxMs - anim.droneFlightMinMs));
  }

  /** Активация бустера(ов) после свапа (a и b — уже обменянные клетки; dest = b). */
  private async resolveBoosterActivation(a: number, b: number): Promise<void> {
    const sp = getSpecial(this.field);
    const ka = sp[a];
    const kb = sp[b];
    if (isBooster(ka) && isBooster(kb)) { await this.boosterCombo(a, b, ka, kb); return; } // оба бустера → комбо

    // Ровно один бустер (партнёр — плитка ИЛИ собираемый): активируем бустер на его клетке.
    const self = isBooster(ka) ? a : b;
    const partner = isBooster(ka) ? b : a;
    const kind = sp[self];
    if (!isBooster(kind)) return;
    let target: Tier | null = null;
    if (kind === 'magnet') {
      const pt = this.field.cells[partner];
      target = isValidTier(pt) ? pt : pickNearestTileTier(this.field, self, Math.random);
    }
    // Свайп бустера на ПЛИТКУ, образовавший матч (5 в ряд и т.п.): сперва схлоп матча (родить
    // бустеры — напр. магнит из линии-5), и ТОЛЬКО затем активация свайпнутого бустера; новые
    // бустеры при этом неуязвимы (короткий иммунитет — взрыв их не активирует).
    if (isValidTier(this.field.cells[partner]) && hasMatchAny(this.field)) {
      await this.boosterSwapWithMatch(self, partner, target);
      return;
    }
    // Собираемый свайпнут на бустер → попадает под сбор (включаем его клетку в зону).
    const extra = isCollectible(sp[partner]) ? partner : undefined;
    await this.activateOneBooster(self, target, extra);
  }

  /** Свайп бустер+плитка с матчем: схлоп матча (родит бустеры) → затем активация бустера; новые — иммунны. */
  private async boosterSwapWithMatch(boosterCell: number, tileCell: number, magnetTarget: Tier | null): Promise<void> {
    const m = findMatches(this.field, [tileCell], Math.random);
    const step = applyClear(this.field, m.cleared, m.spawns, balance.tierCount, Math.random, true); // натуральный матч от свайпа
    await this.animateStep(step);
    // Новые позиции после гравитации этого шага (бустер и заспавненные могли «упасть»).
    const moveOf = (idx: number): number => { const f = step.falls.find((ff) => ff.from === idx); return f ? f.to : idx; };
    const selfNow = moveOf(boosterCell);
    const immune = new Set<number>(step.spawns.map((s) => moveOf(s.idx)));
    await this.activateOneBooster(selfNow, magnetTarget, undefined, immune);
  }

  /** Комбо двух бустеров. dest (куда переехал перетаскиваемый) = b. */
  private async boosterCombo(a: number, b: number, ka: SpecialKind, kb: SpecialKind): Promise<void> {
    const isM = (k: SpecialKind): boolean => k === 'magnet';
    const isB = (k: SpecialKind): boolean => k === 'bomb';
    const isR = (k: SpecialKind): boolean => k === 'rocket-h' || k === 'rocket-v';
    const isD = (k: SpecialKind): boolean => k === 'drone';

    await this.pulseBoosters([a, b]); // оба свайпнутых бустера «заводятся» перед комбо
    if (isM(ka) && isM(kb)) { await this.clearWholeBoard(b); return; }       // 🧲+🧲 → всё поле
    if (isM(ka) || isM(kb)) { await this.magnetCombo(a, b, ka, kb); return; } // 🧲+любой → спавн партнёра
    if (isD(ka) && isD(kb)) { await this.droneDroneCombo(a, b); return; }     // 🛸+🛸 → 3 дрона (2+1)
    if (isD(ka) || isD(kb)) { await this.droneCarryCombo(a, b, ka, kb); return; } // 🛸+💣/🚀 → уносит бустер

    const seed = new Set<number>([a, b]);
    let mode: 'radial' | 'instant' = 'radial';
    if (isB(ka) && isB(kb)) {
      for (const c of cellsInSquare(this.field, b, 2)) seed.add(c);       // 💣+💣 → 5×5 (сразу)
      mode = 'instant';
    } else if ((isB(ka) && isR(kb)) || (isR(ka) && isB(kb))) {
      for (const c of cellsInRows(this.field, b, 1)) seed.add(c);        // 💣+🚀 → 3 ряда…
      for (const c of cellsInCols(this.field, b, 1)) seed.add(c);        // …+ 3 столбца
    } else {
      for (const c of cellsInRows(this.field, b, 0)) seed.add(c);        // 🚀+🚀 → крест
      for (const c of cellsInCols(this.field, b, 0)) seed.add(c);
    }
    expandClearWithSpecials(this.field, seed, Math.random, new Set([a, b]));
    await this.applyAndAnimate(seed, { origin: b, mode });
    await this.runNaturalCascade();
  }

  /** 🧲+🧲 — собрать ВСЁ поле (постепенно от точки свайпа к краям). */
  private async clearWholeBoard(origin: number): Promise<void> {
    const seed = new Set<number>();
    for (let i = 0; i < this.field.cells.length; i++) seed.add(i);
    await this.applyAndAnimate(seed, { origin, mode: 'radial' });
    await this.runNaturalCascade();
  }

  /** 🧲+💣/🚀 — собрать случайный тир, заспавнить на их месте партнёр-бустер, через 0.5с взорвать всё. */
  private async magnetCombo(a: number, b: number, ka: SpecialKind, kb: SpecialKind): Promise<void> {
    const sp = getSpecial(this.field);
    const partnerKind: SpecialKind = isMagnet(ka) ? kb : ka; // bomb / rocket-h / rocket-v
    const T = pickRandomPresentTier(this.field, Math.random);
    const tierCells: number[] = [];
    if (T != null) for (let i = 0; i < this.field.cells.length; i++) if (this.field.cells[i] === T && !sp[i]) tierCells.push(i);
    const spawns: MatchSpawn[] = tierCells.map((idx) => ({ idx, kind: partnerKind, tier: T as Tier }));
    const clearSet = new Set<number>([a, b]); // оба свайпнутых бустера расходуются
    const step = applyClear(this.field, clearSet, spawns, balance.tierCount, Math.random);
    await this.animateStep(step, { origin: b, mode: 'radial' });
    await this.delay(anim.spawnMs);
    await this.detonateAllBoosters(b); // авто-взрыв всех заспавненных бустеров
    await this.runNaturalCascade();
  }

  /** 🛸+💣/🚀 — дрон «уносит» бустер: летит к точке приземления и детонирует его там. */
  private async droneCarryCombo(a: number, b: number, ka: SpecialKind, kb: SpecialKind): Promise<void> {
    const droneCell = ka === 'drone' ? a : b;
    const carried: SpecialKind = ka === 'drone' ? kb : ka; // bomb / rocket-h / rocket-v
    // Точка приземления — обычная плитка среди ОСТАВШИХСЯ (оба свайпнутых исключены; фолбэк — спецобъект).
    const landing = pickDroneFlightTarget(this.field, droneCell, Math.random, [a, b]);
    const seed = new Set<number>([a, b]);
    for (const c of cellsInPlus(this.field, droneCell)) seed.add(c); // «плюс» на взлёте
    if (landing != null) {
      if (carried === 'bomb') for (const c of cellsInSquare(this.field, landing, balance.match.bombRadius)) seed.add(c);
      else if (carried === 'rocket-h') for (const c of cellsInRows(this.field, landing, 0)) seed.add(c);
      else if (carried === 'rocket-v') for (const c of cellsInCols(this.field, landing, 0)) seed.add(c);
    }
    expandClearWithSpecials(this.field, seed, Math.random, new Set([a, b]));
    const step = applyClear(this.field, seed, [], balance.tierCount, Math.random);
    const flightDur = this.droneFlightDur(droneCell, landing);
    await Promise.all([
      this.flyDrone(droneCell, landing, flightDur),
      this.animateStep(step, { origin: droneCell, mode: 'radial', span: flightDur }),
    ]);
    await this.runNaturalCascade();
  }

  /** 🛸+🛸 — в воздух взлетают 3 дрона (2 свайпнутых + 1 бонусный со случайной плитки). */
  private async droneDroneCombo(a: number, b: number): Promise<void> {
    const origins: number[] = [a, b];
    const bonus = this.randomMoneyCell([a, b]);
    if (bonus != null) origins.push(bonus);
    const seed = new Set<number>([a, b]);
    const flights: Array<[number, number]> = [];
    for (const o of origins) {
      for (const c of cellsInPlus(this.field, o)) seed.add(c);
      const ft = pickDroneFlightTarget(this.field, o, Math.random, [a, b]);
      if (ft != null) { seed.add(ft); flights.push([o, ft]); }
    }
    expandClearWithSpecials(this.field, seed, Math.random, new Set([a, b]));
    const step = applyClear(this.field, seed, [], balance.tierCount, Math.random);
    const durs = flights.map(([f, t]) => this.droneFlightDur(f, t));
    const span = durs.length ? Math.max(...durs) : 460;
    await Promise.all([
      ...flights.map(([f, t], i) => this.flyDrone(f, t, durs[i])),
      this.animateStep(step, { origin: a, mode: 'radial', span }),
    ]);
    await this.runNaturalCascade();
  }

  /** Случайная клетка с плиткой-деньгами (не бустер), исключая переданные. */
  private randomMoneyCell(exclude: number[]): number | null {
    const sp = getSpecial(this.field);
    const skip = new Set<number>(exclude);
    const money: number[] = [];
    for (let i = 0; i < this.field.cells.length; i++) {
      if (!skip.has(i) && !sp[i] && isValidTier(this.field.cells[i])) money.push(i);
    }
    return money.length ? money[Math.floor(Math.random() * money.length)] : null;
  }

  /** Визуал: дрон «взлетает» из fromIdx и летит дугой к toIdx за `dur` мс (косметика; клир — отдельно). */
  private async flyDrone(fromIdx: number, toIdx: number | null, dur = anim.droneFlightMinMs): Promise<void> {
    const from = this.cellCenter(fromIdx);
    const to = toIdx != null ? this.cellCenter(toIdx) : from;
    const orig = this.tileByIndex.get(fromIdx);
    if (orig) orig.style.visibility = 'hidden'; // прячем исходный дрон-тайл на время полёта
    const sprite = el('img', {
      cls: 'board-drone-fly',
      style: `width:${this.iconSize}px;height:${this.iconSize}px;`,
      parent: this.panel,
    }) as HTMLImageElement;
    sprite.src = 'assets/boosters/drone.png'; sprite.alt = ''; sprite.draggable = false;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dip = Math.min(46, 18 + dist * 0.2);
    const midX = (from.x + to.x) / 2;
    const midY = Math.min(from.y, to.y) - dip;
    sprite.animate(
      [
        { transform: centerTransform(from.x, from.y, 0.9), opacity: 0.85 },
        { transform: centerTransform(midX, midY, 1.18), opacity: 1, offset: 0.5 },
        { transform: centerTransform(to.x, to.y, 0.8), opacity: 0.9 },
      ],
      { duration: dur, easing: EASE_OUT, fill: 'forwards' },
    );
    await this.delay(dur);
    sprite.remove();
  }

  /** Радиальная вспышка под открывающимся сейфом (косметика). */
  private safeFlash(idx: number, delay: number): void {
    const c = this.cellCenter(idx);
    const flash = el('div', {
      cls: 'board-safe-flash',
      style: `left:0;top:0;width:${this.cellW * 2}px;height:${this.cellH * 2}px;`,
      parent: this.panel,
    });
    flash.animate(
      [
        { transform: centerTransform(c.x, c.y, 0.3), opacity: 0, offset: 0 },
        { transform: centerTransform(c.x, c.y, 0.65), opacity: 0.9, offset: 0.25 },
        { transform: centerTransform(c.x, c.y, 1.1), opacity: 0, offset: 1 },
      ],
      { duration: anim.safeOpenMs, delay, easing: EASE_OUT, fill: 'backwards' },
    );
    window.setTimeout(() => flash.remove(), delay + anim.safeOpenMs + 60);
  }

  /**
   * Сейф доехал до клетки приземления (x,y) к моменту `landTime` (мс от старта шага): сейф растворяется,
   * под ним вспышка, награда баунсит на ЭТОМ ЖЕ месте. Чинит глитч «награда спавнится там, где сейф
   * начинал открываться» — для падающих сейфов всё происходит в точке приземления, без наложений.
   */
  private openSafeAt(safeTile: HTMLElement, rewardTile: HTMLElement, x: number, y: number, landIdx: number, landTime: number): void {
    safeTile.animate(
      [
        { transform: centerTransform(x, y, 1), opacity: 1, offset: 0 },
        { transform: centerTransform(x, y, 0.8), opacity: 1, offset: 0.35 },
        { transform: centerTransform(x, y, 1.45), opacity: 0, offset: 1 },
      ],
      { duration: anim.safeOpenMs, delay: landTime, easing: EASE_OUT, fill: 'forwards' },
    );
    window.setTimeout(() => safeTile.remove(), landTime + anim.safeOpenMs + 40);
    this.safeFlash(landIdx, landTime + anim.safeOpenMs * 0.35);
    rewardTile.animate(
      [
        { transform: centerTransform(x, y, 0.1), opacity: 0, offset: 0 },
        { transform: centerTransform(x, y, 1.3), opacity: 1, offset: 0.55 },
        { transform: centerTransform(x, y, 0.9), offset: 0.78 },
        { transform: centerTransform(x, y, 1), offset: 1 },
      ],
      { duration: Math.round(anim.spawnMs * 1.35), delay: landTime + anim.safeOpenMs * 0.7, easing: EASE_OUT, fill: 'backwards' },
    );
  }

  /** Взорвать ВСЕ бустеры, что сейчас на поле (финал магнит-комбо); origin — точка волны сбора. */
  private async detonateAllBoosters(origin: number): Promise<void> {
    const sp = getSpecial(this.field);
    const seed = new Set<number>();
    const fired = new Set<number>();
    for (let i = 0; i < sp.length; i++) {
      if (!isBooster(sp[i])) continue;
      fired.add(i);
      const target = sp[i] === 'magnet' ? pickNearestTileTier(this.field, i, Math.random) : null;
      for (const c of boosterTargets(this.field, i, target)) seed.add(c);
    }
    if (!seed.size) return;
    expandClearWithSpecials(this.field, seed, Math.random, fired);
    await this.pulseBoosters([...fired]); // заспавненные бустеры «заводятся» перед авто-взрывом
    await this.applyAndAnimate(seed, { origin, mode: 'radial' });
  }

  /** applyClear (без спавнов) + анимация шага (с опц. таймингом сбора). */
  private async applyAndAnimate(seed: Set<number>, timing?: ClearTiming): Promise<void> {
    const step = applyClear(this.field, seed, [], balance.tierCount, Math.random);
    await this.animateStep(step, timing);
  }

  /** Анимировать обмен элементов двух клеток + переставить их в карте. */
  private async swapTilesVisual(a: number, b: number): Promise<void> {
    const ta = this.tileByIndex.get(a);
    const tb = this.tileByIndex.get(b);
    const ca = this.cellCenter(a);
    const cb = this.cellCenter(b);
    if (ta) this.animTransform(ta, centerTransform(ca.x, ca.y, 1), centerTransform(cb.x, cb.y, 1), anim.swapMs, EASE_OUT);
    if (tb) this.animTransform(tb, centerTransform(cb.x, cb.y, 1), centerTransform(ca.x, ca.y, 1), anim.swapMs, EASE_OUT);
    if (ta) this.tileByIndex.set(b, ta); else this.tileByIndex.delete(b);
    if (tb) this.tileByIndex.set(a, tb); else this.tileByIndex.delete(a);
    await this.delay(anim.swapMs);
  }

  /** Каскад натуральных матчей; `moved` — клетки свапа (anchor спавна бустера на 1-м шаге). */
  private async runNaturalCascade(moved?: number[]): Promise<void> {
    let first = true;
    while (true) {
      const s = resolveStep(this.field, balance.tierCount, Math.random, first ? moved : undefined);
      first = false;
      if (!s) break;
      await this.animateStep(s);
    }
  }

  /**
   * Анимация одного шага каскада: pop схлопнутых (тайминг по `timing`: radial — от ближних к
   * дальним; instant — сразу; иначе — по порядку) → собранные 💎/⚡ улетают → спавн → гравитация.
   */
  private async animateStep(step: CascadeStep, timing?: ClearTiming): Promise<void> {
    const center = this.centroidOf(step.cleared.length ? step.cleared : step.spawns.map((s) => s.idx));

    // Собранные алмазы/молнии — не «лопаются», а улетают в баланс/энергию.
    const collectedSet = new Set(step.collected.map((c) => c.idx));
    for (const c of step.collected) {
      const tile = this.tileByIndex.get(c.idx);
      this.tileByIndex.delete(c.idx);
      if (tile) tile.remove();
      this.flyCollectible(c.idx, c.kind);
    }

    const popDelay = this.popDelayFn(step.cleared, timing);
    let maxPop = 0;
    if (timing && (timing.mode === 'radial' || timing.delays)) for (const idx of step.cleared) maxPop = Math.max(maxPop, popDelay(idx, 0));
    const gravityDelay = maxPop; // гравитация — после волны pop'ов (для каскада/instant = 0)

    step.cleared.forEach((idx, k) => {
      if (collectedSet.has(idx)) return; // собрано отдельно (полёт)
      const tile = this.tileByIndex.get(idx);
      this.tileByIndex.delete(idx);
      if (!tile) return;
      const c = this.cellCenter(idx);
      const a = tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), opacity: 1 },
          { transform: centerTransform(c.x, c.y, 1.22), opacity: 1, offset: 0.35 },
          { transform: centerTransform(c.x, c.y, 0.1), opacity: 0 },
        ],
        { duration: anim.popMs, delay: popDelay(idx, k), easing: EASE_OUT, fill: 'both' },
      );
      a.onfinish = () => tile.remove();
    });
    playCollectFx(this.panel, this.iconSize, center);

    this.callbacks.onCascadeStep(step.clearedTiers, step.groups);

    // Спавны: бустеры из матчей + награды открытых сейфов (booster или collectible). После волны pop'ов.
    const fromSet = new Set(step.falls.map((f) => f.from));
    const fallTo = new Map<number, number>();
    for (const f of step.falls) fallTo.set(f.from, f.to);
    const openedSet = new Set(step.opened.map((o) => o.idx));
    // Открытые сейфы, ПАДАЮЩИЕ по гравитации (под ними схлопнулось): сейф едет в точку приземления и
    // раскрывается ТАМ — награда баунсит на месте приземления, а не на старом месте сейфа (см. mover-цикл).
    const openFalls = new Map<number, { rewardTile: HTMLElement; landIdx: number }>();
    for (const s of step.spawns) {
      const opened = openedSet.has(s.idx);
      const willFall = fromSet.has(s.idx);
      if (opened && willFall) {
        const landIdx = fallTo.get(s.idx) as number;
        const rewardTile = isCollectible(s.kind) ? this.makeCollectibleTile(landIdx, s.kind) : this.makeBoosterTile(landIdx, s.kind);
        openFalls.set(s.idx, { rewardTile, landIdx }); // тайл сейфа НЕ трогаем — упадёт и раскроется в mover-цикле
        continue;
      }
      const c = this.cellCenter(s.idx);
      const old = this.tileByIndex.get(s.idx);
      if (opened && old) {
        // 🎁 Сейф на месте (не падает) ОТКРЫВАЕТСЯ: чуть сжимается, затем растворяется + радиальная вспышка.
        old.animate(
          [
            { transform: centerTransform(c.x, c.y, 1), opacity: 1, offset: 0 },
            { transform: centerTransform(c.x, c.y, 0.8), opacity: 1, offset: 0.35 },
            { transform: centerTransform(c.x, c.y, 1.45), opacity: 0, offset: 1 },
          ],
          { duration: anim.safeOpenMs, delay: gravityDelay, easing: EASE_OUT, fill: 'backwards' },
        );
        window.setTimeout(() => old.remove(), gravityDelay + anim.safeOpenMs + 40);
        this.safeFlash(s.idx, gravityDelay + anim.safeOpenMs * 0.35);
      } else if (old) {
        old.remove();
      }
      const tile = isCollectible(s.kind) ? this.makeCollectibleTile(s.idx, s.kind) : this.makeBoosterTile(s.idx, s.kind);
      this.tileByIndex.set(s.idx, tile);
      // Награда сейфа на месте появляется ПОСЛЕ растворения, с баунсом; бустер из матча, если падает — его двигает mover-цикл.
      const spawnDelay = opened ? gravityDelay + anim.safeOpenMs * 0.7 : gravityDelay;
      const frames = opened
        ? [
            { transform: centerTransform(c.x, c.y, 0.1), opacity: 0, offset: 0 },
            { transform: centerTransform(c.x, c.y, 1.3), opacity: 1, offset: 0.55 },
            { transform: centerTransform(c.x, c.y, 0.9), offset: 0.78 },
            { transform: centerTransform(c.x, c.y, 1), offset: 1 },
          ]
        : [
            { transform: centerTransform(c.x, c.y, 0.2), opacity: 0 },
            { transform: centerTransform(c.x, c.y, 1.18), opacity: 1, offset: 0.6 },
            { transform: centerTransform(c.x, c.y, 1) },
          ];
      if (!willFall) tile.animate(frames, { duration: opened ? Math.round(anim.spawnMs * 1.35) : anim.spawnMs, delay: spawnDelay, easing: EASE_OUT, fill: 'backwards' });
    }

    // Гравитация + досыпка — РЕАКЦИЯ-каскадом (anim.reactionMs): когда снизу освобождается слот,
    // предмет над ним стартует через reactionMs; стартовав, он сам освобождает место → ещё через
    // reactionMs стартует следующий над ним (по столбцу снизу вверх). Уцелевшие и досыпка — ОДИН
    // непрерывный каскад на столбец (досыпка сыплется сверху по одному, а не вся разом).
    const oldMap = this.tileByIndex;
    const newMap = new Map<number, HTMLElement>();
    for (const [idx, tile] of oldMap) if (!fromSet.has(idx)) newMap.set(idx, tile);
    // Награды падающих сейфов — финальные обитатели клеток приземления (раскрываются по приезде сейфа).
    for (const { rewardTile, landIdx } of openFalls.values()) newMap.set(landIdx, rewardTile);

    const cols = this.field.cols;
    const startY = -this.cellH * 0.5; // досыпка появляется у верхнего края поля (не «висит» высоко сверху)
    type Mover =
      | { col: number; destRow: number; kind: 'fall'; tile: HTMLElement; fromX: number; fromY: number; toX: number; toY: number; open?: { rewardTile: HTMLElement; landIdx: number } }
      | { col: number; destRow: number; kind: 'refill'; tile: HTMLElement; toX: number; toY: number };
    const byCol = new Map<number, Mover[]>();
    const pushMover = (m: Mover): void => { let a = byCol.get(m.col); if (!a) { a = []; byCol.set(m.col, a); } a.push(m); };

    for (const f of step.falls) {
      const tile = oldMap.get(f.from);
      if (!tile) continue;
      const open = openFalls.get(f.from); // падающий сейф → его тайл едет, награда уже сидит в newMap[landIdx]
      if (!open) newMap.set(f.to, tile);
      const from = this.cellCenter(f.from);
      const to = this.cellCenter(f.to);
      pushMover({ col: f.to % cols, destRow: Math.floor(f.to / cols), kind: 'fall', tile, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, open });
    }
    for (const r of step.refills) {
      const to = this.cellCenter(r.idx);
      const tile = r.kind ? this.makeCollectibleTile(r.idx, r.kind as CollectibleKind) : this.makeTile(r.idx, r.tier as Tier);
      newMap.set(r.idx, tile);
      pushMover({ col: r.idx % cols, destRow: Math.floor(r.idx / cols), kind: 'refill', tile, toX: to.x, toY: to.y });
    }

    let maxDur = anim.popMs;
    for (const arr of byCol.values()) {
      arr.sort((p, q) => q.destRow - p.destRow); // ниже (бОльший destRow) — стартует первым
      arr.forEach((m, k) => {
        const delay = gravityDelay + k * anim.reactionMs; // каждый над предыдущим — на reactionMs позже
        if (m.kind === 'fall') {
          const dur = Math.abs(m.toY - m.fromY) / anim.fallSpeed;
          this.animTransform(m.tile, centerTransform(m.fromX, m.fromY, 1), centerTransform(m.toX, m.toY, 1), dur, 'linear', delay);
          if (m.open) {
            // Сейф доехал до места приземления → раскрывается ТУТ: растворяется, вспышка, награда баунсит здесь же.
            this.openSafeAt(m.tile, m.open.rewardTile, m.toX, m.toY, m.open.landIdx, delay + dur);
            maxDur = Math.max(maxDur, k * anim.reactionMs + dur + anim.safeOpenMs * 0.7 + Math.round(anim.spawnMs * 1.35));
          } else {
            maxDur = Math.max(maxDur, k * anim.reactionMs + dur);
          }
        } else {
          const dur = Math.abs(m.toY - startY) / anim.fallSpeed; // та же скорость, что у падения уцелевших
          maxDur = Math.max(maxDur, k * anim.reactionMs + dur);
          m.tile.animate(
            [
              { transform: centerTransform(m.toX, startY, 1), opacity: 0, offset: 0 },
              { transform: centerTransform(m.toX, startY, 1), opacity: 1, offset: 0.05 },
              { transform: centerTransform(m.toX, m.toY, 1), opacity: 1, offset: 1 },
            ],
            { duration: dur, delay, easing: 'linear', fill: 'backwards' },
          );
        }
      });
    }
    this.tileByIndex = newMap;

    await this.delay(gravityDelay + maxDur + 30);
  }

  /** Задержка pop'а клетки: radial — по дистанции от origin (ближние раньше); instant — 0; иначе — по порядку. */
  private popDelayFn(cleared: number[], timing?: ClearTiming): (idx: number, k: number) => number {
    if (!timing) return (_i, k) => Math.min(k, 6) * anim.popMs * 0.06;
    if (timing.delays) { const m = timing.delays; return (idx) => m.get(idx) ?? 0; }
    if (timing.mode === 'instant') return () => 0;
    const origin = timing.origin;
    if (origin == null) return (_i, k) => Math.min(k, 6) * anim.popMs * 0.06;
    const oc = this.cellCenter(origin);
    const dist = new Map<number, number>();
    let maxD = 0;
    for (const idx of cleared) {
      const cc = this.cellCenter(idx);
      const d = Math.hypot(cc.x - oc.x, cc.y - oc.y) / this.strideX;
      dist.set(idx, d);
      if (d > maxD) maxD = d;
    }
    const stepMs = maxD > 0 ? (timing.span ?? anim.boosterWaveMs) / maxD : 0;
    return (idx) => (dist.get(idx) ?? 0) * stepMs;
  }

  /** Полёт собранного 💎/⚡ из клетки в карту баланса / пилюлю энергии (начисление — в конце, callback). */
  private flyCollectible(idx: number, kind: CollectibleKind): void {
    if (kind === 'safe') return;
    const cc = this.cellCenter(idx);
    const fromX = PANEL_LEFT + cc.x, fromY = PANEL_TOP + cc.y;
    const target = kind === 'diamond' ? DIAMOND_TARGET : ENERGY_TARGET;
    const sprite = el('img', {
      cls: 'board-collect-fly',
      style: `width:${this.iconSize}px;height:${this.iconSize}px;`,
      parent: this.stageEl,
    }) as HTMLImageElement;
    sprite.src = kind === 'diamond' ? 'assets/hud/icon-diamond.png' : 'assets/hud/icon-energy.svg';
    sprite.alt = ''; sprite.draggable = false;
    const a = sprite.animate(
      [
        { transform: centerTransform(fromX, fromY, 1), opacity: 1, offset: 0 },
        { transform: centerTransform(fromX, fromY - 10, 1.25), opacity: 1, offset: 0.18 },
        { transform: centerTransform(target.x, target.y, 0.5), opacity: 0.25 },
      ],
      { duration: anim.collectFlyMs, easing: 'cubic-bezier(0.5,0,0.7,1)', fill: 'forwards' },
    );
    a.onfinish = () => { sprite.remove(); this.callbacks.onCollect(kind, fromX, fromY); };
  }

  /** Прогнать стартовые матчи (загруженное поле) без денег/анимации + гарантировать ход. */
  private settleInitial(): void {
    let guard = 0;
    while (hasMatchAny(this.field) && guard++ < 80) {
      const m = findMatches(this.field);
      applyClear(this.field, m.cleared, m.spawns, balance.tierCount, Math.random);
    }
    this.ensureSolvable();
    this.rebuildTiles();
  }

  /** Если ходов нет — перемешать (и снять возникшие матчи) до появления хода. */
  private ensureSolvable(): void {
    if (hasAnyValidMove(this.field)) return;
    let guard = 0;
    do {
      shuffleBoard(this.field, Math.random);
      let s = 0;
      while (hasMatchAny(this.field) && s++ < 80) {
        const m = findMatches(this.field);
        applyClear(this.field, m.cleared, m.spawns, balance.tierCount, Math.random);
      }
    } while (!hasAnyValidMove(this.field) && guard++ < 50);
    this.rebuildTiles();
  }

  private animTransform(node: HTMLElement, from: string, to: string, dur: number, easing: string, delay = 0): void {
    node.style.transform = to;
    node.animate([{ transform: from }, { transform: to }], { duration: dur, easing, delay, fill: 'backwards' });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  private setSelected(idx: number, on: boolean): void {
    const cell = this.cellEls[idx];
    if (cell) cell.classList.toggle('sel', on);
  }

  private clearSelection(): void {
    for (const cell of this.cellEls) cell.classList.remove('sel');
  }

  /** Внешний триггер rebuild — после действий dev-панели и т.п. */
  refillAndRebuild(): void {
    this.settleInitial();
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
  }
}

function isMagnet(k: SpecialKind): boolean { return k === 'magnet'; }
