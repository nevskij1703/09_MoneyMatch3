// Окно «Build» (вкладка слева внизу) — полноэкранный оверлей внутри #stage (390×844).
// Макет Figma «Build window». Игрок прокачивает постройки активной локации; цены —
// геометрическая лесенка (см. core/build.ts). Сверху — счётчики money/diamonds/energy,
// ряд локаций (интерактивна только активная) и арт локации; снизу — карточки построек.
//
// Оверлей лежит ПОД нижним меню (nav z=45 > окно z=40), поэтому те же 5 вкладок остаются
// сверху и переключают окно. Открытие/закрытие — GameApp (Build → open, Play → close).
// UI на английском, шрифт Roboto Flex.

import { getData, update, save } from '../../core/storage';
import { balance } from '../../config/balance';
import { buildStep, buildUpgradeCost, locationProgress } from '../../core/build';
import { formatMoney } from '../../core/money';
import { el } from './dom';

export interface BuildWindowCallbacks {
  /** Баланс/прогресс изменились (прокачка) → синхронизировать карту баланса на экране Play. */
  onChange(): void;
  /** «Coming soon» попап (топапы валют / настройки / закрытые локации). */
  onStub(title: string, message: string): void;
}

interface CardUi {
  root: HTMLDivElement;
  steps: HTMLDivElement;
  cost: HTMLDivElement;
  name: HTMLDivElement;
  index: number;
}

export class BuildWindowView {
  private root: HTMLDivElement;
  private cards: CardUi[] = [];
  private moneyVal!: HTMLDivElement;
  private diamondVal!: HTMLDivElement;
  private energyCur!: HTMLSpanElement;
  private barFill!: HTMLDivElement;

  constructor(stage: HTMLElement, private callbacks: BuildWindowCallbacks) {
    this.root = el('div', { cls: 'build-window', parent: stage });
    this.buildBackground();
    this.buildToolbar();
    this.buildLocations();
    this.buildList();
    this.refresh();
  }

  // ─── Фон: арт локации + затемняющие градиенты сверху/снизу ────────────────────
  private buildBackground(): void {
    const img = el('img', { cls: 'bw-loc', parent: this.root }) as HTMLImageElement;
    img.src = `assets/build/${balance.build.locationArt}`;
    img.alt = ''; img.draggable = false;
    el('div', { cls: 'bw-grad-top', parent: this.root });
    el('div', { cls: 'bw-grad-btm', parent: this.root });
  }

  // ─── Верхняя панель: аватар · money · diamonds · energy · settings ────────────
  private buildToolbar(): void {
    const bar = el('div', { cls: 'bw-toolbar', parent: this.root });

    const av = el('img', { cls: 'bw-avatar', parent: bar }) as HTMLImageElement;
    av.src = 'assets/hud/avatar-hamster.png'; av.alt = ''; av.draggable = false;

    this.moneyVal = this.buildCounter(bar, 'assets/hud/icon-money.png', '', () =>
      this.callbacks.onStub('🛒 Shop', 'Coin top-ups are coming soon — earn coins by playing for now.'));
    this.diamondVal = this.buildCounter(bar, 'assets/hud/icon-diamond.png', 'diamond', () =>
      this.callbacks.onStub('💎 Diamonds', '💎 top-ups are coming soon — closer to release.'));

    // Energy — особый счётчик: «83» + приглушённое «/100».
    const ec = el('div', { cls: 'bw-counter', parent: bar });
    const eleft = el('div', { cls: 'bw-counter-left', parent: ec });
    const eico = el('img', { cls: 'bw-counter-ico energy', parent: eleft }) as HTMLImageElement;
    eico.src = 'assets/hud/icon-energy.svg'; eico.alt = ''; eico.draggable = false;
    const eval_ = el('div', { cls: 'bw-counter-val', parent: eleft });
    this.energyCur = el('span', { cls: 'bw-e-cur', parent: eval_ });
    el('span', { cls: 'bw-e-max', text: `/${balance.energy.max}`, parent: eval_ });
    this.addPlus(ec, () => this.callbacks.onStub('⚡ Energy', 'Energy refills are coming soon — it also regenerates over time.'));

    const set = el('img', { cls: 'bw-settings', parent: bar }) as HTMLImageElement;
    set.src = 'assets/hud/icon-settings.svg'; set.alt = ''; set.draggable = false;
    set.addEventListener('pointerup', () =>
      this.callbacks.onStub('⚙️ Settings', 'Settings are coming soon — sound, vibration and language.'));
  }

  /** Счётчик-пилюля (иконка + значение + кнопка «+»). Возвращает элемент значения. */
  private buildCounter(parent: HTMLElement, icon: string, icoMod: string, onAdd: () => void): HTMLDivElement {
    const c = el('div', { cls: 'bw-counter', parent });
    const left = el('div', { cls: 'bw-counter-left', parent: c });
    const ico = el('img', { cls: 'bw-counter-ico' + (icoMod ? ` ${icoMod}` : ''), parent: left }) as HTMLImageElement;
    ico.src = icon; ico.alt = ''; ico.draggable = false;
    const val = el('div', { cls: 'bw-counter-val', parent: left });
    this.addPlus(c, onAdd);
    return val;
  }

  private addPlus(parent: HTMLElement, onAdd: () => void): void {
    const add = el('div', { cls: 'bw-add', text: '+', parent });
    add.addEventListener('pointerup', (e) => { e.stopPropagation(); onAdd(); });
  }

  // ─── Ряд локаций (визуал; интерактивна только активная) ───────────────────────
  private buildLocations(): void {
    const wrap = el('div', { cls: 'bw-locs', parent: this.root });
    const bar = el('div', { cls: 'bw-locs-bar', parent: wrap });
    el('div', { cls: 'bw-locs-track', parent: bar });
    this.barFill = el('div', { cls: 'bw-locs-fill', parent: bar });

    const row = el('div', { cls: 'bw-locs-row', parent: wrap });
    for (const loc of balance.build.locations) {
      const spot = el('div', { cls: 'bw-spot', parent: row });
      const circle = el('div', { cls: `bw-spot-circle${loc.state === 'active' ? ' now' : ''}`, parent: spot });
      const img = el('img', { cls: 'bw-spot-img', parent: circle }) as HTMLImageElement;
      img.src = `assets/build/spots/${loc.art}`; img.alt = ''; img.draggable = false;
      // Бейдж статуса — РОДНОЙ svg из Figma (с градиентной обводкой): ✓ для пройденной, замок для закрытой.
      if (loc.state === 'done' || loc.state === 'locked') {
        const badge = el('img', { cls: 'bw-spot-badge', parent: spot }) as HTMLImageElement;
        badge.src = loc.state === 'done' ? 'assets/build/icon-done.svg' : 'assets/build/icon-locked.svg';
        badge.alt = ''; badge.draggable = false;
      }
      el('div', { cls: 'bw-spot-label', text: loc.name, parent: spot });
      spot.addEventListener('pointerup', () => {
        if (loc.state === 'locked') this.callbacks.onStub('🔒 Locked', `${loc.name} unlocks later — keep upgrading your bank.`);
      });
    }
  }

  // ─── Карточки построек ────────────────────────────────────────────────────────
  private buildList(): void {
    const list = el('div', { cls: 'bw-list', parent: this.root });
    balance.build.buildings.forEach((def, i) => {
      const root = el('div', { cls: 'bw-card', parent: list });
      const content = el('div', { cls: 'bw-card-content', parent: root });
      const name = el('div', { cls: 'bw-card-name', text: def.name, parent: content });
      const art = el('img', { cls: 'bw-card-art', parent: content }) as HTMLImageElement;
      art.src = `assets/build/items/${def.art}`; art.alt = def.name; art.draggable = false;
      const steps = el('div', { cls: 'bw-steps', parent: content });
      const cost = el('div', { cls: 'bw-cost', parent: content });
      root.addEventListener('pointerup', () => this.onCardTap(i, root));
      this.cards.push({ root, steps, cost, name, index: i });
    });
  }

  private onCardTap(i: number, root: HTMLDivElement): void {
    const d = getData();
    const def = balance.build.buildings[i]!;
    const step = buildStep(d.build.steps, def.id);
    if (step >= balance.build.upgradesPerBuilding) { this.bounce(root, 1.04); return; } // уже максимум
    const cost = buildUpgradeCost(i, step);
    if (d.balance < cost) { this.shake(root); this.flashMoney(); return; } // не хватает денег
    update((dd) => { dd.balance -= cost; dd.build.steps[def.id] = step + 1; });
    save();
    this.refresh();
    this.bounce(root, 1.1);
    this.callbacks.onChange();
  }

  // ─── Обновление значений из сейва ─────────────────────────────────────────────
  refresh(): void {
    const d = getData();
    this.moneyVal.textContent = formatMoney(d.balance);
    this.diamondVal.textContent = String(d.diamonds);
    this.energyCur.textContent = String(d.energy);
    this.barFill.style.width = `${(locationProgress(d.build.steps) * 100).toFixed(1)}%`;

    const max = balance.build.upgradesPerBuilding;
    for (const c of this.cards) {
      const def = balance.build.buildings[c.index]!;
      const step = buildStep(d.build.steps, def.id);
      const maxed = step >= max;
      const cost = buildUpgradeCost(c.index, step);
      const ready = !maxed && d.balance >= cost;
      c.root.classList.toggle('ready', ready);
      c.root.classList.toggle('maxed', maxed);
      c.root.classList.toggle('dim', !ready && !maxed);

      // Точки прогресса (n из max).
      c.steps.textContent = '';
      for (let k = 0; k < max; k++) el('span', { cls: `bw-dot${k < step ? ' on' : ''}`, parent: c.steps });

      // Стоимость следующего шага (или MAX).
      c.cost.textContent = '';
      if (maxed) {
        el('div', { cls: 'bw-card-max', text: 'MAX', parent: c.cost });
      } else {
        const ico = el('img', { cls: 'bw-cost-ico', parent: c.cost }) as HTMLImageElement;
        ico.src = 'assets/hud/icon-money.png'; ico.alt = ''; ico.draggable = false;
        el('span', { cls: 'bw-cost-val', text: formatMoney(cost), parent: c.cost });
      }
    }
  }

  // ─── Открытие / закрытие ──────────────────────────────────────────────────────
  open(): void { this.root.style.display = 'block'; this.refresh(); }
  close(): void { this.root.style.display = 'none'; }
  isOpen(): boolean { return this.root.style.display === 'block'; }

  // ─── Микроанимации ────────────────────────────────────────────────────────────
  private bounce(node: HTMLElement, peak: number): void {
    node.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${peak})` }, { transform: 'scale(1)' }],
      { duration: 240, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }

  private shake(node: HTMLElement): void {
    node.animate(
      [
        { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
        { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
      ],
      { duration: 280, easing: 'ease-in-out' },
    );
  }

  /** Подсветить счётчик денег, когда на прокачку не хватает. */
  private flashMoney(): void {
    const pill = this.moneyVal.closest('.bw-counter') as HTMLElement | null;
    if (!pill) return;
    pill.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease-out' },
    );
  }
}
