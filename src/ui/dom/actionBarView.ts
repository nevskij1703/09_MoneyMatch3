// Нижняя зона MoneyMatch3:
//   ряд из 4 БУСТЕРОВ (заглушки — помогают собирать деньги с поля; тап → stub) +
//   btm_toolbar (5 вкладок-окон: Портфель / Задачи / БАНК(центр) / Инвестиции /
//   Магазин — заглушки). Кнопок Сделки/Резерв/Инвесты больше нет.

import { getData } from '../../core/storage';
import { balance } from '../../config/balance';
import type { BoosterId } from '../../core/boosters';
import { el } from './dom';

export interface ActionBarCallbacks {
  onBooster(id: BoosterId): void;
  onPortfolioTap(): void;
  onTasksTap(): void;
  onInvestsTap(): void;
  onShopTap(): void;
}

interface BoosterUi {
  id: BoosterId;
  count: HTMLDivElement;
}

const ROW_TOP = 668;
const BTN_W = 78;
const BTN_STRIDE = 92;
const ROW_LEFT = 13;

export class ActionBarView {
  private boosters: BoosterUi[] = [];

  constructor(stage: HTMLElement, private callbacks: ActionBarCallbacks) {
    // ── Ряд из 4 бустеров ────────────────────────────────────────────────
    const defs = balance.boosters.definitions.slice(0, 4);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const btn = el('div', {
        cls: 'booster-btn',
        style: `left:${ROW_LEFT + i * BTN_STRIDE}px;top:${ROW_TOP}px;width:${BTN_W}px;height:${BTN_W}px;`,
        parent: stage,
      });
      const bg = el('img', { cls: 'bg', parent: btn }) as HTMLImageElement;
      bg.src = 'assets/ui/btn-square-white.svg';
      bg.alt = '';
      bg.draggable = false;
      el('div', { cls: 'icon', text: def.glyph, parent: btn });
      el('div', { cls: 'label', text: def.name, parent: btn });
      const count = el('div', { cls: 'booster-count', text: '0', parent: btn });
      btn.addEventListener('pointerup', () => this.callbacks.onBooster(def.id));
      this.boosters.push({ id: def.id, count });
    }

    // ── btm_toolbar (0, 759) 384×85 ──────────────────────────────────────
    const toolbar = el('div', { cls: 'btm-toolbar', parent: stage });
    const list = el('div', { cls: 'list', parent: toolbar });
    this.makeToolbarBtn(list, '📊', 'Портфель', false, callbacks.onPortfolioTap);
    this.makeToolbarBtn(list, '📋', 'Задачи', false, callbacks.onTasksTap);
    this.makeToolbarBtn(list, '🏦', 'БАНК', true, null);
    this.makeToolbarBtn(list, '📈', 'Инвестиции', false, callbacks.onInvestsTap);
    this.makeToolbarBtn(list, '🛒', 'Магазин', false, callbacks.onShopTap);

    this.refresh();
  }

  private makeToolbarBtn(
    list: HTMLElement,
    glyph: string,
    label: string,
    main: boolean,
    onTap: (() => void) | null,
  ): HTMLDivElement {
    const btn = el('div', { cls: main ? 'toolbar-btn main' : 'toolbar-btn', parent: list });
    const bg = el('img', { cls: 'bg', parent: btn }) as HTMLImageElement;
    bg.src = main ? 'assets/ui/btn-toolbar-yellow.svg' : 'assets/ui/btn-toolbar-blue.svg';
    bg.alt = '';
    bg.draggable = false;
    el('div', { cls: 'icon', text: glyph, parent: btn });
    el('div', { cls: 'label', text: label, parent: btn });
    if (onTap) btn.addEventListener('pointerup', onTap);
    return btn;
  }

  refresh(): void {
    const d = getData();
    for (const b of this.boosters) {
      b.count.textContent = String(d.boosters[b.id] ?? 0);
    }
  }
}
