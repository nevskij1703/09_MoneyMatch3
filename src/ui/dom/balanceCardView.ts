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

    // Фон карты (градиент + внутр. glow) + клипованный декор.
    const bg = el('div', { cls: 'hb-card-bg', parent: card });
    const chart = el('img', { cls: 'hb-card-decor', style: 'left:96px;top:78px;width:97px;height:97px;', parent: bg }) as HTMLImageElement;
    chart.src = 'assets/decor/chart.png'; chart.alt = ''; chart.draggable = false;
    const bills = el('img', { cls: 'hb-card-decor', style: 'left:150px;top:8px;width:46px;height:46px;transform:rotate(-12deg);', parent: bg }) as HTMLImageElement;
    bills.src = 'assets/decor/bills.png'; bills.alt = ''; bills.draggable = false;

    // Маскот-хомяк: крупнее и обрезан по пояс (object-fit cover + object-position top).
    this.mascot = el('img', { cls: 'hb-card-mascot', style: 'left:150px;top:-42px;width:176px;height:182px;', parent: card }) as HTMLImageElement;
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

  /** Реакция маскота на комбо (подпрыг). */
  mascotReact(): void {
    this.mascot.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-10px) scale(1.06)' },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }
}
