// Инфо-строка экрана Hamster Bank: Level / Energy / Income. Координаты — дизайн-холст 390×844.
// Сейчас — показ значений из сейва (Level/Energy) и конфига (Income = investmentMultiplier).
// Трата энергии, реген по таймеру и прокачка уровня — будущее; таймер «9:59» статичный.

import { getData } from '../../core/storage';
import { balance } from '../../config/balance';
import { el } from './dom';

export class InfoRowView {
  private levelValue: HTMLDivElement;
  private energyValue: HTMLDivElement;
  private incomeValue: HTMLDivElement;

  constructor(stage: HTMLElement) {
    // Level (x=8 y=280 119×51).
    const lvl = this.pill(stage, 8);
    this.icon(lvl, 'assets/hud/icon-level.svg', 'left:8px;top:6px;width:35px;height:36px;');
    el('div', { cls: 'hb-pill-label', text: 'Level', style: 'left:49px;', parent: lvl });
    this.levelValue = el('div', { cls: 'hb-pill-value', style: 'left:49px;', parent: lvl });

    // Energy (x=135 y=280 119×51).
    const en = this.pill(stage, 135);
    this.icon(en, 'assets/hud/icon-energy.svg', 'left:13px;top:7px;width:17px;height:34px;');
    el('div', { cls: 'hb-pill-label', text: 'Energy', style: 'left:41px;', parent: en });
    this.energyValue = el('div', { cls: 'hb-pill-value', style: 'left:41px;', parent: en });
    el('div', { cls: 'hb-energy-timer', text: '9:59', parent: en }); // статичная заглушка

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

  refresh(): void {
    const d = getData();
    this.levelValue.textContent = String(d.level);
    this.energyValue.innerHTML = `${d.energy}<span class="hb-energy-max">/${balance.energy.max}</span>`;
    const m = d.investmentMultiplier;
    this.incomeValue.textContent = `x${Number.isInteger(m) ? m : m.toFixed(1)}`;
  }
}
