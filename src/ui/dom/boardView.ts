// Поле классического match-3 (экран Hamster Bank): синяя база + сетка 6×5 светлых плашек (58×58, шаг 60).
//
// Ввод: СВАЙП к ортогональному соседу → обмен; линия 3+/квадрат 2×2 → каскад (схлоп → деньги →
// бустер за сложный матч → гравитация → повтор). Свап без матча откатывается.
//
// БУСТЕРЫ на поле (T/L→💣, линия-4→🚀, 2×2→🛸 дрон, линия-5→🧲):
//  • активируются ПОСЛЕ перемещения (свайп: бустер переезжает на клетку соседа и срабатывает там),
//    либо ТАПОМ (без свайпа — срабатывает на своей клетке); БЕЗ «завода» — МГНОВЕННО в свой fireTime;
//  • каждый играет СВОЮ анимацию (см. planDetonation): 💣 мгновенный взрыв 3×3 + вспышка; 🚀 два спрайта
//    летят в обе стороны, гася клетки по пути; 🛸 убирает «плюс» сразу, затем летит к цели; 🧲 выделяет
//    клетки тира (сияние-вибрация), затем гасит их волной СВЕРХУ ВНИЗ;
//  • ЦЕПЬ: бустер, задетый эффектом другого, срабатывает МГНОВЕННО в момент, когда эффект дошёл до его
//    клетки (fireTime = reach-time), и играет свою анимацию (дрон — тоже сначала «плюс», потом взлёт);
//  • комбо двух бустеров: 💣+💣 → 5×5; 💣+🚀 → 3 ряда+3 столбца; 🚀+🚀 → крест; 🧲+🧲 → ВСЁ поле;
//    🧲+любой → спавн партнёра по тиру + запуск ВОЛНОЙ сверху вниз; 🛸+🛸 → 3 дрона; 🛸+💣/🚀 → дрон уносит бустер.
//
// СОБИРАЕМЫЕ на поле: 💎 алмаз / ⚡ молния СВАПАЮТСЯ как фишки (обмен прилипает по матчу; свайп на
// бустер активирует и собирает их); ловятся, если рядом схлоп матча ИЛИ по ним ПРЯМО попал бустер.
// Алмаз → +1💎, молния → +energy (без множителей, улетают в баланс). 🎁 СЕЙФ — НЕПОДВИЖЕН (не свапается
// ни с чем) и открывается ТОЛЬКО прямым попаданием бустера (ракета/бомба/дрон) → награда (бустер/💎/⚡);
// дрон в ПРИОРИТЕТЕ целится в сейфы. Награда остаётся лежать до своего сбора.
//
// Логика поля — core/match3.ts; здесь — ввод и анимации. Координаты — дизайн-холст 390×844.

import type { FieldState, Tier, SpecialKind, BoosterKind, CollectibleKind } from '../../types';
import type { CascadeStep, MatchSpawn, BoosterBlast } from '../../core/match3';
import { idxToXY, isValidTier, xyToIdx, getSpecial, isBooster, isCollectible } from '../../core/board';
import { balance } from '../../config/balance';
import {
  areOrthoNeighbors, swapCells, hasMatchAny, findMatches, applyClear, resolveStep,
  pickNearestTileTier, collectBoosterBlasts, hasAnyValidMove,
  cellsInSquare, cellsInRows, cellsInCols, cellsInPlus, pickRandomPresentTier,
  pickDroneFlightTarget,
} from '../../core/match3';
import { shuffleBoard } from '../../core/boosters';
import { anim } from '../../config/anim';
import { el, centerTransform } from './dom';
import { makeTierIcon } from './tierArt';
import { boosterIconUrl } from './boosterArt';
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
  private dropHint!: HTMLDivElement; // рамка-подсветка клетки при drag-постановке бустера из инвентаря
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
    this.iconSize = Math.min(this.cellW, this.cellH); // арт 128×128 ложится РОВНО в квадрат ячейки
    this.stageEl = stage;

    el('div', { cls: 'hb-board-base', style: `left:${BASE_LEFT}px;top:${BASE_TOP}px;width:${BASE_W}px;height:${BASE_H}px;`, parent: stage });

    this.panel = el('div', {
      cls: 'board-panel',
      style: `left:${PANEL_LEFT}px;top:${PANEL_TOP}px;width:${PANEL_W}px;height:${PANEL_H}px;`,
      parent: stage,
    });

    this.buildCells();
    this.dropHint = el('div', {
      cls: 'board-drop-hint',
      style: `width:${this.cellW}px;height:${this.cellH}px;display:none;`,
      parent: this.panel,
    });
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

  /** Создать бустер-объект на поле (только PNG-иконка; ориентация ракеты — отдельным артом h/v). */
  private makeBoosterTile(idx: number, kind: BoosterKind): HTMLElement {
    const c = this.cellCenter(idx);
    const tile = el('div', {
      cls: 'board-tile board-booster',
      style: `left:0;top:0;width:${this.cellW}px;height:${this.cellH}px;transform:${centerTransform(c.x, c.y, 1)};`,
    });
    tile.dataset.booster = kind;
    const icon = el('img', { cls: 'board-booster-icon', parent: tile }) as HTMLImageElement;
    icon.src = boosterIconUrl(kind); icon.alt = ''; icon.draggable = false;
    this.panel.appendChild(tile);
    return tile;
  }

  /** Создать собираемый объект на поле (💎/⚡/🎁 — выделенный 128×128 арт из assets/tiers/, на всю клетку). */
  private makeCollectibleTile(idx: number, kind: CollectibleKind): HTMLElement {
    const c = this.cellCenter(idx);
    const tile = el('div', {
      cls: `board-tile board-collectible board-collectible-${kind}`,
      style: `left:0;top:0;width:${this.cellW}px;height:${this.cellH}px;transform:${centerTransform(c.x, c.y, 1)};`,
    });
    tile.dataset.collectible = kind;
    const icon = el('img', { cls: 'board-collectible-art', parent: tile }) as HTMLImageElement;
    icon.src = encodeURI(`assets/tiers/Property 1=${kind === 'diamond' ? 'Diamond' : kind === 'lightning' ? 'Energy' : 'Safe'}.png`);
    icon.alt = ''; icon.draggable = false;
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

  // ─── Drag-постановка бустера из инвентаря (GameApp оркестрирует «призрак» и хит-тест) ─────────

  /** Идёт ли сейчас анимация/каскад (drag-постановку в этот момент применять нельзя). */
  isBusy(): boolean { return this.busy; }

  /** Индекс клетки под экранной точкой (для drag-дропа из инвентаря), или -1 вне поля. */
  cellFromClient(clientX: number, clientY: number): number {
    const local = this.pointerToLocal(clientX, clientY);
    return this.localToCell(local.x, local.y);
  }

  /** Подсветить клетку-приёмник при перетаскивании бустера (idx<0 — спрятать рамку). */
  setDropHover(idx: number): void {
    if (idx < 0 || idx >= this.field.cells.length) { this.dropHint.style.display = 'none'; return; }
    const { x, y } = idxToXY(idx, this.field.cols);
    this.dropHint.style.left = `${x * this.strideX}px`;
    this.dropHint.style.top = `${y * this.strideY}px`;
    this.dropHint.style.display = 'block';
  }

  /**
   * Поставить бустер из инвентаря на клетку idx. Что бы там ни стояло (плитка/бустер/собираемый/сейф) —
   * просто ЗАМЕНЯЕТСЯ: НЕ собирается и НЕ активируется. Старый объект тает на месте, новый бустер
   * «вылупляется». Это не ход (энергия не тратится, каскад не запускается). false — если поле занято.
   */
  placeBooster(idx: number, kind: BoosterKind): boolean {
    if (this.busy || idx < 0 || idx >= this.field.cells.length) return false;
    const sp = getSpecial(this.field);
    const c = this.cellCenter(idx);
    const old = this.tileByIndex.get(idx);
    if (old) {
      const a = old.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), opacity: 1 },
          { transform: centerTransform(c.x, c.y, 0.5), opacity: 0 },
        ],
        { duration: 160, easing: EASE_OUT, fill: 'forwards' },
      );
      a.onfinish = () => old.remove();
    }
    this.field.cells[idx] = null;
    sp[idx] = kind;
    const tile = this.makeBoosterTile(idx, kind);
    this.tileByIndex.set(idx, tile);
    tile.animate(
      [
        { transform: centerTransform(c.x, c.y, 0.4), opacity: 0, offset: 0 },
        { transform: centerTransform(c.x, c.y, 1.12), opacity: 1, offset: 0.7 },
        { transform: centerTransform(c.x, c.y, 1), offset: 1 },
      ],
      { duration: Math.round(anim.spawnMs * 0.7), easing: EASE_OUT },
    );
    this.callbacks.onPersist();
    return true;
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
    // 🎁 Сейф НЕПОДВИЖЕН — его нельзя свайпать ни с чем (плитка/собираемый/бустер). Открывается только
    // прямым попаданием бустера. Свайп с участием сейфа просто игнорируется: ни обмена, ни энергии, ни
    // анимации — сейф не дёргается (как стена-препятствие). Перетаскиваемая плитка тоже остаётся на месте.
    if (sp[a] === 'safe' || sp[b] === 'safe') {
      this.busy = false;
      return;
    }
    if (isBooster(sp[a]) && isBooster(sp[b])) {
      // #5 ДВА бустера: едет ТОЛЬКО выбранный (a) на принимающего (b); принимающий НЕПОДВИЖЕН.
      // Комбо целиком стартует из клетки принимающего (b). Энергия — сразу (ход состоялся).
      this.callbacks.onSpendEnergy();
      await this.boosterPairCombo(a, b);
    } else if (isBooster(sp[a]) || isBooster(sp[b])) {
      // Ровно один БУСТЕР: перемещаем (обмен a↔b) и активируем на новом месте.
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
   * Активировать ОДИН бустер на его клетке (свайп/тап) — МГНОВЕННО, без «завода». Магнит — по
   * `magnetTarget`; ДРОН — убирает «плюс» и взлетает к цели; всё через единый detonateBlasts. `extra` —
   * собираемый, свайпнутый на бустер. `immune` — клетки иммунитета (рождённые из матча-свайпа бустеры).
   */
  private async activateOneBooster(self: number, magnetTarget: Tier | null, extra?: number, immune?: Set<number>): Promise<void> {
    if (!isBooster(getSpecial(this.field)[self])) return;
    await this.detonateBlasts({ primaries: [{ idx: self, target: magnetTarget }], origin: self, extra, noDetonate: immune, keep: immune });
    await this.runNaturalCascade();
  }

  /**
   * ЕДИНЫЙ детонатор бустеров (одна точка анимации всех активаций/цепочек/комбо). Каждый бустер
   * срабатывает МГНОВЕННО в свой fireTime (примар — 0; зацепленный — момент, когда эффект родителя дошёл
   * до его клетки) и играет СВОЮ анимацию: 💣 мгновенный взрыв 3×3 + вспышка; 🚀 два спрайта летят в обе
   * стороны, гася клетки по пути; 🛸 убирает «плюс» сразу, затем летит к цели; 🧲 выделяет клетки тира,
   * затем гасит их волной сверху вниз. `baseCells` — зона комбо (радиально от origin / мгновенно).
   * `noDetonate` — расходники (сносятся, не детонируют). `keep` — иммунные (НЕ сносятся). `extra` —
   * собираемый (pop сразу). `fireOffsets` — стартовый fireTime примара (волна запуска сверху вниз).
   * Гравитация/досыпка — в animateStep. Каскад НЕ запускает.
   */
  private async detonateBlasts(opts: {
    primaries: { idx: number; target: Tier | null }[];
    origin: number;
    baseCells?: Iterable<number>;
    baseInstant?: boolean;
    extra?: number;
    noDetonate?: Iterable<number>;
    keep?: Iterable<number>;
    fireOffsets?: Map<number, number>;
  }): Promise<void> {
    const baseCells = opts.baseCells ? [...opts.baseCells] : [];
    const { blasts, cleared } = collectBoosterBlasts(this.field, opts.primaries, baseCells, opts.noDetonate ?? [], Math.random);
    if (opts.extra != null) cleared.add(opts.extra);
    if (opts.keep) for (const i of opts.keep) cleared.delete(i); // иммунные не сносятся
    const { delays, flights, timed } = this.planDetonation(blasts, baseCells, opts.origin, !!opts.baseInstant, opts.extra, opts.fireOffsets);
    // Тайлы взлетающих дронов капчим ДО клира (animateStep уберёт их из tileByIndex) — спрячем на взлёте.
    const droneTiles = new Map<number, HTMLElement>();
    for (const fl of flights) { const t = this.tileByIndex.get(fl.from); if (t) droneTiles.set(fl.from, t); }
    // Per-booster FX планируем ДО клира (магнит читает текущие тайлы для подсветки).
    const fx: Promise<void>[] = [];
    for (const b of timed) {
      if (b.kind === 'bomb') fx.push(this.fxBombBoom(b.idx, b.fireTime));
      else if (b.kind === 'rocket-h' || b.kind === 'rocket-v') fx.push(this.fxRocketSweep(b.idx, b.kind, b.fireTime));
      else if (b.kind === 'magnet') fx.push(this.fxMagnetSelect(b.cells, b.fireTime));
    }
    const step = applyClear(this.field, cleared, [], balance.tierCount, Math.random);
    const { settleMs } = this.animateStep(step, { origin: opts.origin, mode: 'radial', delays });
    await Promise.all([
      this.delay(settleMs),
      ...flights.map((fl) => this.flyChainedDrone(fl.from, fl.to, fl.at, fl.dur, droneTiles.get(fl.from))),
      ...fx,
    ]);
  }

  /**
   * План детонаций: для каждого бустера — его fireTime (примар=0/fireOffsets; зацепленный — когда эффект
   * родителя дошёл до его клетки), плюс задержка pop'а на каждую клетку (по СВОЕМУ закону бустера) и
   * взлёты дронов. Бомба: вся зона в fireTime. Ракета: |смещение| вдоль ряда/столбца × rocketStep (спрайт
   * летит). Дрон: «плюс» в fireTime, цель в fireTime+полёт. Магнит: select + ряд×magnetRowMs (волна
   * сверху вниз после выделения). На клетку берётся МИНИМУМ из пересекающихся эффектов.
   */
  private planDetonation(
    blasts: BoosterBlast[],
    baseCells: number[],
    origin: number,
    baseInstant: boolean,
    extra: number | undefined,
    fireOffsets?: Map<number, number>,
  ): { delays: Map<number, number>; flights: { from: number; to: number; at: number; dur: number }[]; timed: (BoosterBlast & { fireTime: number })[] } {
    const cols = this.field.cols;
    const waveStep = anim.boosterWaveMs / Math.max(cols, this.field.rows); // зона комбо (радиальная волна)
    const rocketStep = anim.rocketFlyMs / Math.max(cols, this.field.rows); // ракета (мс/клетку вдоль линии)
    const delays = new Map<number, number>();
    const fire = new Map<number, number>();
    const flights: { from: number; to: number; at: number; dur: number }[] = [];
    const timed: (BoosterBlast & { fireTime: number })[] = [];
    const setMin = (m: Map<number, number>, k: number, v: number): void => { const c = m.get(k); if (c == null || v < c) m.set(k, v); };
    const oc = this.cellCenter(origin);
    if (fireOffsets) for (const [k, v] of fireOffsets) setMin(fire, k, v);
    for (const c of baseCells) {
      const cc = this.cellCenter(c);
      setMin(delays, c, baseInstant ? 0 : (Math.hypot(cc.x - oc.x, cc.y - oc.y) / this.strideX) * waveStep);
    }
    const blastByIdx = new Map(blasts.map((b) => [b.idx, b] as const));
    for (const blast of blasts) {
      const ft = fire.get(blast.idx) ?? 0; // момент срабатывания этого бустера
      const { x: bx, y: by } = idxToXY(blast.idx, cols);
      const flightDur = blast.kind === 'drone' && blast.flightTarget != null ? this.droneFlightDur(blast.idx, blast.flightTarget) : 0;
      if (blast.kind === 'drone' && blast.flightTarget != null) flights.push({ from: blast.idx, to: blast.flightTarget, at: ft, dur: flightDur });
      for (const cell of blast.cells) {
        const { x: cx, y: cy } = idxToXY(cell, cols);
        let off: number;
        switch (blast.kind) {
          case 'bomb': off = 0; break;                                            // взрыв 3×3 разом
          case 'rocket-h': off = Math.abs(cx - bx) * rocketStep; break;           // спрайт пролетает по ряду
          case 'rocket-v': off = Math.abs(cy - by) * rocketStep; break;           // спрайт пролетает по столбцу
          case 'drone': off = cell === blast.flightTarget ? flightDur : 0; break; // «плюс» сразу, цель в приземлении
          case 'magnet': off = anim.magnetSelectMs + cy * anim.magnetRowMs; break;// выделение → снос сверху вниз
          default: off = 0;
        }
        const t = ft + off;
        setMin(delays, cell, t);
        const child = blastByIdx.get(cell);
        if (child && child !== blast) setMin(fire, cell, t); // зацепленный бустер срабатывает, когда эффект дошёл
      }
      timed.push({ ...blast, fireTime: ft });
    }
    if (extra != null) setMin(delays, extra, 0);
    return { delays, flights, timed };
  }

  /** 💣 Бомба: вспышка-взрыв (клетки 3×3 сносятся мгновенно вместе с ней в animateStep). */
  private async fxBombBoom(idx: number, at: number): Promise<void> {
    const c = this.cellCenter(idx);
    const boom = el('div', { cls: 'board-bomb-boom', style: `left:0;top:0;width:${this.cellW * 3}px;height:${this.cellH * 3}px;`, parent: this.panel });
    boom.animate(
      [
        { transform: centerTransform(c.x, c.y, 0.35), opacity: 0.95, offset: 0 },
        { transform: centerTransform(c.x, c.y, 0.85), opacity: 1, offset: 0.3 },
        { transform: centerTransform(c.x, c.y, 1.15), opacity: 0, offset: 1 },
      ],
      { duration: anim.bombBoomMs, delay: at, easing: EASE_OUT, fill: 'backwards' },
    );
    await this.delay(at + anim.bombBoomMs);
    boom.remove();
  }

  /** 🚀 Ракета: два спрайта летят из центра в обе стороны ряда/столбца (клетки гаснут по мере прохода). */
  private async fxRocketSweep(idx: number, kind: 'rocket-h' | 'rocket-v', at: number): Promise<void> {
    const cols = this.field.cols, rows = this.field.rows;
    const { x, y } = idxToXY(idx, cols);
    const c = this.cellCenter(idx);
    const rocketStep = anim.rocketFlyMs / Math.max(cols, rows);
    const horiz = kind === 'rocket-h';
    const dirs = horiz
      ? [{ end: this.cellCenter(xyToIdx(0, y, cols)), n: x, rot: 180 }, { end: this.cellCenter(xyToIdx(cols - 1, y, cols)), n: cols - 1 - x, rot: 0 }]
      : [{ end: this.cellCenter(xyToIdx(x, 0, cols)), n: y, rot: 0 }, { end: this.cellCenter(xyToIdx(x, rows - 1, cols)), n: rows - 1 - y, rot: 180 }];
    if (at > 0) await this.delay(at);
    const proms = dirs.map(({ end, n, rot }) => {
      const dur = Math.max(1, n) * rocketStep;
      const sprite = el('img', { cls: 'board-rocket-fly', style: `width:${this.iconSize}px;height:${this.iconSize}px;`, parent: this.panel }) as HTMLImageElement;
      sprite.src = boosterIconUrl(kind); sprite.alt = ''; sprite.draggable = false;
      sprite.animate(
        [
          { transform: `${centerTransform(c.x, c.y, 0.95)} rotate(${rot}deg)`, opacity: 1, offset: 0 },
          { transform: `${centerTransform(end.x, end.y, 1)} rotate(${rot}deg)`, opacity: 0.9, offset: 1 },
        ],
        { duration: dur, easing: 'linear', fill: 'forwards' },
      );
      return this.delay(dur).then(() => sprite.remove());
    });
    await Promise.all(proms);
  }

  /** 🧲 Магнит: клетки тира «выделяются» (сияние-вибрация), каждая до своего сноса (волна сверху вниз). */
  private async fxMagnetSelect(cells: number[], at: number): Promise<void> {
    const cols = this.field.cols;
    let maxEnd = anim.magnetSelectMs;
    for (const cell of cells) {
      const tile = this.tileByIndex.get(cell);
      if (!tile) continue;
      const { y } = idxToXY(cell, cols);
      const dur = anim.magnetSelectMs + y * anim.magnetRowMs; // сияет до момента своего сноса
      maxEnd = Math.max(maxEnd, dur);
      const c = this.cellCenter(cell);
      tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), filter: 'brightness(1.45)', offset: 0 },
          { transform: centerTransform(c.x, c.y, 1.07), filter: 'brightness(1.95)', offset: 0.25 },
          { transform: centerTransform(c.x, c.y, 0.98), filter: 'brightness(1.5)', offset: 0.55 },
          { transform: centerTransform(c.x, c.y, 1.07), filter: 'brightness(1.95)', offset: 0.8 },
          { transform: centerTransform(c.x, c.y, 1), filter: 'brightness(1.5)', offset: 1 },
        ],
        { duration: dur, delay: at, easing: 'ease-in-out' },
      );
    }
    await this.delay(at + maxEnd);
  }

  /** Взлетающий дрон: на своём `at` прячет свой (попадающий под pop) тайл и улетает спрайтом к цели. */
  private async flyChainedDrone(fromIdx: number, toIdx: number, at: number, dur: number, origTile?: HTMLElement): Promise<void> {
    if (at > 0) await this.delay(at);
    if (origTile) origTile.style.visibility = 'hidden'; // pop этого тайла станет невидимым — летит спрайт
    this.droneRays(fromIdx); // #4 на взлёте — 4 луча света вдоль убираемого «плюса»
    await this.flyDroneSprite(fromIdx, toIdx, dur);
  }

  /** #4 При взлёте дрона — 4 направленных луча света из его клетки вдоль убираемого «плюса» (только в пределах поля). */
  private droneRays(idx: number): void {
    const cols = this.field.cols, rows = this.field.rows;
    const { x, y } = idxToXY(idx, cols);
    const c = this.cellCenter(idx);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; // луч только туда, где есть убираемая клетка
      const horiz = dx !== 0;
      const ray = el('div', {
        cls: `board-drone-ray ${horiz ? 'h' : 'v'}`,
        style: `left:0;top:0;width:${horiz ? this.strideX : this.cellW * 0.4}px;height:${horiz ? this.cellH * 0.4 : this.strideY}px;`,
        parent: this.panel,
      });
      const mx = c.x + dx * this.strideX * 0.5, my = c.y + dy * this.strideY * 0.5; // середина к соседу
      const a = ray.animate(
        [
          { transform: centerTransform(c.x, c.y, 0.45), opacity: 0.95, offset: 0 },
          { transform: centerTransform(mx, my, 1), opacity: 0, offset: 1 },
        ],
        { duration: 300, easing: EASE_OUT, fill: 'forwards' },
      );
      a.onfinish = () => ray.remove();
    }
  }

  /** Длительность полёта дрона ~ дистанции: от anim.droneFlightMinMs (близко) до droneFlightMaxMs (далеко). */
  private droneFlightDur(from: number, to: number | null): number {
    if (to == null) return anim.droneFlightMinMs;
    const a = this.cellCenter(from), b = this.cellCenter(to);
    const dCells = Math.hypot(b.x - a.x, b.y - a.y) / this.strideX;
    const t = Math.min(1, dCells / 6);
    return Math.round(anim.droneFlightMinMs + t * (anim.droneFlightMaxMs - anim.droneFlightMinMs));
  }

  /** Активация ОДНОГО бустера после свапа с плиткой/собираемым (комбо двух бустеров — boosterPairCombo). */
  private async resolveBoosterActivation(a: number, b: number): Promise<void> {
    const sp = getSpecial(this.field);
    const ka = sp[a];

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
    await this.delay(this.animateStep(step).settleMs);
    // Новые позиции после гравитации этого шага (бустер и заспавненные могли «упасть»).
    const moveOf = (idx: number): number => { const f = step.falls.find((ff) => ff.from === idx); return f ? f.to : idx; };
    const selfNow = moveOf(boosterCell);
    const immune = new Set<number>(step.spawns.map((s) => moveOf(s.idx)));
    await this.activateOneBooster(selfNow, magnetTarget, undefined, immune);
  }

  /**
   * #5 Комбо ДВУХ бустеров: ВЫБРАННЫЙ (a) едет на ПРИНИМАЮЩЕГО (b, неподвижен) и «сливается» в его клетку;
   * затем всё комбо стартует ИЗ b. a освобождается (досыпется по гравитации в ходе комбо).
   */
  private async boosterPairCombo(a: number, b: number): Promise<void> {
    const sp = getSpecial(this.field);
    const ka = sp[a] as SpecialKind, kb = sp[b] as SpecialKind;
    await this.slideTileOnto(a, b);           // тайл выбранного едет a→b и сливается (принимающий не двигается)
    sp[a] = null; this.field.cells[a] = null; // a освобождается; комбо целиком из b
    await this.boosterCombo(b, ka, kb);
  }

  /** Тайл клетки `from` едет к центру `to` и убирается (слияние). Карта/поле НЕ трогаются здесь. */
  private async slideTileOnto(from: number, to: number): Promise<void> {
    const tile = this.tileByIndex.get(from);
    this.tileByIndex.delete(from);
    if (tile) {
      const fc = this.cellCenter(from), tc = this.cellCenter(to);
      this.animTransform(tile, centerTransform(fc.x, fc.y, 1), centerTransform(tc.x, tc.y, 1), anim.swapMs, EASE_OUT);
      await this.delay(anim.swapMs);
      tile.remove();
    } else {
      await this.delay(anim.swapMs);
    }
  }

  /** Комбо двух бустеров (видов ka,kb) ЦЕЛИКОМ из клетки `origin` (принимающего). */
  private async boosterCombo(origin: number, ka: SpecialKind, kb: SpecialKind): Promise<void> {
    const isM = (k: SpecialKind): boolean => k === 'magnet';
    const isB = (k: SpecialKind): boolean => k === 'bomb';
    const isR = (k: SpecialKind): boolean => k === 'rocket-h' || k === 'rocket-v';
    const isD = (k: SpecialKind): boolean => k === 'drone';

    if (isM(ka) && isM(kb)) { await this.clearWholeBoard(origin); return; }                  // 🧲+🧲 → всё поле
    if (isM(ka) || isM(kb)) { await this.magnetCombo(origin, isM(ka) ? kb : ka); return; }   // 🧲+любой → спавн партнёра
    if (isD(ka) && isD(kb)) { await this.droneDroneCombo(origin); return; }                  // 🛸+🛸 → 3 дрона (2 из b + 1 бонус)
    if (isD(ka) || isD(kb)) { await this.droneCarryCombo(origin, isD(ka) ? kb : ka); return; } // 🛸+💣/🚀 → уносит бустер

    // Зонные комбо: 💣+💣 → 5×5 (мгновенно); 💣+🚀 → 3 ряда+3 столбца; 🚀+🚀 → крест. Бустеры в зоне
    // детонируют из своих центров (дрон взлетает) — единый detonateBlasts; origin расходуется.
    const base = new Set<number>([origin]);
    let baseInstant = false;
    if (isB(ka) && isB(kb)) { for (const c of cellsInSquare(this.field, origin, 2)) base.add(c); baseInstant = true; }
    else if ((isB(ka) && isR(kb)) || (isR(ka) && isB(kb))) {
      for (const c of cellsInRows(this.field, origin, 1)) base.add(c);
      for (const c of cellsInCols(this.field, origin, 1)) base.add(c);
    } else {
      for (const c of cellsInRows(this.field, origin, 0)) base.add(c);
      for (const c of cellsInCols(this.field, origin, 0)) base.add(c);
    }
    await this.detonateBlasts({ primaries: [], origin, baseCells: base, baseInstant, noDetonate: [origin] });
    await this.runNaturalCascade();
  }

  /** 🧲+🧲 — собрать ВСЁ поле (волной от origin); бустеры на поле детонируют из своих центров. */
  private async clearWholeBoard(origin: number): Promise<void> {
    const base = new Set<number>();
    for (let i = 0; i < this.field.cells.length; i++) base.add(i);
    await this.detonateBlasts({ primaries: [], origin, baseCells: base, noDetonate: [origin] });
    await this.runNaturalCascade();
  }

  /** 🧲+💣/🚀 — собрать случайный тир, заспавнить на его клетках партнёр-бустер, запустить их волной СВЕРХУ ВНИЗ. */
  private async magnetCombo(origin: number, partnerKind: SpecialKind): Promise<void> {
    const sp = getSpecial(this.field);
    const T = pickRandomPresentTier(this.field, Math.random);
    const tierCells: number[] = [];
    if (T != null) for (let i = 0; i < this.field.cells.length; i++) if (this.field.cells[i] === T && !sp[i]) tierCells.push(i);
    const spawns: MatchSpawn[] = tierCells.map((idx) => ({ idx, kind: partnerKind, tier: T as Tier }));
    const clearSet = new Set<number>([origin]); // принимающий бустер расходуется
    const step = applyClear(this.field, clearSet, spawns, balance.tierCount, Math.random);
    await this.delay(this.animateStep(step, { origin, mode: 'radial' }).settleMs);
    await this.delay(anim.spawnMs);
    await this.detonateAllBoosters(origin); // запуск заспавненных — волной сверху вниз
    await this.runNaturalCascade();
  }

  /** 🛸+💣/🚀 — дрон взлетает ИЗ origin, «уносит» бустер: «плюс» на взлёте, зона несомого бустера — в приземлении. */
  private async droneCarryCombo(origin: number, carried: SpecialKind): Promise<void> {
    const landing = pickDroneFlightTarget(this.field, origin, Math.random, [origin]);
    const plus = cellsInPlus(this.field, origin); // «плюс» — на взлёте
    const seed = new Set<number>([origin, ...plus]);
    if (landing != null) {
      if (carried === 'bomb') for (const c of cellsInSquare(this.field, landing, balance.match.bombRadius)) seed.add(c);
      else if (carried === 'rocket-h') for (const c of cellsInRows(this.field, landing, 0)) seed.add(c);
      else if (carried === 'rocket-v') for (const c of cellsInCols(this.field, landing, 0)) seed.add(c);
    }
    const { cleared } = collectBoosterBlasts(this.field, [], seed, [origin], Math.random); // зацепить бустеры в зоне
    const flightDur = this.droneFlightDur(origin, landing);
    const stepMs = anim.boosterWaveMs / Math.max(this.field.cols, this.field.rows);
    const lc = this.cellCenter(landing ?? origin);
    const delays = new Map<number, number>();
    for (const c of cleared) {
      if (plus.has(c)) { delays.set(c, 0); continue; } // плюс — на взлёте
      const cc = this.cellCenter(c);
      delays.set(c, flightDur + (Math.hypot(cc.x - lc.x, cc.y - lc.y) / this.strideX) * stepMs); // зона — в приземлении
    }
    const droneTile = this.tileByIndex.get(origin); // капчим ДО клира — спрячем на взлёте
    const step = applyClear(this.field, cleared, [], balance.tierCount, Math.random);
    const { settleMs } = this.animateStep(step, { origin, mode: 'radial', delays });
    await Promise.all([
      this.flyChainedDrone(origin, landing ?? origin, 0, flightDur, droneTile),
      this.delay(settleMs),
    ]);
    await this.runNaturalCascade();
  }

  /** 🛸+🛸 — взлетают 3 дрона: 2 ИЗ origin (к двум целям) + 1 бонусный со случайной клетки-деньги. */
  private async droneDroneCombo(origin: number): Promise<void> {
    const rng = Math.random;
    const bonus = this.randomMoneyCell([origin]);
    const ex: number[] = [origin]; if (bonus != null) ex.push(bonus);
    const t1 = pickDroneFlightTarget(this.field, origin, rng, ex); if (t1 != null) ex.push(t1);
    const t2 = pickDroneFlightTarget(this.field, origin, rng, ex); if (t2 != null) ex.push(t2);
    const bt = bonus != null ? pickDroneFlightTarget(this.field, bonus, rng, ex) : null;
    const cleared = new Set<number>([origin, ...cellsInPlus(this.field, origin)]);
    if (t1 != null) cleared.add(t1);
    if (t2 != null) cleared.add(t2);
    if (bonus != null) { for (const c of cellsInPlus(this.field, bonus)) cleared.add(c); if (bt != null) cleared.add(bt); }
    const dur1 = this.droneFlightDur(origin, t1), dur2 = this.droneFlightDur(origin, t2), durB = bonus != null ? this.droneFlightDur(bonus, bt) : 0;
    const delays = new Map<number, number>();
    for (const c of cleared) delays.set(c, 0); // «плюсы» — на взлёте
    if (t1 != null) delays.set(t1, dur1);
    if (t2 != null) delays.set(t2, dur2);
    if (bt != null) delays.set(bt, durB);
    const oTile = this.tileByIndex.get(origin), bTile = bonus != null ? this.tileByIndex.get(bonus) : undefined;
    const step = applyClear(this.field, cleared, [], balance.tierCount, rng);
    const { settleMs } = this.animateStep(step, { origin, mode: 'radial', delays });
    await Promise.all([
      this.flyChainedDrone(origin, t1 ?? origin, 0, dur1, oTile),     // 1-й дрон из b
      this.flyDroneSprite(origin, t2, dur2),                          // 2-й «слипшийся» дрон из b
      bonus != null ? this.flyChainedDrone(bonus, bt ?? bonus, 0, durB, bTile) : Promise.resolve(), // бонусный
      this.delay(settleMs),
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

  /** Визуал: спрайт дрона летит дугой из fromIdx в toIdx за `dur` мс (исходный тайл прячет ВЫЗЫВАЮЩИЙ). */
  private async flyDroneSprite(fromIdx: number, toIdx: number | null, dur = anim.droneFlightMinMs): Promise<void> {
    const from = this.cellCenter(fromIdx);
    const to = toIdx != null ? this.cellCenter(toIdx) : from;
    const sprite = el('img', {
      cls: 'board-drone-fly',
      style: `width:${this.iconSize}px;height:${this.iconSize}px;`,
      parent: this.panel,
    }) as HTMLImageElement;
    sprite.src = boosterIconUrl('drone'); sprite.alt = ''; sprite.draggable = false;
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

  /** Взорвать ВСЕ бустеры на поле (финал магнит-комбо): запуск ВОЛНОЙ СВЕРХУ ВНИЗ (ряд × magnetRowMs). */
  private async detonateAllBoosters(origin: number): Promise<void> {
    const sp = getSpecial(this.field);
    const primaries: { idx: number; target: Tier | null }[] = [];
    const fireOffsets = new Map<number, number>();
    for (let i = 0; i < sp.length; i++) {
      if (isBooster(sp[i])) {
        primaries.push({ idx: i, target: sp[i] === 'magnet' ? pickNearestTileTier(this.field, i, Math.random) : null });
        fireOffsets.set(i, idxToXY(i, this.field.cols).y * anim.magnetRowMs); // верхние ряды стартуют раньше
      }
    }
    if (!primaries.length) return;
    await this.detonateBlasts({ primaries, origin, fireOffsets });
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

  /**
   * Каскад натуральных матчей; `moved` — клетки свапа (anchor спавна бустера на 1-м шаге).
   * Тайт-ожидание: следующий матч запускается, КАК ТОЛЬКО осели ЕГО столбцы (а не всё поле) —
   * убирает «фишки в ряду долго ждут, пока досыпется что-то в других столбцах». Поле уже settled
   * логически (resolveStep отработал), поэтому подглядываем следующий матч через findMatches (pure).
   */
  private async runNaturalCascade(moved?: number[]): Promise<void> {
    const cols = this.field.cols;
    let first = true;
    while (true) {
      const s = resolveStep(this.field, balance.tierCount, Math.random, first ? moved : undefined);
      first = false;
      if (!s) break;
      const { settleMs, colSettle } = this.animateStep(s);
      const next = findMatches(this.field, undefined, () => 0); // подглядка (детект не зависит от rng)
      if (next.cleared.size > 0) {
        let wait = 0;
        for (const c of next.cleared) wait = Math.max(wait, colSettle.get(c % cols) ?? 0); // ждём только столбцы СЛЕДУЮЩЕГО матча
        await this.delay(Math.max(0, wait) + 20);
      } else {
        await this.delay(settleMs); // последний шаг — дождаться полного оседания
      }
    }
  }

  /**
   * Анимация одного шага каскада: pop схлопнутых (тайминг по `timing`) → собранные 💎/⚡ улетают →
   * спавн → гравитация. НЕ ждёт сама — возвращает тайминги: `settleMs` (полное оседание для
   * await'а вызывающим) и `colSettle` (время оседания каждого СТОЛБЦА — для «тайт»-ожидания каскада,
   * чтобы следующий матч сработал, как только осели ЕГО столбцы, а не всё поле).
   */
  private animateStep(step: CascadeStep, timing?: ClearTiming): { settleMs: number; colSettle: Map<number, number> } {
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
      const d = popDelay(idx, k);
      this.matchWave(idx, d); // #2 радиальная световая волна при схлопе
      const a = tile.animate(
        [
          { transform: centerTransform(c.x, c.y, 1), opacity: 1, offset: 0 },
          { transform: centerTransform(c.x, c.y, 1.18), opacity: 1, offset: 0.16 }, // короткий «выброс»
          { transform: centerTransform(c.x, c.y, 0), opacity: 0, offset: 0.5 },     // РЕЗКО в ноль
          { transform: centerTransform(c.x, c.y, 0), opacity: 0, offset: 1 },
        ],
        { duration: anim.popMs, delay: d, easing: EASE_OUT, fill: 'both' },
      );
      a.onfinish = () => tile.remove();
    });
    playCollectFx(this.panel, this.iconSize, center);

    this.callbacks.onCascadeStep(step.clearedTiers, step.groups);

    // Спавны: бустеры из матчей + награды открытых сейфов (booster/collectible). 🎁 Сейф ОТКРЫВАЕТСЯ НА
    // СВОЁМ МЕСТЕ в openAt — момент, когда до него дошёл эффект бустера (reach-time из timing.delays),
    // даже если под ним пусто. Награда «вылупляется» там же и, если ниже освободилось, падает СВОЕЙ
    // само-анимацией (mover её пропускает). Никакого «сперва упасть, потом открыться».
    const fromSet = new Set(step.falls.map((f) => f.from));
    const fallTo = new Map<number, number>();
    for (const f of step.falls) fallTo.set(f.from, f.to);
    const openedSet = new Set(step.opened.map((o) => o.idx));
    const openFalls = new Map<number, HTMLElement>(); // safeIdx → награда (падает сама; mover пропускает)
    let openEndAbs = 0; // абсолютный конец самой долгой анимации открытия (для итогового await)
    for (const s of step.spawns) {
      const opened = openedSet.has(s.idx);
      const willFall = fromSet.has(s.idx);
      const c = this.cellCenter(s.idx);
      const old = this.tileByIndex.get(s.idx);
      const openAt = opened ? (timing?.delays?.get(s.idx) ?? gravityDelay) : gravityDelay;
      if (opened && old) {
        // Сейф растворяется НА СВОЁМ МЕСТЕ в openAt + радиальная вспышка.
        old.animate(
          [
            { transform: centerTransform(c.x, c.y, 1), opacity: 1, offset: 0 },
            { transform: centerTransform(c.x, c.y, 0.8), opacity: 1, offset: 0.35 },
            { transform: centerTransform(c.x, c.y, 1.45), opacity: 0, offset: 1 },
          ],
          { duration: anim.safeOpenMs, delay: openAt, easing: EASE_OUT, fill: 'backwards' },
        );
        window.setTimeout(() => old.remove(), openAt + anim.safeOpenMs + 40);
        this.safeFlash(s.idx, openAt + anim.safeOpenMs * 0.35);
      } else if (old) {
        old.remove();
      }
      const tile = isCollectible(s.kind) ? this.makeCollectibleTile(s.idx, s.kind) : this.makeBoosterTile(s.idx, s.kind);
      const revealMs = Math.round(anim.safeOpenMs * 0.75);
      if (opened && willFall) {
        // Награда сейфа: невидима до openAt → «вылупляется» НА МЕСТЕ сейфа → падает в точку приземления.
        // Одна само-анимация (fill:both: до openAt спрятана у сейфа, после — зафиксирована в приземлении).
        const landIdx = fallTo.get(s.idx) as number;
        const to = this.cellCenter(landIdx);
        const fallDur = Math.abs(to.y - c.y) / anim.fallSpeed;
        const total = revealMs + fallDur;
        const popEnd = revealMs / total;
        const at = openAt + anim.safeOpenMs * 0.4;
        tile.animate(
          [
            { transform: centerTransform(c.x, c.y, 0.1), opacity: 0, offset: 0 },
            { transform: centerTransform(c.x, c.y, 1.28), opacity: 1, offset: popEnd * 0.7 },
            { transform: centerTransform(c.x, c.y, 1), opacity: 1, offset: popEnd },
            { transform: centerTransform(to.x, to.y, 1), opacity: 1, offset: 1 },
          ],
          { duration: total, delay: at, easing: EASE_OUT, fill: 'both' },
        );
        openFalls.set(s.idx, tile); // mover пропустит s.idx; финальный обитатель — landIdx
        openEndAbs = Math.max(openEndAbs, at + total);
      } else {
        this.tileByIndex.set(s.idx, tile); // не падает (или матч-бустер, который двигает mover)
        const spawnDelay = opened ? openAt + anim.safeOpenMs * 0.45 : gravityDelay;
        const frames = opened
          ? [
              { transform: centerTransform(c.x, c.y, 0.1), opacity: 0, offset: 0 },
              { transform: centerTransform(c.x, c.y, 1.3), opacity: 1, offset: 0.6 },
              { transform: centerTransform(c.x, c.y, 1), offset: 1 },
            ]
          : [
              { transform: centerTransform(c.x, c.y, 0.2), opacity: 0 },
              { transform: centerTransform(c.x, c.y, 1.18), opacity: 1, offset: 0.6 },
              { transform: centerTransform(c.x, c.y, 1) },
            ];
        if (!willFall) {
          tile.animate(frames, { duration: opened ? revealMs : anim.spawnMs, delay: spawnDelay, easing: EASE_OUT, fill: 'backwards' });
          if (opened) openEndAbs = Math.max(openEndAbs, spawnDelay + revealMs);
        }
      }
    }

    // Гравитация + досыпка — РЕАКЦИЯ-каскадом (anim.reactionMs): когда снизу освобождается слот,
    // предмет над ним стартует через reactionMs; стартовав, он сам освобождает место → ещё через
    // reactionMs стартует следующий над ним (по столбцу снизу вверх). Уцелевшие и досыпка — ОДИН
    // непрерывный каскад на столбец (досыпка сыплется сверху по одному, а не вся разом).
    const oldMap = this.tileByIndex;
    const newMap = new Map<number, HTMLElement>();
    for (const [idx, tile] of oldMap) if (!fromSet.has(idx)) newMap.set(idx, tile);
    // Награды открытых падающих сейфов — финальные обитатели клеток приземления (падают своей само-анимацией).
    for (const [safeIdx, tile] of openFalls) newMap.set(fallTo.get(safeIdx) as number, tile);

    const cols = this.field.cols;
    const startY = -this.cellH * 0.5; // досыпка появляется у верхнего края поля (не «висит» высоко сверху)
    type Mover =
      | { col: number; destRow: number; kind: 'fall'; tile: HTMLElement; fromX: number; fromY: number; toX: number; toY: number }
      | { col: number; destRow: number; kind: 'refill'; tile: HTMLElement; toX: number; toY: number };
    const byCol = new Map<number, Mover[]>();
    const pushMover = (m: Mover): void => { let a = byCol.get(m.col); if (!a) { a = []; byCol.set(m.col, a); } a.push(m); };

    for (const f of step.falls) {
      if (openFalls.has(f.from)) continue; // награда сейфа падает своей само-анимацией — mover её пропускает
      const tile = oldMap.get(f.from);
      if (!tile) continue;
      newMap.set(f.to, tile);
      const from = this.cellCenter(f.from);
      const to = this.cellCenter(f.to);
      pushMover({ col: f.to % cols, destRow: Math.floor(f.to / cols), kind: 'fall', tile, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
    }
    for (const r of step.refills) {
      const to = this.cellCenter(r.idx);
      const tile = r.kind ? this.makeCollectibleTile(r.idx, r.kind as CollectibleKind) : this.makeTile(r.idx, r.tier as Tier);
      newMap.set(r.idx, tile);
      pushMover({ col: r.idx % cols, destRow: Math.floor(r.idx / cols), kind: 'refill', tile, toX: to.x, toY: to.y });
    }

    // pop'ы асинхронны (сами себя снимают) — НЕ держим ими шаг. Ждём только гравитацию + само-анимации сейфов.
    const colSettle = new Map<number, number>(); // абсолютное время оседания каждого столбца
    const setCol = (col: number, t: number): void => { const cur = colSettle.get(col); if (cur == null || t > cur) colSettle.set(col, t); };
    for (const [safeIdx] of openFalls) setCol((fallTo.get(safeIdx) as number) % cols, openEndAbs); // награда сейфа оседает в своём столбце
    let maxDur = Math.max(0, openEndAbs - gravityDelay);
    for (const arr of byCol.values()) {
      arr.sort((p, q) => q.destRow - p.destRow); // ниже (бОльший destRow) — стартует первым
      arr.forEach((m, k) => {
        const delay = gravityDelay + k * anim.reactionMs; // каждый над предыдущим — на reactionMs позже
        const dur = m.kind === 'fall' ? Math.abs(m.toY - m.fromY) / anim.fallSpeed : Math.abs(m.toY - startY) / anim.fallSpeed;
        if (m.kind === 'fall') {
          this.animTransform(m.tile, centerTransform(m.fromX, m.fromY, 1), centerTransform(m.toX, m.toY, 1), dur, 'linear', delay);
        } else {
          m.tile.animate(
            [
              { transform: centerTransform(m.toX, startY, 1), opacity: 0, offset: 0 },
              { transform: centerTransform(m.toX, startY, 1), opacity: 1, offset: 0.05 },
              { transform: centerTransform(m.toX, m.toY, 1), opacity: 1, offset: 1 },
            ],
            { duration: dur, delay, easing: 'linear', fill: 'backwards' },
          );
        }
        maxDur = Math.max(maxDur, k * anim.reactionMs + dur);
        setCol(m.col, delay + dur); // абсолютное время приземления в этом столбце
      });
    }
    this.tileByIndex = newMap;

    return { settleMs: gravityDelay + maxDur + 30, colSettle };
  }

  /** #2 Небольшая радиальная световая волна при схлопе фишки (растёт до ~115% клетки и гаснет). */
  private matchWave(idx: number, delay: number): void {
    const c = this.cellCenter(idx);
    const size = this.cellW * 1.15; // на пике превышает клетку на ~15%
    const wave = el('div', { cls: 'board-match-wave', style: `left:0;top:0;width:${size}px;height:${size}px;`, parent: this.panel });
    const a = wave.animate(
      [
        { transform: centerTransform(c.x, c.y, 0.35), opacity: 0, offset: 0 },
        { transform: centerTransform(c.x, c.y, 0.7), opacity: 0.8, offset: 0.3 },
        { transform: centerTransform(c.x, c.y, 1), opacity: 0, offset: 1 },
      ],
      { duration: Math.round(anim.popMs * 0.7), delay, easing: EASE_OUT, fill: 'backwards' },
    );
    a.onfinish = () => wave.remove();
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
    sprite.src = encodeURI(`assets/tiers/Property 1=${kind === 'diamond' ? 'Diamond' : 'Energy'}.png`);
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
