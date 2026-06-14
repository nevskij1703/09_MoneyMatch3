// Поле match-3 (вариант «соединение цепочки»): декоративный стол + сетка 6×6.
//
// Ввод: игрок зажимает плитку и ВЕДЁТ палец по соседним ОДИНАКОВЫМ плиткам —
// строится цепочка (подсветка клеток + соединительная линия). Откат назад —
// проводя на предпоследнюю клетку. На отпускании, если длина ≥ minChain:
//   1) cells цепочки обнуляются (collectChain), деньги уходят в Баланс (onCollected);
//   2) гравитация (applyGravityAndRefill): уцелевшие плитки падают вниз, сверху
//      досыпаются новые БЕСПЛАТНО (тех же тиров) — с анимацией падения.
// Логика поля выполняется СРАЗУ (поле всегда консистентно для сейва), визуал —
// анимируется следом.

import type { FieldState, Tier } from '../../types';
import { idxToXY, isValidTier, xyToIdx } from '../../core/board';
import { balance } from '../../config/balance';
import { canExtendChain, collectChain, applyGravityAndRefill, hasAnyChain } from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { formatMoney } from '../../core/money';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { playCollectFx } from './match3Fx';

export interface BoardViewCallbacks {
  /** Цепочка собрана (tiers — собранные тиры). Возвращает начисленную сумму (для попа «+$N»). */
  onCollected(tiers: Tier[]): number;
  onPersist(): void;
}

// Геометрия Merge-zone из макета (координаты #stage 384×844).
const PANEL_LEFT = 13;
const PANEL_TOP = 299;
const PANEL_W = 360;
const PANEL_H = 345;
const SVG_NS = 'http://www.w3.org/2000/svg';

const EASE_OUT = 'cubic-bezier(0.22,0.61,0.36,1)';
const EASE_FALL = 'cubic-bezier(0.45,0,0.7,0.25)';

interface ChainState {
  cells: number[];
  tier: Tier;
}

export class BoardView {
  private cellW: number;
  private cellH: number;
  private iconSize: number;
  private panel: HTMLDivElement;
  private cellEls: HTMLDivElement[] = [];
  private tileByIndex = new Map<number, HTMLElement>();
  private chain: ChainState | null = null;
  private busy = false;
  private connectorLine: SVGPolylineElement;

  constructor(
    stage: HTMLElement,
    private field: FieldState,
    private callbacks: BoardViewCallbacks,
  ) {
    this.cellW = PANEL_W / field.cols;
    this.cellH = PANEL_H / field.rows;
    this.iconSize = Math.min(this.cellW, this.cellH) - 2;

    // Декоративный стол (3 слоя). Сетка лежит поверх.
    el('div', { cls: 'desk-edge', style: 'left:6px;top:293px;width:372px;height:361px;', parent: stage });
    el('div', { cls: 'desk-top', style: 'left:6px;top:293px;width:372px;height:356px;', parent: stage });
    el('div', { cls: 'desk-inner', style: 'left:12px;top:298px;width:362px;height:347px;', parent: stage });

    this.panel = el('div', {
      cls: 'board-panel',
      style: `left:${PANEL_LEFT}px;top:${PANEL_TOP}px;width:${PANEL_W}px;height:${PANEL_H}px;`,
      parent: stage,
    });

    this.buildCells();

    // SVG-коннектор цепочки (рисуется поверх плиток).
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${PANEL_W} ${PANEL_H}`);
    svg.setAttribute('class', 'chain-connector');
    this.connectorLine = document.createElementNS(SVG_NS, 'polyline');
    this.connectorLine.setAttribute('class', 'chain-line');
    svg.appendChild(this.connectorLine);
    this.panel.appendChild(svg);

    this.rebuildTiles();

    this.panel.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
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

  /** Полный rebuild всех плиток по field. */
  rebuildTiles(): void {
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
    for (let i = 0; i < this.field.cells.length; i++) {
      const cell = this.field.cells[i];
      if (isValidTier(cell)) this.tileByIndex.set(i, this.makeTile(i, cell));
    }
    this.clearChainVisual();
  }

  /** Создать плитку (тир-арт + glow), позиционированную в клетке idx. */
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

  private getGlow(tile: HTMLElement): HTMLElement | null {
    return tile.querySelector('.tier-glow');
  }

  private cellCenter(idx: number): { x: number; y: number } {
    const { x, y } = idxToXY(idx, this.field.cols);
    return { x: x * this.cellW + this.cellW / 2, y: y * this.cellH + this.cellH / 2 };
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
    const innerX = localX - cx * this.cellW - this.cellW / 2;
    const innerY = localY - cy * this.cellH - this.cellH / 2;
    const hitRadius = Math.min(this.cellW, this.cellH) * 0.5;
    if (innerX * innerX + innerY * innerY > hitRadius * hitRadius) return -1;
    return xyToIdx(cx, cy, this.field.cols);
  }

  // ─── Input (соединение цепочки) ─────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (this.busy) return;
    const local = this.pointerToLocal(e.clientX, e.clientY);
    const idx = this.localToCell(local.x, local.y);
    const tier = idx !== -1 ? this.field.cells[idx] : null;
    if (idx === -1 || !isValidTier(tier)) {
      this.clearChain();
      return;
    }
    this.chain = { cells: [idx], tier };
    try { this.panel.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.refreshChainVisual();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.chain || this.busy) return;
    const local = this.pointerToLocal(e.clientX, e.clientY);
    const idx = this.localToCell(local.x, local.y);
    if (idx === -1) return;
    const chain = this.chain.cells;
    // Откат: ведём на предпоследнюю клетку → снимаем последнюю.
    if (chain.length >= 2 && idx === chain[chain.length - 2]) {
      chain.pop();
      this.refreshChainVisual();
      return;
    }
    if (canExtendChain(chain, idx, this.field, balance.match.diagonal)) {
      chain.push(idx);
      this.refreshChainVisual();
    }
  };

  private onPointerUp = (): void => {
    if (!this.chain) return;
    const chain = this.chain.cells;
    this.chain = null;
    if (chain.length >= balance.match.minChain) {
      this.collect(chain);
    } else {
      this.clearChainVisual();
    }
  };

  // ─── Сбор + гравитация ──────────────────────────────────────────────────────

  private collect(chain: number[]): void {
    this.busy = true;

    // 1) Логика: обнулить цепочку, затем гравитация+досыпка — поле сразу полное.
    const tiers = collectChain(this.field, chain);
    const headCenter = this.cellCenter(chain[chain.length - 1]!);

    // 2) Визуал сбора: pop каждой собранной плитки + искры + «+$N».
    chain.forEach((idx, k) => {
      const tile = this.tileByIndex.get(idx);
      this.tileByIndex.delete(idx);
      if (!tile) return;
      const c = this.cellCenter(idx);
      const a = tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), opacity: 1 },
          { transform: centerTransform(c.x, c.y, 1.25), opacity: 1, offset: 0.35 },
          { transform: centerTransform(c.x, c.y, 0.1), opacity: 0 },
        ],
        { duration: 240, delay: k * 18, easing: EASE_OUT, fill: 'forwards' },
      );
      a.onfinish = () => tile.remove();
    });
    playCollectFx(this.panel, this.iconSize, headCenter);

    const gained = this.callbacks.onCollected(tiers);
    this.popGain(gained, headCenter);
    this.clearChainVisual();

    // 3) Гравитация+досыпка (логика выполнена сразу, анимируем падение).
    this.animateGravity();
    this.callbacks.onPersist();
  }

  private animateGravity(): void {
    const { falls, spawns } = applyGravityAndRefill(this.field, balance.tierCount, Math.random);
    const oldMap = this.tileByIndex;
    const newMap = new Map<number, HTMLElement>();
    const fromSet = new Set(falls.map((f) => f.from));
    for (const [idx, tile] of oldMap) if (!fromSet.has(idx)) newMap.set(idx, tile);

    let maxDur = 0;
    for (const f of falls) {
      const tile = oldMap.get(f.from);
      if (!tile) continue;
      newMap.set(f.to, tile);
      const from = this.cellCenter(f.from);
      const to = this.cellCenter(f.to);
      const dur = 150 + Math.abs(to.y - from.y) * 1.6;
      maxDur = Math.max(maxDur, dur);
      this.animTransform(tile, centerTransform(from.x, from.y, 1), centerTransform(to.x, to.y, 1), dur, EASE_FALL);
    }
    for (const s of spawns) {
      const to = this.cellCenter(s.idx);
      const startY = -this.cellH * 0.6;
      const tile = this.makeTile(s.idx, s.tier);
      const dur = 190 + Math.abs(to.y - startY) * 1.3;
      maxDur = Math.max(maxDur, dur);
      this.animTransform(tile, centerTransform(to.x, startY, 1), centerTransform(to.x, to.y, 1), dur, EASE_FALL);
      newMap.set(s.idx, tile);
    }
    this.tileByIndex = newMap;

    // По завершении падения — анти-дедлок (на всякий случай) и снятие busy.
    window.setTimeout(() => {
      if (!hasAnyChain(this.field, balance.match.minChain, balance.match.diagonal)) {
        shuffleBoard(this.field, Math.random);
        this.rebuildTiles();
        this.callbacks.onPersist();
      }
      this.busy = false;
    }, maxDur + 40);
  }

  /** Анимировать transform от→к (оба keyframe явные); финальный inline = to. */
  private animTransform(node: HTMLElement, from: string, to: string, dur: number, easing: string, onDone?: () => void): void {
    node.style.transform = to;
    const a = node.animate([{ transform: from }, { transform: to }], { duration: dur, easing });
    if (onDone) a.onfinish = onDone;
  }

  // ─── Подсветка цепочки + коннектор ──────────────────────────────────────────

  private refreshChainVisual(): void {
    const chainSet = new Set(this.chain?.cells ?? []);
    for (let i = 0; i < this.cellEls.length; i++) {
      this.cellEls[i]!.classList.toggle('chain', chainSet.has(i));
    }
    for (const [idx, tile] of this.tileByIndex) {
      const glow = this.getGlow(tile);
      if (glow) glow.style.opacity = chainSet.has(idx) ? '0.5' : '0';
    }
    const pts = (this.chain?.cells ?? [])
      .map((idx) => { const c = this.cellCenter(idx); return `${c.x},${c.y}`; })
      .join(' ');
    this.connectorLine.setAttribute('points', pts);
  }

  private clearChainVisual(): void {
    for (const cell of this.cellEls) cell.classList.remove('chain');
    for (const tile of this.tileByIndex.values()) {
      const g = this.getGlow(tile);
      if (g) g.style.opacity = '0';
    }
    this.connectorLine.setAttribute('points', '');
  }

  private clearChain(): void {
    this.chain = null;
    this.clearChainVisual();
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
    this.rebuildTiles();
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    for (const t of this.tileByIndex.values()) t.remove();
    this.tileByIndex.clear();
  }
}
