// Инфо-строка экрана Hamster Bank: Level / Energy / Income. Координаты — дизайн-холст 390×844.
// Level — из сейва (прокачка — будущее окно). Income = investmentMultiplier. Energy — текущая
// энергия N/100 + таймер до следующего +regenAmount; реген/трата считаются в core/energy.ts,
// тик обновления — в GameApp. `refresh()` только читает уже посчитанное состояние.

import { getData } from '../../core/storage';
import { balance } from '../../config/balance';
import { energyToNextMs } from '../../core/energy';
import { el } from './dom';

export class InfoRowView {
  private levelValue: HTMLDivElement;
  private energyValue: HTMLDivElement;
  private energyTimer: HTMLDivElement;
  private incomeValue: HTMLDivElement;
  private energyPill: HTMLDivElement;

  constructor(stage: HTMLElement) {
    // Level (x=8 y=280 119×51).
    const lvl = this.pill(stage, 8);
    this.icon(lvl, 'assets/hud/icon-level.svg', 'left:8px;top:6px;width:35px;height:36px;');
    el('div', { cls: 'hb-pill-label', text: 'Level', style: 'left:49px;', parent: lvl });
    this.levelValue = el('div', { cls: 'hb-pill-value', style: 'left:49px;', parent: lvl });

    // Energy (x=135 y=280 119×51).
    const en = this.pill(stage, 135);
    this.energyPill = en;
    this.icon(en, 'assets/hud/icon-energy.svg', 'left:13px;top:7px;width:17px;height:34px;');
    el('div', { cls: 'hb-pill-label', text: 'Energy', style: 'left:41px;', parent: en });
    this.energyValue = el('div', { cls: 'hb-pill-value', style: 'left:41px;', parent: en });
    this.energyTimer = el('div', { cls: 'hb-energy-timer', parent: en });

    // Income (x=261 y=280 119×51).
    const inc = this.pill(stage, 261);
    this.icon(inc, 'assets/hud/icon-income.svg', 'left:7px;top:7px;width:31px;height:35px;');
    el('div', { cls: 'hb-pill-label', text: 'Income', style: 'left:45px;', parent: inc });
    this.incomeValue = el('div', { cls: 'hb-pill-value', style: 'left:45px;', parent: inc });

    this.refresh();
  }

  private pill(stage: HTMLElement, left: number): HTMLDivElement {
    return el('div', { cls: 'hb-pill', style: `left:${left}px;top:280px;width:119px;height:51px;`, parent: stage });
  }

  private icon(parent: HTMLElement, src: string, style: string): void {
    const img = el('img', { cls: 'hb-pill-icon', style, parent }) as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
  }

  private fmtTimer(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  refresh(): void {
    const d = getData();
    const max = balance.energy.max;
    this.levelValue.textContent = String(d.level);
    this.energyValue.innerHTML = `${d.energy}<span class="hb-energy-max">/${max}</span>`;
    this.energyTimer.textContent = d.energy >= max ? 'MAX' : this.fmtTimer(energyToNextMs(d, Date.now()));
    const m = d.investmentMultiplier;
    this.incomeValue.textContent = `x${Number.isInteger(m) ? m : m.toFixed(1)}`;
  }

  /** Подсветить пилюлю энергии (когда хода нет — энергия кончилась). */
  pulseEnergy(): void {
    this.energyPill.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'ease-out' },
    );
  }
}
