// Оркестратор главного экрана MoneyMatch3.
//
// Держит #stage 384×844 с FIT-масштабированием, собирает вью (HUD / Баффет /
// поле / нижняя зона), пробрасывает сбор цепочки в экономику (Баланс) и открывает
// заглушки разделов. Пассивного дохода/таймеров нет — игра активная (tick-петля
// не нужна). Сохраняем при сборе и на visibility/pagehide.

import { getData, save, update } from '../core/storage';
import { addCollected } from '../core/economy';
import type { Tier } from '../types';
import type { BoosterId } from '../core/boosters';
import { balance } from '../config/balance';
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

  constructor(private stage: HTMLElement) {
    this.layout();
    window.addEventListener('resize', this.layout);

    this.hud = new HudView(stage, { onDiamondsTap: () => this.openShop() });
    this.buffett = new BuffettView(stage);

    this.board = new BoardView(stage, getData().board, {
      onCollected: (tiers, comboIndex, spawnedSpecial) => this.onCollected(tiers, comboIndex, spawnedSpecial),
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

  /** Шаг каскада схлопнут: начислить в Баланс, обновить HUD, реакция Баффета на комбо/спецтайл. */
  private onCollected(tiers: Tier[], comboIndex: number, spawnedSpecial: boolean): number {
    let gained = 0;
    update((d) => { gained = addCollected(d, tiers, comboIndex); });
    this.hud.refresh();
    this.hud.bumpBalance();
    this.actionBar.refresh();
    if (comboIndex >= 2 || spawnedSpecial) this.buffett.popReaction();
    save();
    return gained;
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
