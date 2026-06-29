// Оркестратор главного экрана Hamster Bank.
//
// Держит #stage 390×844 с масштабом ПОД ВЫСОТУ вьюпорта, собирает вью (шапка / карта баланса /
// офферы / инфо-строка / поле / нижняя зона), пробрасывает сбор каскада в экономику
// (Баланс) и открывает заглушки разделов. Энергия: тик 1с восстанавливает её по времени
// и обновляет таймер; ход тратит энергию (нет энергии → свайп заблокирован). UI на английском.

import { getData, save, update } from '../core/storage';
import { commitMove, comboTotal, tileCollectValue } from '../core/economy';
import { regenEnergy, hasEnergyForMove, spendEnergyForMove } from '../core/energy';
import { formatMoneyFull } from '../core/money';
import type { Tier, BoosterKind } from '../types';
import type { BoosterId } from '../core/boosters';
import { boosterIdToKind } from '../core/boosters';
import { balance } from '../config/balance';
import { el, centerTransform } from '../ui/dom/dom';
import { boosterIconUrl } from '../ui/dom/boosterArt';
import { HeaderView } from '../ui/dom/headerView';
import { BalanceCardView, MONEY_TARGET } from '../ui/dom/balanceCardView';
import { OffersView } from '../ui/dom/offersView';
import { InfoRowView } from '../ui/dom/infoRowView';
import { BoardView } from '../ui/dom/boardView';
import { ActionBarView, type TabId } from '../ui/dom/actionBarView';
import { BuildWindowView } from '../ui/dom/buildWindowView';
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
  private buildWindow!: BuildWindowView;

  private comboEl: HTMLDivElement | null = null;
  private moveBaseSum = 0; // накопленная база денег за текущий ход (до комбо-бонуса)
  private moveCombo = 0;   // накопленный уровень комбо за ход (число натуральных матч-групп)
  private energyTimer: number | null = null;
  // Перетаскивание бустера из инвентаря на поле (drag-постановка).
  private drag: { id: BoosterId; kind: BoosterKind; ghost: HTMLElement; pointerId: number } | null = null;

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
      onSpendEnergy: () => this.onSpendEnergy(),
      onCascadeStep: (tiers, groups) => this.onCascadeStep(tiers, groups),
      onCollect: (kind) => this.onCollect(kind),
      onMoveEnd: () => this.onMoveEnd(),
      onPersist: () => save(),
    });

    this.actionBar = new ActionBarView(stage, {
      onBoosterPickup: (id, e) => this.onBoosterPickup(id, e),
      onTab: (id) => this.onTab(id),
      onPlay: () => this.onPlay(),
    });

    // Окно «Build» — оверлей под nav; открывается вкладкой Build, закрывается Play.
    this.buildWindow = new BuildWindowView(stage, {
      onChange: () => this.card.refresh(),
      onStub: (title, msg) => this.openStub(title, msg),
    });

    // Тик энергии: реген по времени + обновление значения/таймера.
    regenEnergy(getData(), Date.now());
    this.infoRow.refresh();
    this.energyTimer = window.setInterval(this.tickEnergy, 1000);

    window.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /**
   * Масштаб #stage ПОД ВЫСОТУ вьюпорта — портретный экран всегда заполняется по вертикали
   * (без верх./нижних полей). Ширина следует пропорции 390×844: на более узких аспектах края
   * чуть клипуются (html/body overflow:hidden), на более широких — холст центрируется с
   * боковыми полями. transform-origin центр → клип симметричный.
   */
  private layout = (): void => {
    const s = window.innerHeight / DESIGN_H;
    this.stage.style.transform = `scale(${s})`;
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') save();
  };
  private onPageHide = (): void => { save(); };

  /** 1с тик: восстановить энергию по времени и обновить HUD (и счётчики окна Build, если открыто). */
  private tickEnergy = (): void => {
    regenEnergy(getData(), Date.now());
    this.infoRow.refresh();
    if (this.buildWindow?.isOpen()) this.buildWindow.refresh();
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

  /** Ход подтверждён (свайп/тап): списать энергию СРАЗУ (не дожидаясь схлопа фишек). */
  private onSpendEnergy(): void {
    update((d) => spendEnergyForMove(d, Date.now()));
    this.infoRow.refresh();
  }

  /** Собран алмаз/молния (без множителей): +1 💎 или +energy; обновить соответствующий HUD. */
  private onCollect(kind: 'diamond' | 'lightning'): void {
    update((d) => {
      if (kind === 'diamond') {
        d.diamonds += 1;
      } else {
        d.energy = Math.min(balance.energy.max, d.energy + balance.collect.lightningEnergy);
        if (d.energy >= balance.energy.max) d.energyTs = Date.now();
      }
    });
    if (kind === 'diamond') this.card.refresh();
    else this.infoRow.refresh();
    save();
  }

  /** Конец хода (поле перестало матчиться): зачислить накопленные деньги в Баланс. Энергия уже списана на свайпе. */
  private onMoveEnd(): void {
    const baseSum = this.moveBaseSum;
    const combo = this.moveCombo;
    this.moveBaseSum = 0;
    this.moveCombo = 0;
    if (baseSum <= 0) { this.clearCombo(); return; } // ход без матчей (откат) — денег нет

    let gained = 0;
    update((d) => { gained = commitMove(d, baseSum, combo); });
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

  // ─── Drag-постановка бустера из инвентаря на поле ────────────────────────────
  // Кнопка-бустер — источник: тянем «призрак» на поле и ставим на клетку. Что стояло на клетке —
  // ЗАМЕНЯЕТСЯ (не собирается, не активируется). Это не ход: энергия не тратится, каскад не идёт.

  /** Перевод экранной точки в дизайн-координаты #stage (учёт FIT-масштаба). */
  private clientToDesign(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.stage.getBoundingClientRect();
    const scale = r.width / DESIGN_W;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  private onBoosterPickup(id: BoosterId, e: PointerEvent): void {
    if (this.drag) return; // уже тянем
    if ((getData().boosters[id] ?? 0) <= 0) return; // подстраховка (кнопка тоже проверяет)
    const kind = boosterIdToKind(id);
    const ghost = el('div', { cls: 'hb-booster-ghost', parent: this.stage });
    const img = el('img', { parent: ghost }) as HTMLImageElement;
    img.src = boosterIconUrl(kind); img.alt = ''; img.draggable = false;
    this.drag = { id, kind, ghost, pointerId: e.pointerId };
    this.moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);
  }

  private moveGhost(clientX: number, clientY: number): void {
    if (!this.drag) return;
    const d = this.clientToDesign(clientX, clientY);
    this.drag.ghost.style.transform = centerTransform(d.x, d.y, 1.1);
  }

  private onDragMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.moveGhost(e.clientX, e.clientY);
    this.board.setDropHover(this.board.cellFromClient(e.clientX, e.clientY));
  };

  private onDragEnd = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const { id, kind, ghost } = this.drag;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    this.drag = null;
    this.board.setDropHover(-1);

    const idx = this.board.cellFromClient(e.clientX, e.clientY);
    const have = getData().boosters[id] ?? 0;
    if (idx !== -1 && have > 0 && this.board.placeBooster(idx, kind)) {
      update((d) => { d.boosters[id] = Math.max(0, (d.boosters[id] ?? 0) - 1); });
      this.actionBar.refresh();
      save();
      ghost.remove(); // на месте уже «вылупляется» настоящий бустер
    } else {
      const a = ghost.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      a.onfinish = () => ghost.remove();
    }
  };

  private cancelDrag(): void {
    if (!this.drag) return;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    this.board.setDropHover(-1);
    this.drag.ghost.remove();
    this.drag = null;
  }

  private onTab(id: TabId): void {
    if (id === 'build') { this.openBuild(); return; } // Build — реальное окно, не заглушка
    // Прочие вкладки — заглушки; уходя с Build, закрываем его окно.
    this.buildWindow.close();
    const stubs: Record<Exclude<TabId, 'build'>, [string, string]> = {
      tasks: ['📋 Tasks', 'Tasks are coming soon — daily goals and rewards.'],
      collections: ['🗂️ Collections', 'Collections are coming soon — gather sets and earn bonuses.'],
      shop: ['🛒 Shop', 'Shop is coming soon — 💎 top-ups and booster packs closer to release.'],
    };
    const [title, msg] = stubs[id];
    this.actionBar.highlight(id); // выделение переезжает на вкладку, пока открыт попап…
    openStubModal(title, msg, { onClose: () => this.actionBar.highlight('play') }); // …и возвращается на Play
  }

  /** Открыть окно «Build» (вкладка слева): выделение на Build, окно поверх экрана Play. */
  private openBuild(): void {
    this.actionBar.highlight('build');
    this.buildWindow.open();
  }

  /** Тап по «Play»: закрыть окно вкладки (если открыто) и вернуть выделение на Play. */
  private onPlay(): void {
    this.buildWindow.close();
    this.actionBar.highlight('play');
  }

  private openStub(title: string, message: string): void {
    openStubModal(title, message, {});
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.energyTimer !== null) window.clearInterval(this.energyTimer);
    this.cancelDrag();
    this.board.destroy();
  }
}
