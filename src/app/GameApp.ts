// Оркестратор главного экрана Hamster Bank.
//
// Держит #stage 390×844 с FIT-масштабированием, собирает вью (шапка / карта баланса /
// офферы / инфо-строка / поле / нижняя зона), пробрасывает сбор каскада в экономику
// (Баланс) и открывает заглушки разделов. Пассивного дохода/таймеров нет — игра активная.
// Сохраняем при сборе и на visibility/pagehide.

import { getData, save, update } from '../core/storage';
import { commitMove, comboTotal, tileCollectValue } from '../core/economy';
import { formatMoney } from '../core/money';
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

  constructor(private stage: HTMLElement) {
    this.layout();
    window.addEventListener('resize', this.layout);

    this.header = new HeaderView(stage, {
      onBell: () => this.openStub('🔔 Уведомления', 'Уведомления — в разработке. Здесь появятся новости, награды и напоминания.'),
      onSettings: () => this.openStub('⚙️ Настройки', 'Настройки — в разработке. Звук, вибрация и язык появятся здесь.'),
    });
    this.card = new BalanceCardView(stage);
    this.offers = new OffersView(stage, {
      onSale: () => this.openStub('🐷 SALE', 'Спецпредложение — в разработке. Наборы 💎 со скидкой появятся ближе к релизу.'),
      onAd: () => this.openStub('▶️ Watch Ad', 'Просмотр рекламы за награду — в разработке. Появится в одной из ближайших итераций.'),
    });
    this.infoRow = new InfoRowView(stage);

    this.board = new BoardView(stage, getData().board, {
      onCascadeStep: (tiers, groups) => this.onCascadeStep(tiers, groups),
      onMoveEnd: () => this.onMoveEnd(),
      onPersist: () => save(),
    });

    this.actionBar = new ActionBarView(stage, {
      onBooster: (id) => this.onBooster(id),
      onTab: (id) => this.onTab(id),
    });

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

  /** Шаг каскада: копим базовую сумму и уровень комбо, обновляем баннер над полем. */
  private onCascadeStep(tiers: Tier[], naturalGroups: number): void {
    const mult = getData().investmentMultiplier;
    for (const t of tiers) this.moveBaseSum += tileCollectValue(t, mult);
    this.moveCombo += naturalGroups;
    if (this.moveCombo >= 1) this.updateCombo(this.moveCombo, comboTotal(this.moveBaseSum, this.moveCombo));
  }

  /** Конец хода (поле перестало матчиться): зачислить накопленное в Баланс с полётом денег. */
  private onMoveEnd(): void {
    const baseSum = this.moveBaseSum;
    const combo = this.moveCombo;
    this.moveBaseSum = 0;
    this.moveCombo = 0;
    if (baseSum <= 0) { this.clearCombo(); return; } // ход без матчей (откат) — баннера нет

    let gained = 0;
    update((d) => { gained = commitMove(d, baseSum, combo); });
    if (combo >= 2) this.card.mascotReact();
    this.flyMoneyToBalance(gained); // на прилёте обновит карту-баланс
    save();
  }

  /** Создать/обновить баннер «Комбо ×N» + сумму $ под ним (нарастает по ходу). level ≥ 1. */
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
    title.textContent = `Комбо ×${level}`;
    title.style.fontSize = `${40 + Math.min(level, 8) * 3}px`;
    title.style.color = level >= 5 ? '#ff5252' : level >= 3 ? '#ff9f1c' : '#ffd23f';
    money.textContent = `$${formatMoney(total)}`;
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
      text: `+$${formatMoney(amount)}`,
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
      `${def?.glyph ?? '🎁'} ${def?.name ?? 'Бустер'}`,
      'Бустер — в разработке. Будет давать эффект на поле (взрыв, ряд/столбец, сбор тира и т.п.). Появится в одной из ближайших итераций.',
    );
  }

  private onTab(id: TabId): void {
    const stubs: Record<TabId, [string, string]> = {
      build: ['🔨 Постройка', 'Постройка — в разработке. Здесь будешь строить и улучшать свой банк.'],
      tasks: ['📋 Задачи', 'Задачи — в разработке. Ежедневные цели и награды появятся позже.'],
      collections: ['🗂️ Коллекции', 'Коллекции — в разработке. Собирай наборы и получай бонусы.'],
      shop: ['🛒 Магазин', 'Магазин — в разработке. Пополнение 💎 и бустер-паки появятся ближе к релизу.'],
    };
    const [title, msg] = stubs[id];
    this.openStub(title, msg);
  }

  private openStub(title: string, message: string): void {
    openStubModal(title, message, {});
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.board.destroy();
  }
}
