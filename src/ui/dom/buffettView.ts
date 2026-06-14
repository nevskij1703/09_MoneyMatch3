// Верхняя зона: ЗАГЛУШКА Уоррена Баффета, сидящего на деньгах, + декоративные
// падающие сверху монетки. Анимированные реакции на комбо — будущая фаза;
// сейчас есть лёгкий popReaction (эмодзи-пузырь + подскок) как временный отклик.

import { el } from './dom';

const REACTIONS = ['🤑', '😎', '👏', '🎉', '🔥', '💯', '🙌'];
const FALLING = ['🪙', '💵', '💲', '🪙', '💵'];

export class BuffettView {
  private zone: HTMLDivElement;
  private fig: HTMLDivElement;
  private bubble: HTMLDivElement;

  constructor(stage: HTMLElement) {
    this.zone = el('div', {
      cls: 'buffett-zone',
      style: 'left:0;top:150px;width:384px;height:140px;',
      parent: stage,
    });

    // Декоративные падающие деньги (CSS-анимация coinfall, разные фазы).
    for (let i = 0; i < FALLING.length; i++) {
      const coin = el('div', { cls: 'falling-coin', text: FALLING[i]!, parent: this.zone });
      coin.style.left = `${24 + i * 72}px`;
      coin.style.animationDuration = `${3.4 + i * 0.5}s`;
      coin.style.animationDelay = `-${i * 0.9}s`;
    }

    // Баффет на куче денег.
    const figwrap = el('div', { cls: 'buffett-figwrap', parent: this.zone });
    this.bubble = el('div', { cls: 'buffett-bubble', parent: figwrap });
    this.fig = el('div', { cls: 'buffett-fig', text: '🤵', parent: figwrap });
    el('div', { cls: 'buffett-money', text: '💰💵💰', parent: this.zone });
  }

  /** Реакция на комбо (заглушка): эмодзи-пузырь + подскок фигуры. */
  popReaction(): void {
    const r = REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!;
    this.bubble.textContent = r;
    this.bubble.animate(
      [
        { transform: 'translateX(-50%) translateY(6px) scale(0.6)', opacity: 0 },
        { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translateX(-50%) translateY(-6px) scale(0.9)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'forwards' },
    );
    this.fig.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }

  destroy(): void {
    this.zone.remove();
  }
}
