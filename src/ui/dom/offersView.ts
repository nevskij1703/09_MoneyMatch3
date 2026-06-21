// Офферы справа на экране Hamster Bank: SALE (премиум-набор гемов) и Watch Ad (за рекламу).
// Координаты — дизайн-холст 390×844. Логика офферов/рекламы — будущее; тап → заглушка.

import { el } from './dom';

export interface OffersCallbacks {
  onSale(): void;
  onAd(): void;
}

export class OffersView {
  constructor(stage: HTMLElement, callbacks: OffersCallbacks) {
    // SALE (x=310 y=112 71×76).
    const sale = el('div', { cls: 'hb-offer hb-offer-sale', style: 'left:310px;top:112px;width:71px;height:76px;', parent: stage });
    el('div', { cls: 'hb-offer-title', text: 'SALE!', parent: sale });
    const piggy = el('img', { cls: 'hb-offer-art', style: 'left:12px;top:17px;width:47px;height:43px;', parent: sale }) as HTMLImageElement;
    piggy.src = 'assets/offers/piggy-gems.png'; piggy.alt = ''; piggy.draggable = false;
    const saleTimer = el('div', { cls: 'hb-offer-timer', parent: sale });
    el('span', { cls: 'hb-offer-clock', text: '⏱', parent: saleTimer });
    el('span', { text: '23h 59m', parent: saleTimer });
    sale.addEventListener('pointerup', () => callbacks.onSale());

    // Watch Ad (x=310 y=194 71×76).
    const ad = el('div', { cls: 'hb-offer hb-offer-ad', style: 'left:310px;top:194px;width:71px;height:76px;', parent: stage });
    const adArt = el('img', { cls: 'hb-offer-art', style: 'left:5px;top:2px;width:61px;height:61px;', parent: ad }) as HTMLImageElement;
    adArt.src = 'assets/offers/ad-offer.png'; adArt.alt = ''; adArt.draggable = false;
    const adRow = el('div', { cls: 'hb-offer-adrow', parent: ad });
    const watch = el('img', { cls: 'hb-offer-watch', parent: adRow }) as HTMLImageElement;
    watch.src = 'assets/offers/icon-watch.svg'; watch.alt = ''; watch.draggable = false;
    el('span', { text: 'Watch Ad', parent: adRow });
    ad.addEventListener('pointerup', () => callbacks.onAd());
  }
}
