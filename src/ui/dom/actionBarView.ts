// Нижняя зона экрана Hamster Bank:
//   • ряд из 4 круглых КНОПОК-БУСТЕРОВ (bomb/drone/rocket/magnet) со счётчиком из сейва;
//   • нижнее меню из 5 вкладок: Постройка / Задачи / Игра (центр, активна) / Коллекции / Магазин.
// Бустеры теперь кнопки и на поле НЕ спавнятся; эффекты бустеров и окна вкладок — будущее
// (тап → заглушка). Координаты — дизайн-холст 390×844 (макет «Play window»).

import { getData } from '../../core/storage';
import { balance } from '../../config/balance';
import type { BoosterId } from '../../core/boosters';
import { el } from './dom';

export type TabId = 'build' | 'tasks' | 'collections' | 'shop';

export interface ActionBarCallbacks {
  onBooster(id: BoosterId): void;
  onTab(id: TabId): void;
}

interface BoosterUi { id: BoosterId; count: HTMLDivElement; }

const BOOSTER_Y = 673;
const BOOSTER_SIZE = 64;
const BOOSTER_STRIDE = 76;
const BOOSTER_LEFT = 49; // 4×64 + 3×12 центрируется в 390

const NAV_TOP = 752;
const TAB_W = 78;

const TABS: { id: TabId | 'play'; icon: string; label: string }[] = [
  { id: 'build', icon: 'build.png', label: 'Постройка' },
  { id: 'tasks', icon: 'tasks.png', label: 'Задачи' },
  { id: 'play', icon: 'play.png', label: 'Игра' },
  { id: 'collections', icon: 'build.png', label: 'Коллекции' }, // иконка-заглушка (в макете арт коллекций ещё нет)
  { id: 'shop', icon: 'shop.png', label: 'Магазин' },
];

export class ActionBarView {
  private boosters: BoosterUi[] = [];

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
      icon.src = `assets/boosters/${def.id}.png`; icon.alt = def.name; icon.draggable = false;
      const count = el('div', { cls: 'hb-booster-count', text: '0', parent: btn });
      btn.addEventListener('pointerup', () => this.callbacks.onBooster(def.id));
      this.boosters.push({ id: def.id, count });
    }
  }

  private buildNav(stage: HTMLElement): void {
    const nav = el('div', { cls: 'hb-nav', style: `left:0;top:${NAV_TOP}px;width:390px;height:92px;`, parent: stage });
    el('div', { cls: 'hb-nav-base', parent: nav });
    // Жёлтое выделение позади центральной вкладки «Игра».
    el('div', { cls: 'hb-nav-sel', style: `left:${2 * TAB_W + (TAB_W - 71) / 2}px;top:6px;`, parent: nav });

    TABS.forEach((t, i) => {
      const tab = el('div', {
        cls: t.id === 'play' ? 'hb-nav-tab main' : 'hb-nav-tab',
        style: `left:${i * TAB_W}px;top:0;width:${TAB_W}px;height:92px;`,
        parent: nav,
      });
      const icon = el('img', { cls: 'hb-nav-icon', parent: tab }) as HTMLImageElement;
      icon.src = `assets/nav/${t.icon}`; icon.alt = ''; icon.draggable = false;
      el('div', { cls: 'hb-nav-label', text: t.label, parent: tab });
      if (t.id !== 'play') tab.addEventListener('pointerup', () => this.callbacks.onTab(t.id as TabId));
    });
  }

  refresh(): void {
    const d = getData();
    for (const b of this.boosters) b.count.textContent = String(d.boosters[b.id] ?? 0);
  }
}
