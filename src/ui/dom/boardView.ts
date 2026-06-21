// Поле классического match-3 (экран Hamster Bank): синяя база + сетка 6×5 светлых плашек.
//
// Ввод: игрок ЗАЖИМАЕТ плитку и СВАЙПАЕТ к ортогональному соседу → они меняются местами.
// Если обмен создал линию 3+ или квадрат 2×2 — поле разрешается каскадами (схлоп → деньги
// в Баланс → бустеры за СЛОЖНЫЙ матч (T/L → 💣, 2×2 → 🚀, линия-5 → 🧲) → гравитация и
// досыпка → повтор, комбо растёт). Свайп бустера с любым соседом «применяет» его (оба бустера
// срабатывают, если свайпнуты друг с другом). Свап без матча откатывается. Бустеры на поле — ДА
// (плюс есть кнопки-бустеры внизу). Логика поля — core/match3.ts; здесь — ввод и анимации.

import type { FieldState, Tier, SpecialKind } from '../../types';
import type { CascadeStep } from '../../core/match3';
import { idxToXY, isValidTier, xyToIdx, getSpecial } from '../../core/board';
import { balance } from '../../config/balance';
import {
  areOrthoNeighbors, swapCells, hasMatchAny, findMatches, applyClear, resolveStep,
  boosterTargets, pickNearestTileTier, expandClearWithSpecials, hasAnyValidMove,
} from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { playCollectFx } from './match3Fx';

export interface BoardViewCallbacks {
  /** Можно ли сделать ход (хватает ли энергии). false → свайп игнорируется. */
  canMove(): boolean;
  /** Шаг каскада схлопнут: tiers — схлопнутые тиры (накопление денег), naturalGroups —
   *  число натуральных матч-групп в шаге (для комбо). */
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
// Зона плашек (cells/tiles) — база + инсет 9px.
const PANEL_LEFT = BASE_LEFT + 9; // 16
const PANEL_TOP = BASE_TOP + 9;   // 351
const PANEL_W = 358;              // 6 × ~59.7
const PANEL_H = 298;              // 5 × 59.6

const EASE_OUT = 'cubic-bezier(0.22,0.61,0.36,1)';
const EASE_FALL = 'cubic-bezier(0.45,0,0.7,0.25)';
const SWAP_DUR = 150;

export class BoardView {
  private cellW: number;
  private cellH: number;
  private iconSize: number;
  private panel: HTMLDivElement;
  private cellEls: HTMLDivElement[] = [];
  private tileByIndex = new Map<number, HTMLElement>();
  private busy = false;

  // Жест свайпа.
  private downIdx = -1;
  private downLocal = { x: 0, y: 0 };
  private gestureUsed = false;

  constructor(
    stage: HTMLElement,
    private field: FieldState,
    private callbacks: BoardViewCallbacks,
  ) {
    this.cellW = PANEL_W / field.cols;
    this.cellH = PANEL_H / field.rows;
    this.iconSize = Math.min(this.cellW, this.cellH) - 2;

    // Синяя база поля (под плашками).
    el('div', { cls: 'hb-board-base', style: `left:${BASE_LEFT}px;top:${BASE_TOP}px;width:${BASE_W}px;height:${BASE_H}px;`, parent: stage });

    this.panel = el('div', {
      cls: 'board-panel',
      style: `left:${PANEL_LEFT}px;top:${PANEL_TOP}px;width:${PANEL_W}px;height:${PANEL_H}px;`,
      parent: stage,
    });

    this.buildCells();
    this.settleInitial();   // убрать случайные матчи из загруженного поля + гарантировать ход

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
        style: `left:${x * this.cellW + 1}px;top:${y * this.cellH + 1}px;width:${this.cellW - 2}px;height:${this.cellH - 2}px;`,
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

  /** Создать бустер-объект на поле (PNG-иконка + пульс-рамка; ⇆/⇅ для ракеты). */
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
    return { x: x * this.cellW + this.cellW / 2, y: y * this.cellH + this.cellH / 2 };
  }

  private centroidOf(indices: number[]): { x: number; y: number } {
    if (!indices.length) return { x: PANEL_W / 2, y: PANEL_H / 2 };
    let sx = 0, sy = 0;
    for (const i of indices) { const c = this.cellCenter(i); sx += c.x; sy += c.y; }
    return { x: sx / indices.length, y: sy / indices.length };
  }

  /** Перевод координат указателя (screen) в panel-local design-координаты. */
  private pointerToLocal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.panel.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * PANEL_W,
      y: ((clientY - rect.top) / rect.height) * PANEL_H,
    };
  }

  private localToCell(localX: number, localY: number): number {
    const cx = Math.floor(localX / this.cellW);
    const cy = Math.floor(localY / this.cellH);
    if (cx < 0 || cy < 0 || cx >= this.field.cols || cy >= this.field.rows) return -1;
    return xyToIdx(cx, cy, this.field.cols);
  }

  // ─── Ввод (свайп-обмен) ─────────────────────────────────────────────────────

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
    if (nx < 0 || ny < 0 || nx >= this.field.cols || ny >= this.field.rows) return; // край — ждём другого направления

    this.gestureUsed = true;
    const a = this.downIdx;
    const b = xyToIdx(nx, ny, this.field.cols);
    this.setSelected(a, false);
    this.downIdx = -1;
    void this.trySwap(a, b);
  };

  private onPointerUp = (): void => {
    if (this.downIdx !== -1) this.setSelected(this.downIdx, false);
    this.downIdx = -1;
  };

  // ─── Свап + разрешение поля ──────────────────────────────────────────────────

  private async trySwap(a: number, b: number): Promise<void> {
    if (this.busy || !areOrthoNeighbors(a, b, this.field.cols)) return;
    if (!this.callbacks.canMove()) return; // нет энергии — ход недоступен
    this.busy = true;

    const sp = getSpecial(this.field);
    const aSpec = sp[a];
    const bSpec = sp[b];

    if (aSpec || bSpec) {
      // Свайп бустера активирует его (матч не нужен). Оба бустера → оба срабатывают.
      // Магнит: цель = тир соседней плитки, иначе (сосед — бустер) случайная ближайшая плитка.
      const seed = new Set<number>();
      const fired = new Set<number>();
      const fire = (self: number, partner: number): void => {
        let target: Tier | null = null;
        if (sp[self] === 'magnet') {
          const partnerTier = this.field.cells[partner];
          target = isValidTier(partnerTier) ? partnerTier : pickNearestTileTier(this.field, self, Math.random);
        }
        fired.add(self);
        for (const c of boosterTargets(this.field, self, target)) seed.add(c);
      };
      if (aSpec) fire(a, b);
      if (bSpec) fire(b, a);
      expandClearWithSpecials(this.field, seed, Math.random, fired); // цепная реакция остальных
      const seedStep = applyClear(this.field, seed, [], balance.tierCount, Math.random);
      await this.animateStep(seedStep);
      await this.runNaturalCascade();
    } else if (isValidTier(this.field.cells[a]) && isValidTier(this.field.cells[b])) {
      // Обмен: меняем, проверяем матч, при отсутствии — откат.
      swapCells(this.field, a, b);
      await this.swapTilesVisual(a, b);
      if (hasMatchAny(this.field)) {
        await this.runNaturalCascade([a, b]);
      } else {
        swapCells(this.field, a, b);
        await this.swapTilesVisual(a, b); // анимация назад
      }
    }

    this.callbacks.onMoveEnd(); // поле остановилось — зафиксировать накопленное в Баланс
    this.ensureSolvable();
    this.busy = false;
    this.callbacks.onPersist();
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

  /**
   * Каскад натуральных матчей поля; `moved` — клетки свапа (anchor спавна бустера на 1-м шаге).
   * Комбо считается по числу матч-групп каждого шага (см. GameApp.onCascadeStep).
   */
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

    // 1) Pop схлопнутых плиток.
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

    // 2) Передать шаг в GameApp для накопления денег + комбо (показ — над полем).
    this.callbacks.onCascadeStep(step.clearedTiers, step.groups);

    // 2.5) Anchor-клетки сложных матчей становятся бустерами на поле (заменяем плитку объектом).
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

    // 3) Гравитация (падения уцелевших) + досыпка сверху.
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

  /** Анимировать transform от→к (оба keyframe явные); финальный inline = to. */
  private animTransform(node: HTMLElement, from: string, to: string, dur: number, easing: string): void {
    node.style.transform = to;
    node.animate([{ transform: from }, { transform: to }], { duration: dur, easing });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  // ─── Подсветка выбора ───────────────────────────────────────────────────────

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
