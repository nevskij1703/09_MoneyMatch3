// Верхний HUD: логотип MONEY MATCH (CSS-реплика), пилл 💎 (тап = магазин) и
// крупная плашка БАЛАНСА — главной валюты (собранные деньги). Координаты в
// дизайн-холсте 384×844.

import { getData } from '../../core/storage';
import { formatMoney } from '../../core/money';
import { el } from './dom';

export interface HudCallbacks {
  /** Тап по блоку алмазов / «+» — точка входа в магазин. */
  onDiamondsTap(): void;
}

export class HudView {
  private balanceValue: HTMLDivElement;
  private diamondsValue: HTMLDivElement;
  private diamondsRoot: HTMLDivElement;
  private balanceRoot: HTMLDivElement;

  constructor(stage: HTMLElement, callbacks: HudCallbacks) {
    // ── logo (134.5, 58) ─────────────────────────────────────────────────
    const logo = el('div', {
      cls: 'logo',
      style: 'left:134.5px;top:58px;width:115px;',
      parent: stage,
    });
    for (const [word, cls] of [['MONEY', 'money'], ['MATCH', 'merge']] as const) {
      const row = el('div', { cls: `row ${cls}`, parent: logo });
      el('span', { cls: 'back', text: word, parent: row });
      el('span', { cls: 'front', text: word, parent: row });
    }

    // ── statusbar-diamonds (264.5, 68.83) 108×34 ─────────────────────────
    const diamonds = el('div', {
      cls: 'layer',
      style: 'left:264.5px;top:68.83px;width:108px;height:34px;cursor:pointer;',
      parent: stage,
    });
    this.diamondsRoot = diamonds;
    el('div', { cls: 'statusbar', style: 'left:0.5px;top:0.17px;width:108px;height:34px;', parent: diamonds });
    el('div', {
      text: '💎',
      style: 'position:absolute;left:5px;top:4px;font-size:21px;line-height:26px;',
      parent: diamonds,
    });
    const plus = el('img', {
      style: 'position:absolute;left:22px;top:16px;width:14px;height:14px;display:block;',
      parent: diamonds,
    }) as HTMLImageElement;
    plus.src = 'assets/ui/btn-plus.svg';
    plus.alt = '+';
    plus.draggable = false;
    this.diamondsValue = el('div', { cls: 'diamonds-value', style: 'left:42.5px;top:4.5px;', parent: diamonds });
    diamonds.addEventListener('pointerup', () => callbacks.onDiamondsTap());

    // ── Баланс (главная валюта) — крупная плашка по центру под лого ───────
    this.balanceRoot = el('div', {
      cls: 'balance-bar',
      style: 'left:62px;top:107px;width:260px;height:40px;',
      parent: stage,
    });
    el('div', { cls: 'bal-icon', text: '💰', parent: this.balanceRoot });
    this.balanceValue = el('div', { cls: 'bal-value', text: '$0', parent: this.balanceRoot });

    this.refresh();
  }

  refresh(): void {
    const d = getData();
    this.balanceValue.textContent = `$${formatMoney(d.balance)}`;
    this.diamondsValue.textContent = d.diamonds.toLocaleString('en-US');
  }

  /** Короткий пульс плашки баланса (после сбора цепочки). */
  bumpBalance(): void {
    this.balanceValue.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }

  /** Поп «+N💎» над пиллой алмазов (на будущее — награды). */
  popDiamondGain(n: number): void {
    if (n <= 0) return;
    const t = el('div', {
      cls: 'pop stroked-dark',
      text: `+${n}💎`,
      style: 'left:54px;top:40px;transform:translate(-50%,-50%);font-size:15px;color:#7fd4ff;',
      parent: this.diamondsRoot,
    });
    const a = t.animate(
      [
        { transform: 'translate(-50%,-50%) translateY(0)', opacity: 1 },
        { transform: 'translate(-50%,-50%) translateY(-22px)', opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(0.33,0,0.67,1)', fill: 'forwards' },
    );
    a.onfinish = () => t.remove();
  }
}
