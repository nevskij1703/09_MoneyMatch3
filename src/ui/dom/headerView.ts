// Шапка экрана Hamster Bank: аватар-хомяк + название/тэглайн + 🔔 (с бэйджем) + ⚙.
// Координаты — дизайн-холст 390×844 (макет «Play window»). Тапы — заглушки этой итерации.

import { el } from './dom';

export interface HeaderCallbacks {
  onBell(): void;
  onSettings(): void;
}

export class HeaderView {
  constructor(stage: HTMLElement, callbacks: HeaderCallbacks) {
    const header = el('div', { cls: 'hb-header', style: 'left:2px;top:52px;width:390px;height:60px;', parent: stage });

    // Аватар-хомяк (x=9, 50×50).
    const avatar = el('div', { cls: 'hb-avatar', style: 'left:9px;top:0;width:50px;height:50px;', parent: header });
    const av = el('img', { parent: avatar }) as HTMLImageElement;
    av.src = 'assets/hud/avatar-hamster.png';
    av.alt = '';
    av.draggable = false;

    // Название + тэглайн (x=63).
    const logo = el('div', { cls: 'hb-logo', style: 'left:63px;top:5px;', parent: header });
    el('div', { cls: 'hb-title', text: 'Hamster Bank', parent: logo });
    el('div', { cls: 'hb-subtitle', text: 'Smart money, easy wins', parent: logo });

    // 🔔 (x=308, 30×30) + красный бэйдж.
    const bell = el('div', { cls: 'hb-iconbtn', style: 'left:308px;top:10px;width:30px;height:30px;', parent: header });
    const bi = el('img', { cls: 'hb-iconbtn-img', parent: bell }) as HTMLImageElement;
    bi.src = 'assets/hud/icon-bell.svg';
    bi.alt = '';
    bi.draggable = false;
    el('div', { cls: 'hb-badge', text: '3', parent: bell });
    bell.addEventListener('pointerup', () => callbacks.onBell());

    // ⚙ (x=348, 30×30) — тот же стиль кнопки, что и 🔔 (hb-iconbtn: синяя рамка + иконка 62%).
    const settings = el('div', { cls: 'hb-iconbtn', style: 'left:348px;top:10px;width:30px;height:30px;', parent: header });
    const si = el('img', { cls: 'hb-iconbtn-img', parent: settings }) as HTMLImageElement;
    si.src = 'assets/hud/icon-settings.svg';
    si.alt = '';
    si.draggable = false;
    settings.addEventListener('pointerup', () => callbacks.onSettings());
  }
}
