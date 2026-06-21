// Поле классического match-3 (экран Hamster Bank): синяя база + сетка 6×5 светлых плашек (58×58, шаг 60).
//
// Ввод: СВАЙП к ортогональному соседу → обмен; линия 3+/квадрат 2×2 → каскад (схлоп → деньги →
// бустер за сложный матч → гравитация → повтор). Свап без матча откатывается.
//
// БУСТЕРЫ на поле (T/L→💣, 2×2→🚀, линия-5→🧲):
//  • активируются ПОСЛЕ перемещения (свайп: бустер переезжает на клетку соседа и срабатывает там),
//    либо ТАПОМ (без свайпа — срабатывает на своей клетке);
//  • комбо двух бустеров (по месту, куда переехал перетаскиваемый): 💣+💣 → взрыв 5×5;
//    💣+🚀 → 3 ряда + 3 столбца; 🚀+🚀 → крест (ряд+столбец); 🧲+🧲 → ВСЁ поле;
//    🧲+💣/🚀 → собрать случайный тир, на их месте заспавнить бустер-партнёр и через 0.5с взорвать всё.
//
// Логика поля — core/match3.ts; здесь — ввод и анимации. Координаты — дизайн-холст 390×844.

import type { FieldState, Tier, SpecialKind } from '../../types';
import type { CascadeStep, MatchSpawn } from '../../core/match3';
import { idxToXY, isValidTier, xyToIdx, getSpecial } from '../../core/board';
import { balance } from '../../config/balance';
import {
  areOrthoNeighbors, swapCells, hasMatchAny, findMatches, applyClear, resolveStep,
  boosterTargets, pickNearestTileTier, expandClearWithSpecials, hasAnyValidMove,
  cellsInSquare, cellsInRows, cellsInCols, pickRandomPresentTier,
} from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { playCollectFx } from './match3Fx';

export interface BoardViewCallbacks {
  /** Можно ли сделать ход (хватает ли энергии). false → свайп/тап игнорируется. */
  canMove(): boolean;
  /** Шаг каскада схлопнут: tiers — схлопнутые тиры (деньги), naturalGroups — число матч-групп (комбо). */
  onCascadeStep(tiers: Tier[], naturalGroups: number): void;
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
const EASE_FALL = 'cubic-bezier(0.45,0,0.7,0.25)';
const SWAP_DUR = 150;

export class BoardView {
  private cellW: number;   // размер плашки (квадрат)
  private cellH: number;
  private strideX: number; // шаг между плашками (плашка + GAP)
  private strideY: number;
  private iconSize: number;
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

  /** Полный rebuild всех объектов по field (плитки + бустеры на поле). */
  rebuildTiles(): void {
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
    const sp = getSpecial(this.field);
    for (let i = 0; i < this.field.cells.length; i++) {
      const kind = sp[i];
      const cell = this.field.cells[i];
      if (kind) this.tileByIndex.set(i, this.makeBoosterTile(i, kind));
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
  private makeBoosterTile(idx: number, kind: SpecialKind): HTMLElement {
    const c = this.cellCenter(idx);
    const base = kind === 'bomb' ? 'bomb' : kind === 'magnet' ? 'magnet' : 'rocket';
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
    // Тап (без свайпа) по бустеру → активировать на его клетке.
    if (!this.gestureUsed && getSpecial(this.field)[idx]) void this.tapBooster(idx);
  };

  // ─── Свайп: обмен / активация бустера ПОСЛЕ перемещения ──────────────────────

  private async trySwap(a: number, b: number): Promise<void> {
    if (this.busy || !areOrthoNeighbors(a, b, this.field.cols)) return;
    if (!this.callbacks.canMove()) return; // нет энергии — ход недоступен
    this.busy = true;

    const sp = getSpecial(this.field);
    const aSpec = sp[a];
    const bSpec = sp[b];

    if (aSpec || bSpec) {
      // Сначала ПЕРЕМЕЩЕНИЕ (обмен a↔b), затем активация на новых местах.
      swapCells(this.field, a, b);
      await this.swapTilesVisual(a, b);
      await this.resolveBoosterActivation(a, b); // dest перетаскиваемого = b
    } else if (isValidTier(this.field.cells[a]) && isValidTier(this.field.cells[b])) {
      swapCells(this.field, a, b);
      await this.swapTilesVisual(a, b);
      if (hasMatchAny(this.field)) {
        await this.runNaturalCascade([a, b]);
      } else {
        swapCells(this.field, a, b);
        await this.swapTilesVisual(a, b); // откат
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
    if (!kind) return;
    this.busy = true;
    const target = kind === 'magnet' ? pickNearestTileTier(this.field, idx, Math.random) : null;
    const seed = new Set<number>();
    for (const c of boosterTargets(this.field, idx, target)) seed.add(c);
    expandClearWithSpecials(this.field, seed, Math.random, new Set([idx]));
    await this.applyAndAnimate(seed);
    await this.runNaturalCascade();
    this.callbacks.onMoveEnd();
    this.ensureSolvable();
    this.busy = false;
    this.callbacks.onPersist();
  }

  /** Активация бустера(ов) после свапа (a и b — уже обменянные клетки; dest = b). */
  private async resolveBoosterActivation(a: number, b: number): Promise<void> {
    const sp = getSpecial(this.field);
    const ka = sp[a];
    const kb = sp[b];
    if (ka && kb) { await this.boosterCombo(a, b, ka, kb); return; } // оба бустера → комбо

    // Один бустер + плитка: активируем бустер на его клетке, цель магнита — тир плитки.
    const self = ka ? a : b;
    const partner = ka ? b : a;
    const kind = sp[self];
    if (!kind) return;
    let target: Tier | null = null;
    if (kind === 'magnet') {
      const pt = this.field.cells[partner];
      target = isValidTier(pt) ? pt : pickNearestTileTier(this.field, self, Math.random);
    }
    const seed = new Set<number>();
    for (const c of boosterTargets(this.field, self, target)) seed.add(c);
    expandClearWithSpecials(this.field, seed, Math.random, new Set([self]));
    await this.applyAndAnimate(seed);
    await this.runNaturalCascade();
  }

  /** Комбо двух бустеров. dest (куда переехал перетаскиваемый) = b. */
  private async boosterCombo(a: number, b: number, ka: SpecialKind, kb: SpecialKind): Promise<void> {
    const isM = (k: SpecialKind): boolean => k === 'magnet';
    const isB = (k: SpecialKind): boolean => k === 'bomb';
    const isR = (k: SpecialKind): boolean => k === 'rocket-h' || k === 'rocket-v';

    if (isM(ka) && isM(kb)) { await this.clearWholeBoard(); return; }     // 🧲+🧲 → всё поле
    if (isM(ka) || isM(kb)) { await this.magnetCombo(a, b, ka, kb); return; } // 🧲+💣/🚀

    const seed = new Set<number>([a, b]);
    if (isB(ka) && isB(kb)) {
      for (const c of cellsInSquare(this.field, b, 2)) seed.add(c);       // 💣+💣 → 5×5
    } else if ((isB(ka) && isR(kb)) || (isR(ka) && isB(kb))) {
      for (const c of cellsInRows(this.field, b, 1)) seed.add(c);        // 💣+🚀 → 3 ряда…
      for (const c of cellsInCols(this.field, b, 1)) seed.add(c);        // …+ 3 столбца
    } else {
      for (const c of cellsInRows(this.field, b, 0)) seed.add(c);        // 🚀+🚀 → крест
      for (const c of cellsInCols(this.field, b, 0)) seed.add(c);
    }
    expandClearWithSpecials(this.field, seed, Math.random, new Set([a, b]));
    await this.applyAndAnimate(seed);
    await this.runNaturalCascade();
  }

  /** 🧲+🧲 — собрать ВСЁ поле разом. */
  private async clearWholeBoard(): Promise<void> {
    const seed = new Set<number>();
    for (let i = 0; i < this.field.cells.length; i++) seed.add(i);
    await this.applyAndAnimate(seed);
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
    await this.animateStep(step);
    await this.delay(500);
    await this.detonateAllBoosters(); // авто-взрыв всех заспавненных бустеров
    await this.runNaturalCascade();
  }

  /** Взорвать ВСЕ бустеры, что сейчас на поле (финал магнит-комбо). */
  private async detonateAllBoosters(): Promise<void> {
    const sp = getSpecial(this.field);
    const seed = new Set<number>();
    const fired = new Set<number>();
    for (let i = 0; i < sp.length; i++) {
      if (!sp[i]) continue;
      fired.add(i);
      const target = sp[i] === 'magnet' ? pickNearestTileTier(this.field, i, Math.random) : null;
      for (const c of boosterTargets(this.field, i, target)) seed.add(c);
    }
    if (!seed.size) return;
    expandClearWithSpecials(this.field, seed, Math.random, fired);
    await this.applyAndAnimate(seed);
  }

  /** applyClear (без спавнов) + анимация шага. */
  private async applyAndAnimate(seed: Set<number>): Promise<void> {
    const step = applyClear(this.field, seed, [], balance.tierCount, Math.random);
    await this.animateStep(step);
  }

  /** Анимировать обмен элементов двух клеток + переставить их в карте. */
  private async swapTilesVisual(a: number, b: number): Promise<void> {
    const ta = this.tileByIndex.get(a);
    const tb = this.tileByIndex.get(b);
    const ca = this.cellCenter(a);
    const cb = this.cellCenter(b);
    if (ta) this.animTransform(ta, centerTransform(ca.x, ca.y, 1), centerTransform(cb.x, cb.y, 1), SWAP_DUR, EASE_OUT);
    if (tb) this.animTransform(tb, centerTransform(cb.x, cb.y, 1), centerTransform(ca.x, ca.y, 1), SWAP_DUR, EASE_OUT);
    if (ta) this.tileByIndex.set(b, ta); else this.tileByIndex.delete(b);
    if (tb) this.tileByIndex.set(a, tb); else this.tileByIndex.delete(a);
    await this.delay(SWAP_DUR);
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

  /** Анимация одного шага каскада: pop схлопнутых → спавн бустеров → гравитация/досыпка. */
  private async animateStep(step: CascadeStep): Promise<void> {
    const center = this.centroidOf(step.cleared.length ? step.cleared : step.spawns.map((s) => s.idx));

    step.cleared.forEach((idx, k) => {
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
        { duration: 230, delay: Math.min(k, 6) * 14, easing: EASE_OUT, fill: 'forwards' },
      );
      a.onfinish = () => tile.remove();
    });
    playCollectFx(this.panel, this.iconSize, center);

    this.callbacks.onCascadeStep(step.clearedTiers, step.groups);

    // Anchor-клетки сложных матчей становятся бустерами на поле.
    for (const s of step.spawns) {
      const old = this.tileByIndex.get(s.idx);
      if (old) old.remove();
      const tile = this.makeBoosterTile(s.idx, s.kind);
      this.tileByIndex.set(s.idx, tile);
      const c = this.cellCenter(s.idx);
      tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 0.2), opacity: 0 },
          { transform: centerTransform(c.x, c.y, 1.18), opacity: 1, offset: 0.6 },
          { transform: centerTransform(c.x, c.y, 1) },
        ],
        { duration: 280, easing: EASE_OUT },
      );
    }

    // Гравитация (падения уцелевших) + досыпка сверху.
    const oldMap = this.tileByIndex;
    const newMap = new Map<number, HTMLElement>();
    const fromSet = new Set(step.falls.map((f) => f.from));
    for (const [idx, tile] of oldMap) if (!fromSet.has(idx)) newMap.set(idx, tile);

    let maxDur = 230;
    for (const f of step.falls) {
      const tile = oldMap.get(f.from);
      if (!tile) continue;
      newMap.set(f.to, tile);
      const from = this.cellCenter(f.from);
      const to = this.cellCenter(f.to);
      const dur = 150 + Math.abs(to.y - from.y) * 1.6;
      maxDur = Math.max(maxDur, dur);
      this.animTransform(tile, centerTransform(from.x, from.y, 1), centerTransform(to.x, to.y, 1), dur, EASE_FALL);
    }
    for (const r of step.refills) {
      const to = this.cellCenter(r.idx);
      const startY = -this.cellH * 0.6;
      const tile = this.makeTile(r.idx, r.tier);
      const dur = 190 + Math.abs(to.y - startY) * 1.3;
      maxDur = Math.max(maxDur, dur);
      this.animTransform(tile, centerTransform(to.x, startY, 1), centerTransform(to.x, to.y, 1), dur, EASE_FALL);
      newMap.set(r.idx, tile);
    }
    this.tileByIndex = newMap;

    await this.delay(maxDur + 30);
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

  private animTransform(node: HTMLElement, from: string, to: string, dur: number, easing: string): void {
    node.style.transform = to;
    node.animate([{ transform: from }, { transform: to }], { duration: dur, easing });
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
