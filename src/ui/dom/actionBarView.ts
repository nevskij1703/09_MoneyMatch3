// Нижняя зона экрана Hamster Bank:
//   • ряд из 4 круглых КНОПОК-БУСТЕРОВ (bomb/drone/rocket/magnet) со счётчиком из сейва;
//   • нижнее меню из 5 вкладок: Build / Tasks / Play / Collections / Shop.
// Бустеры — кнопки (на поле НЕ спавнятся); эффекты и окна вкладок — будущее (тап → заглушка).
// Жёлтое выделение «переезжает» на нажатую вкладку (даже если окно — заглушка).
// Координаты — дизайн-холст 390×844 (макет «Play window»). UI на английском.

import { getData } from '../../core/storage';
import { balance } from '../../config/balance';
import type { BoosterId } from '../../core/boosters';
import { el } from './dom';
import { boosterIconUrl } from './boosterArt';

export type TabId = 'build' | 'tasks' | 'collections' | 'shop';

export interface ActionBarCallbacks {
  /** Захват бустера из инвентаря для drag-постановки на поле (только если в инвентаре есть штуки). */
  onBoosterPickup(id: BoosterId, e: PointerEvent): void;
  onTab(id: TabId): void;
  /** Тап по центральной вкладке «Play» — вернуться к игре (закрыть открытое окно вкладки). */
  onPlay(): void;
}

interface BoosterUi { id: BoosterId; count: HTMLDivElement; }

const BOOSTER_Y = 673;
const BOOSTER_SIZE = 64;
const BOOSTER_STRIDE = 76;
const BOOSTER_LEFT = 49; // 4×64 + 3×12 центрируется в 390

const NAV_TOP = 752;
const NAV_BASE_LEFT = 8;          // совпадает с .hb-nav-base (left:8, right:8)
const NAV_BASE_W = 390 - 8 * 2;   // 374 — ширина подложки меню
const TAB_W = NAV_BASE_W / 5;     // вкладки распределены по ширине ПОДЛОЖКИ, не всего экрана
const SEL_W = 71;

const TABS: { id: TabId | 'play'; icon: string; label: string }[] = [
  { id: 'build', icon: 'build.png', label: 'Build' },
  { id: 'tasks', icon: 'tasks.png', label: 'Tasks' },
  { id: 'play', icon: 'play.png', label: 'Play' },
  { id: 'collections', icon: 'collections.png', label: 'Collections' },
  { id: 'shop', icon: 'shop.png', label: 'Shop' },
];

export class ActionBarView {
  private boosters: BoosterUi[] = [];
  private sel!: HTMLDivElement;
  private tabEls: HTMLDivElement[] = [];

  constructor(stage: HTMLElement, private callbacks: ActionBarCallbacks) {
    this.buildBoosters(stage);
    this.buildNav(stage);
    this.refresh();
  }

  private buildBoosters(stage: HTMLElement): void {
    const defs = balance.boosters.definitions.slice(0, 4);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const btn = el('div', {
        cls: 'hb-booster',
        style: `left:${BOOSTER_LEFT + i * BOOSTER_STRIDE}px;top:${BOOSTER_Y}px;width:${BOOSTER_SIZE}px;height:${BOOSTER_SIZE}px;`,
        parent: stage,
      });
      const gloss = el('img', { cls: 'hb-booster-gloss', parent: btn }) as HTMLImageElement;
      gloss.src = 'assets/boosters/ellipse.svg'; gloss.alt = ''; gloss.draggable = false;
      const icon = el('img', { cls: 'hb-booster-icon', parent: btn }) as HTMLImageElement;
      icon.src = boosterIconUrl(def.id); icon.alt = def.name; icon.draggable = false;
      const count = el('div', { cls: 'hb-booster-count', text: '0', parent: btn });
      // Бустер-кнопка — ИСТОЧНИК для drag-постановки на поле. Нажатие при наличии штук → захват
      // (GameApp ведёт «призрак» и ставит на клетку). Пусто → тряска-отказ, без захвата.
      btn.addEventListener('pointerdown', (e) => {
        if ((getData().boosters[def.id] ?? 0) <= 0) { this.shake(btn); return; }
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        this.callbacks.onBoosterPickup(def.id, e);
      });
      this.boosters.push({ id: def.id, count });
    }
  }

  private buildNav(stage: HTMLElement): void {
    const nav = el('div', { cls: 'hb-nav', style: `left:0;top:${NAV_TOP}px;width:390px;height:92px;`, parent: stage });
    el('div', { cls: 'hb-nav-base', parent: nav });
    this.sel = el('div', { cls: 'hb-nav-sel', style: `left:${this.selLeft(2)}px;top:6px;`, parent: nav });

    TABS.forEach((t, i) => {
      const tab = el('div', {
        cls: 'hb-nav-tab',
        style: `left:${NAV_BASE_LEFT + i * TAB_W}px;top:0;width:${TAB_W}px;height:92px;`,
        parent: nav,
      });
      const icon = el('img', { cls: 'hb-nav-icon', parent: tab }) as HTMLImageElement;
      icon.src = `assets/nav/${t.icon}`; icon.alt = ''; icon.draggable = false;
      el('div', { cls: 'hb-nav-label', text: t.label, parent: tab });
      // Выделением управляет GameApp (переезжает на время открытого окна, потом — обратно на Play).
      tab.addEventListener('pointerup', () => {
        if (t.id === 'play') this.callbacks.onPlay();
        else this.callbacks.onTab(t.id);
      });
      this.tabEls.push(tab);
    });
    this.highlight('play'); // старт — «Play»
  }

  /** Перевести жёлтое выделение на вкладку id (анимация — CSS transition на left). */
  highlight(id: TabId | 'play'): void {
    const i = TABS.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.sel.style.left = `${this.selLeft(i)}px`;
    this.tabEls.forEach((tab, k) => tab.classList.toggle('active', k === i));
  }

  private selLeft(i: number): number {
    return NAV_BASE_LEFT + i * TAB_W + (TAB_W - SEL_W) / 2;
  }

  /** Тряска кнопки-бустера, когда штук в инвентаре нет (отказ захвата). */
  private shake(btn: HTMLElement): void {
    btn.animate(
      [
        { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
        { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
      ],
      { duration: 280, easing: 'ease-in-out' },
    );
  }

  refresh(): void {
    const d = getData();
    for (const b of this.boosters) b.count.textContent = String(d.boosters[b.id] ?? 0);
  }
}
