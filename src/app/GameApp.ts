// Оркестратор главного экрана Hamster Bank.
//
// Держит #stage 390×844 с FIT-масштабированием, собирает вью (шапка / карта баланса /
// офферы / инфо-строка / поле / нижняя зона), пробрасывает сбор каскада в экономику
// (Баланс) и открывает заглушки разделов. Энергия: тик 1с восстанавливает её по времени
// и обновляет таймер; ход тратит энергию (нет энергии → свайп заблокирован). UI на английском.

import { getData, save, update } from '../core/storage';
import { commitMove, comboTotal, tileCollectValue } from '../core/economy';
import { regenEnergy, hasEnergyForMove, spendEnergyForMove } from '../core/energy';
import { formatMoneyFull } from '../core/money';
import type { Tier } from '../types';
import type { BoosterId } from '../core/boosters';
import { balance } from '../config/balance';
import { el } from '../ui/dom/dom';
import { HeaderView } from '../ui/dom/headerView';
import { BalanceCardView, MONEY_TARGET } from '../ui/dom/balanceCardView';
import { OffersView } from '../ui/dom/offersView';
import { InfoRowView } from '../ui/dom/infoRowView';
import { BoardView } from '../ui/dom/boardView';
import { ActionBarView, type TabId } from '../ui/dom/actionBarView';
import { openStubModal } from '../ui/stubModal';

const DESIGN_W = 390;
const DESIGN_H = 844;

export class GameApp {
  private header!: HeaderView;
  private card!: BalanceCardView;
  private offers!: OffersView;
  private infoRow!: InfoRowView;
  private board!: BoardView;
  private actionBar!: ActionBarView;

  private comboEl: HTMLDivElement | null = null;
  private moveBaseSum = 0; // накопленная база денег за текущий ход (до комбо-бонуса)
  private moveCombo = 0;   // накопленный уровень комбо за ход (число натуральных матч-групп)
  private energyTimer: number | null = null;

  constructor(private stage: HTMLElement) {
    this.layout();
    window.addEventListener('resize', this.layout);

    this.header = new HeaderView(stage, {
      onBell: () => this.openStub('🔔 Notifications', 'Notifications are coming soon — news, rewards and reminders will live here.'),
      onSettings: () => this.openStub('⚙️ Settings', 'Settings are coming soon — sound, vibration and language.'),
    });
    this.card = new BalanceCardView(stage);
    this.offers = new OffersView(stage, {
      onSale: () => this.openStub('🐷 SALE', 'Special offer is coming soon — discounted 💎 packs closer to release.'),
      onAd: () => this.openStub('▶️ Watch Ad', 'Rewarded video is coming soon — watch an ad for a reward.'),
    });
    this.infoRow = new InfoRowView(stage);

    this.board = new BoardView(stage, getData().board, {
      canMove: () => this.canMove(),
      onCascadeStep: (tiers, groups) => this.onCascadeStep(tiers, groups),
      onMoveEnd: () => this.onMoveEnd(),
      onPersist: () => save(),
    });

    this.actionBar = new ActionBarView(stage, {
      onBooster: (id) => this.onBooster(id),
      onTab: (id) => this.onTab(id),
    });

    // Тик энергии: реген по времени + обновление значения/таймера.
    regenEnergy(getData(), Date.now());
    this.infoRow.refresh();
    this.energyTimer = window.setInterval(this.tickEnergy, 1000);

    window.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** FIT-масштаб #stage под экран с сохранением пропорции макета. */
  private layout = (): void => {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    this.stage.style.transform = `scale(${s})`;
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') save();
  };
  private onPageHide = (): void => { save(); };

  /** 1с тик: восстановить энергию по времени и обновить HUD. */
  private tickEnergy = (): void => {
    regenEnergy(getData(), Date.now());
    this.infoRow.refresh();
  };

  /** Можно ли сделать ход (хватает ли энергии). Нет → пульс пилюли энергии. */
  private canMove(): boolean {
    regenEnergy(getData(), Date.now());
    if (hasEnergyForMove(getData())) return true;
    this.infoRow.refresh();
    this.infoRow.pulseEnergy();
    return false;
  }

  /** Шаг каскада: копим базовую сумму и уровень комбо, обновляем баннер над полем. */
  private onCascadeStep(tiers: Tier[], naturalGroups: number): void {
    const mult = getData().investmentMultiplier;
    for (const t of tiers) this.moveBaseSum += tileCollectValue(t, mult);
    this.moveCombo += naturalGroups;
    if (this.moveCombo >= 1) this.updateCombo(this.moveCombo, comboTotal(this.moveBaseSum, this.moveCombo));
  }

  /** Конец хода (поле перестало матчиться): зачислить накопленное в Баланс + списать энергию. */
  private onMoveEnd(): void {
    const baseSum = this.moveBaseSum;
    const combo = this.moveCombo;
    this.moveBaseSum = 0;
    this.moveCombo = 0;
    if (baseSum <= 0) { this.clearCombo(); return; } // ход без матчей (откат) — энергию не тратим

    let gained = 0;
    update((d) => {
      gained = commitMove(d, baseSum, combo);
      spendEnergyForMove(d, Date.now()); // успешный ход тратит энергию
    });
    this.infoRow.refresh();
    this.flyMoneyToBalance(gained); // на прилёте обновит карту-баланс
    save();
  }

  /** Создать/обновить баннер «Combo ×N» + сумму $ под ним (нарастает по ходу). level ≥ 1. */
  private updateCombo(level: number, total: number): void {
    if (!this.comboEl) {
      const root = document.createElement('div');
      root.className = 'combo-banner';
      el('div', { cls: 'combo-title', parent: root });
      el('div', { cls: 'combo-money', parent: root });
      this.stage.appendChild(root);
      this.comboEl = root;
    }
    const title = this.comboEl.querySelector('.combo-title') as HTMLDivElement;
    const money = this.comboEl.querySelector('.combo-money') as HTMLDivElement;
    title.textContent = `Combo ×${level}`;
    title.style.fontSize = `${40 + Math.min(level, 8) * 3}px`;
    title.style.color = level >= 5 ? '#ff5252' : level >= 3 ? '#ff9f1c' : '#ffd23f';
    money.textContent = `$${formatMoneyFull(total)}`;
    this.comboEl.animate(
      [{ transform: 'translate(-50%,0) scale(1.14)' }, { transform: 'translate(-50%,0) scale(1)' }],
      { duration: 220, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    );
  }

  private clearCombo(): void {
    if (this.comboEl) { this.comboEl.remove(); this.comboEl = null; }
  }

  /** Деньги «улетают» из баннера комбо в карту баланса; на прилёте карта обновляется. */
  private flyMoneyToBalance(amount: number): void {
    const banner = this.comboEl;
    this.comboEl = null;
    if (banner) {
      const a = banner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      a.onfinish = () => banner.remove();
    }
    // Старт — над полем (где баннер), цель — значение баланса в карте.
    const startX = 195, startY = 400;
    const dx = MONEY_TARGET.x - startX, dy = MONEY_TARGET.y - startY;
    const fly = el('div', {
      cls: 'combo-fly',
      text: `+$${formatMoneyFull(amount)}`,
      style: `left:${startX}px;top:${startY}px;`,
      parent: this.stage,
    });
    const anim = fly.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0 },
        { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.15 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0.55)`, opacity: 0.2 },
      ],
      { duration: 600, easing: 'cubic-bezier(0.5,0,0.7,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      fly.remove();
      this.card.refresh();
      this.card.bumpBalance();
    };
  }

  private onBooster(id: BoosterId): void {
    const def = balance.boosters.definitions.find((b) => b.id === id);
    this.openStub(
      `${def?.glyph ?? '🎁'} ${def?.name ?? 'Booster'}`,
      'This booster is coming soon — it will affect the board (blast, clear a row/column, collect a tier, etc.).',
    );
  }

  private onTab(id: TabId): void {
    const stubs: Record<TabId, [string, string]> = {
      build: ['🔨 Build', 'Build is coming soon — construct and upgrade your bank here.'],
      tasks: ['📋 Tasks', 'Tasks are coming soon — daily goals and rewards.'],
      collections: ['🗂️ Collections', 'Collections are coming soon — gather sets and earn bonuses.'],
      shop: ['🛒 Shop', 'Shop is coming soon — 💎 top-ups and booster packs closer to release.'],
    };
    const [title, msg] = stubs[id];
    this.actionBar.highlight(id); // выделение переезжает на вкладку, пока открыт попап…
    openStubModal(title, msg, { onClose: () => this.actionBar.highlight('play') }); // …и возвращается на Play
  }

  private openStub(title: string, message: string): void {
    openStubModal(title, message, {});
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.energyTimer !== null) window.clearInterval(this.energyTimer);
    this.board.destroy();
  }
}
