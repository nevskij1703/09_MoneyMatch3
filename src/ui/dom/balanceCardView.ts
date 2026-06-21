// Карта баланса (главный блок экрана Hamster Bank): «Total balance» + 💵 + значение,
// «Diamonds» + 💎 + значение, маскот-хомяк (по пояс, вылезает вверх) и финансовый декор.
// Координаты — дизайн-холст 390×844 (макет «Play window», Card x=9 y=112 293×158).

import { getData } from '../../core/storage';
import { formatMoneyFull } from '../../core/money';
import { el } from './dom';

/** Центр значения баланса в дизайн-координатах — цель для «полёта» собранных денег. */
export const MONEY_TARGET = { x: 96, y: 164 } as const;

/** Подогнать размер шрифта элемента под maxWidth (уменьшает от maxPx до minPx). */
function fitText(node: HTMLElement, maxWidth: number, maxPx: number, minPx: number): void {
  let size = maxPx;
  node.style.fontSize = `${size}px`;
  while (size > minPx && node.scrollWidth > maxWidth) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
}

export class BalanceCardView {
  private balanceValue: HTMLDivElement;
  private diamondsValue: HTMLDivElement;
  private mascot: HTMLImageElement;

  constructor(stage: HTMLElement) {
    const card = el('div', { cls: 'hb-card', style: 'left:9px;top:112px;width:293px;height:158px;', parent: stage });

    // Фон карты (градиент + внутр. glow) + приглушённый декор: график + раскиданные купюры.
    const bg = el('div', { cls: 'hb-card-bg', parent: card });
    const chart = el('img', { cls: 'hb-card-decor', style: 'left:92px;top:66px;width:106px;', parent: bg }) as HTMLImageElement;
    chart.src = 'assets/decor/chart.png'; chart.alt = ''; chart.draggable = false;
    // Купюры по одной, в разных местах/поворотах (height auto — без искажений).
    const billSpots: [number, number, number, number][] = [
      [128, 10, 34, -18], [74, 58, 30, 10], [156, 96, 33, -8], [20, 108, 27, 16], [190, 36, 26, -3], [44, 18, 24, 6],
    ];
    for (const [x, y, w, rot] of billSpots) {
      const bill = el('img', { cls: 'hb-card-decor', style: `left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);`, parent: bg }) as HTMLImageElement;
      bill.src = 'assets/decor/bills.png'; bill.alt = ''; bill.draggable = false;
    }

    // Маскот-хомяк: крупный, обрезан по пояс (cover+top), низ касается низа карты.
    this.mascot = el('img', { cls: 'hb-card-mascot', style: 'left:150px;top:-24px;width:176px;height:182px;', parent: card }) as HTMLImageElement;
    this.mascot.src = 'assets/char/hamster.png'; this.mascot.alt = ''; this.mascot.draggable = false;

    // «Total balance» + 👁.
    const balLabel = el('div', { cls: 'hb-card-label', style: 'left:12px;top:15px;', parent: card });
    el('span', { text: 'Total balance', parent: balLabel });
    const eye = el('img', { cls: 'hb-card-eye', parent: balLabel }) as HTMLImageElement;
    eye.src = 'assets/hud/icon-eye.svg'; eye.alt = ''; eye.draggable = false;

    // 💵 + баланс (x=5 y=35).
    const balRow = el('div', { cls: 'hb-money-row', style: 'left:5px;top:35px;', parent: card });
    const mi = el('img', { cls: 'hb-money-icon', parent: balRow }) as HTMLImageElement;
    mi.src = 'assets/hud/icon-money.png'; mi.alt = ''; mi.draggable = false;
    this.balanceValue = el('div', { cls: 'hb-money-value', text: '0', parent: balRow });

    // «Diamonds» (x=12 y=91).
    el('div', { cls: 'hb-card-label', text: 'Diamonds', style: 'left:12px;top:91px;', parent: card });

    // 💎 + алмазы (x=5 y=111).
    const diaRow = el('div', { cls: 'hb-money-row', style: 'left:5px;top:111px;', parent: card });
    const di = el('img', { cls: 'hb-money-icon', parent: diaRow }) as HTMLImageElement;
    di.src = 'assets/hud/icon-diamond.png'; di.alt = ''; di.draggable = false;
    this.diamondsValue = el('div', { cls: 'hb-money-value', text: '0', parent: diaRow });

    this.refresh();
  }

  refresh(): void {
    const d = getData();
    this.balanceValue.textContent = formatMoneyFull(d.balance);
    this.diamondsValue.textContent = formatMoneyFull(d.diamonds);
    // Все знаки без сокращений; если не влезает — уменьшаем шрифт.
    fitText(this.balanceValue, 168, 24, 12); // баланс вверху-слева (правее — маскот)
    fitText(this.diamondsValue, 210, 24, 12); // алмазы ниже, места больше
  }

  /** Пульс значения баланса (после прилёта собранных денег). */
  bumpBalance(): void {
    this.balanceValue.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }
}
