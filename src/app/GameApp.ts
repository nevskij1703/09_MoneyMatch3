// Оркестратор главного экрана MoneyMatch3.
//
// Держит #stage 384×844 с FIT-масштабированием, собирает вью (HUD / Баффет /
// поле / нижняя зона), пробрасывает сбор цепочки в экономику (Баланс) и открывает
// заглушки разделов. Пассивного дохода/таймеров нет — игра активная (tick-петля
// не нужна). Сохраняем при сборе и на visibility/pagehide.

import { getData, save, update } from '../core/storage';
import { commitMove, comboTotal, tileCollectValue } from '../core/economy';
import { formatMoney } from '../core/money';
import type { Tier } from '../types';
import type { BoosterId } from '../core/boosters';
import { balance } from '../config/balance';
import { el } from '../ui/dom/dom';
import { HudView } from '../ui/dom/hudView';
import { BuffettView } from '../ui/dom/buffettView';
import { BoardView } from '../ui/dom/boardView';
import { ActionBarView } from '../ui/dom/actionBarView';
import { openStubModal } from '../ui/stubModal';

const DESIGN_W = 384;
const DESIGN_H = 844;

export class GameApp {
  private hud!: HudView;
  private buffett!: BuffettView;
  private board!: BoardView;
  private actionBar!: ActionBarView;
  private comboEl: HTMLDivElement | null = null;
  private moveBaseSum = 0; // накопленная база денег за текущий ход (до комбо-бонуса)
  private moveCombo = 0;   // накопленный уровень комбо за ход (число натуральных матч-групп)

  constructor(private stage: HTMLElement) {
    this.layout();
    window.addEventListener('resize', this.layout);

    this.hud = new HudView(stage, { onDiamondsTap: () => this.openShop() });
    this.buffett = new BuffettView(stage);

    this.board = new BoardView(stage, getData().board, {
      onCascadeStep: (tiers, groups) => this.onCascadeStep(tiers, groups),
      onMoveEnd: () => this.onMoveEnd(),
      onPersist: () => save(),
    });

    this.actionBar = new ActionBarView(stage, {
      onBooster: (id) => this.onBooster(id),
      onPortfolioTap: () =>
        this.openStub('📊 Портфель', 'Портфель — в разработке. Сводка капитала, статистика и коллекции будут здесь.'),
      onTasksTap: () =>
        this.openStub('📋 Задачи', 'Задачи — в разработке. Ежедневные цели и награды появятся позже.'),
      onInvestsTap: () =>
        this.openStub('📈 Инвестиции', 'Инвестиции — в разработке. Здесь можно будет тратить Баланс, чтобы повышать ценность собираемых денег.'),
      onShopTap: () => this.openShop(),
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
    if (combo >= 2) this.buffett.popReaction();
    this.flyMoneyToBalance(gained); // на прилёте обновит HUD-баланс
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

  /** Деньги «улетают» из баннера комбо в плашку Баланса; на прилёте Баланс обновляется. */
  private flyMoneyToBalance(amount: number): void {
    const banner = this.comboEl;
    this.comboEl = null;
    if (banner) {
      const a = banner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      a.onfinish = () => banner.remove();
    }
    // Старт — над полем (где баннер), цель — центр баланс-плашки (≈192,127) в дизайн-координатах.
    const startX = 192, startY = 345;
    const dx = 192 - startX, dy = 127 - startY;
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
      this.hud.refresh();
      this.hud.bumpBalance();
    };
  }

  private onBooster(id: BoosterId): void {
    const def = balance.boosters.definitions.find((b) => b.id === id);
    this.openStub(
      `${def?.glyph ?? '🎁'} ${def?.name ?? 'Бустер'}`,
      'Бустер — в разработке. Поможет собирать деньги с поля (перемешать, разбить плитку, собрать линию и т.п.). Появится в одной из ближайших итераций.',
    );
  }

  private openShop(): void {
    this.openStub('🛒 Магазин', 'Магазин — в разработке. Пополнение 💎 и бустер-паки появятся ближе к релизу.');
  }

  private openStub(title: string, message: string): void {
    openStubModal(title, message, {});
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.board.destroy();
    this.buffett.destroy();
  }
}
