// Поле классического match-3: декоративный стол + сетка 5×5.
//
// Ввод: игрок ЗАЖИМАЕТ плитку и СВАЙПАЕТ к ортогональному соседу → они меняются
// местами. Если обмен создал линию 3+ или квадрат 2×2 — поле разрешается каскадами
// (схлоп → деньги в Баланс → спецтайлы за 2×2/линию-5 → гравитация и досыпка →
// повтор). Свайп со спецтайлом «применяет» его (без обмена). Свап без матча
// откатывается. Логика поля — pure-функции core/match3.ts; здесь — ввод и анимации.

import type { FieldState, Tier, SpecialKind } from '../../types';
import type { CascadeStep } from '../../core/match3';
import { idxToXY, isValidTier, xyToIdx, getSpecial } from '../../core/board';
import { balance } from '../../config/balance';
import {
  areOrthoNeighbors, swapCells, hasMatchAny, findMatches, applyClear, resolveStep,
  activateSpecial, hasAnyValidMove,
} from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { formatMoney } from '../../core/money';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { playCollectFx } from './match3Fx';

export interface BoardViewCallbacks {
  /** Шаг каскада собран. tiers — схлопнутые тиры, comboLevel — уровень комбо (0 = без комбо,
   *  1 = «Комбо», 2 = «Комбо ×2», …; считаются только натуральные матч-шаги), spawnedSpecial —
   *  родился ли спецтайл. Возвращает начисленную сумму (для попа «+$N»). */
  onCollected(tiers: Tier[], comboLevel: number, spawnedSpecial: boolean): number;
  onPersist(): void;
}

// Геометрия Merge-zone из макета (координаты #stage 384×844).
const PANEL_LEFT = 13;
const PANEL_TOP = 299;
const PANEL_W = 360;
const PANEL_H = 360; // 5×5 → квадратные ячейки 72×72 (ширина поля сохранена ≈360)

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
  private comboNatural = 0; // натуральные матч-шаги текущего хода (для комбо; спецтайлы не считаются)

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

    // Декоративный стол (3 слоя). Сетка лежит поверх.
    el('div', { cls: 'desk-edge', style: 'left:6px;top:293px;width:372px;height:371px;', parent: stage });
    el('div', { cls: 'desk-top', style: 'left:6px;top:293px;width:372px;height:367px;', parent: stage });
    el('div', { cls: 'desk-inner', style: 'left:12px;top:298px;width:362px;height:362px;', parent: stage });

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
        style: `left:${x * this.cellW + 0.5}px;top:${y * this.cellH + 0.5}px;width:${this.cellW - 1}px;height:${this.cellH - 1}px;`,
        parent: this.panel,
      });
      this.cellEls.push(cell);
    }
  }

  /** Полный rebuild всех плиток по field (включая спецтайлы). */
  rebuildTiles(): void {
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
    for (let i = 0; i < this.field.cells.length; i++) {
      const cell = this.field.cells[i];
      if (isValidTier(cell)) this.tileByIndex.set(i, this.makeTile(i, cell));
    }
    this.clearSelection();
  }

  /** Создать плитку (тир-арт + glow + спец-оверлей по field.special[idx]). */
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

    const sp = getSpecial(this.field)[idx];
    if (sp) this.applySpecialVisual(tile, sp);

    this.panel.appendChild(tile);
    return tile;
  }

  /** Навесить спец-вид (рамка-класс + значок) на существующую плитку. */
  private applySpecialVisual(tile: HTMLElement, kind: SpecialKind): void {
    tile.classList.add('special', kind === 'bomb' ? 'special-bomb' : 'special-color');
    if (!tile.querySelector('.special-badge')) {
      el('div', { cls: 'special-badge', text: kind === 'bomb' ? '💣' : '🧲', parent: tile });
    }
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
    this.busy = true;
    const sp = getSpecial(this.field);
    const aSpec = sp[a];
    const bSpec = sp[b];
    this.comboNatural = 0; // новый ход — сбрасываем счётчик комбо

    if (aSpec || bSpec) {
      // Применение спецтайла: срабатывает на месте (без обмена). Цель color — тир соседа.
      // Сам взрыв бустера комбо НЕ повышает (comboLevel 0).
      const seed = new Set<number>();
      if (aSpec) for (const x of activateSpecial(this.field, a, this.field.cells[b])) seed.add(x);
      if (bSpec) for (const x of activateSpecial(this.field, b, this.field.cells[a])) seed.add(x);
      const seedStep = applyClear(this.field, seed, [], balance.tierCount, Math.random);
      await this.animateStep(seedStep, 0);
      await this.runNaturalCascade(undefined);
    } else if (isValidTier(this.field.cells[a]) && isValidTier(this.field.cells[b])) {
      // Обычный обмен: меняем, проверяем матч, при отсутствии — откат.
      swapCells(this.field, a, b);
      await this.swapTilesVisual(a, b);
      if (hasMatchAny(this.field)) {
        await this.runNaturalCascade([a, b]);
      } else {
        swapCells(this.field, a, b);
        await this.swapTilesVisual(a, b); // анимация назад
      }
    }

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
   * Каскад натуральных матчей поля; `moved` — клетки свапа (anchor спавна на 1-м шаге).
   * Комбо: 1-й натуральный шаг = уровень 0 (без комбо), 2-й = 1 («Комбо»), 3-й = 2 («Комбо ×2») …
   * Взрывы спецтайлов внутри шага (цепная реакция) уровень комбо не повышают.
   */
  private async runNaturalCascade(moved?: number[]): Promise<void> {
    let first = true;
    while (true) {
      const s = resolveStep(this.field, balance.tierCount, Math.random, first ? moved : undefined);
      first = false;
      if (!s) break;
      const comboLevel = this.comboNatural;
      this.comboNatural++;
      await this.animateStep(s, comboLevel);
    }
  }

  /** Анимация одного шага каскада: pop схлопнутых → морф спецтайлов → гравитация/досыпка. */
  private async animateStep(step: CascadeStep, comboLevel: number): Promise<void> {
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

    // 2) Начисление + поп «+$N» + реакция Баффета (через GameApp).
    const gained = this.callbacks.onCollected(step.clearedTiers, comboLevel, step.spawns.length > 0);
    this.popGain(gained, center);

    // 3) Морф anchor-клеток в спецтайлы (плитка уже на месте, не схлопнута).
    for (const s of step.spawns) {
      let tile = this.tileByIndex.get(s.idx);
      if (!tile) { tile = this.makeTile(s.idx, s.tier); this.tileByIndex.set(s.idx, tile); }
      tile.dataset.tier = String(s.tier);
      this.applySpecialVisual(tile, s.kind);
    }

    // 4) Гравитация (падения уцелевших — включая спецтайлы) + досыпка сверху.
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

  /** Прогнать стартовые матчи (старый сейв) без денег/анимации + гарантировать ход. */
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

  /** Плавающий «+$N» в точке сбора. */
  private popGain(amount: number, center: { x: number; y: number }): void {
    if (amount <= 0) return;
    const t = el('div', {
      cls: 'pop stroked-dark',
      text: `+${formatMoney(amount)}`,
      style: `left:${center.x}px;top:${center.y}px;transform:translate(-50%,-50%);font-size:17px;color:#9fe870;`,
      parent: this.panel,
    });
    const a = t.animate(
      [
        { transform: 'translate(-50%,-50%) translateY(0) scale(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) translateY(-30px) scale(1.15)', opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(0.33,0,0.67,1)', fill: 'forwards' },
    );
    a.onfinish = () => t.remove();
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
