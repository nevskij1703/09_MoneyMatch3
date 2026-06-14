// ЕДИНЫЙ источник правды по балансу MoneyMatch3.
//
// Поля сгруппированы по доменам (board / match / economy / boosters). Все формулы
// в core/* читают только отсюда. Параметры можно override'ить из дев-панели
// (см. core/balanceRuntime.ts) — изменения мутируют этот объект и сохраняются в
// localStorage['mmatch_balance_override'].

import type { BoosterId } from '../core/boosters';

export interface TierDef {
  id: number;
  /** Имя для UI/отладки. value не хранится: tierValue(t) = 2^t. */
  name: string;
  /** Hex-цвет placeholder-плитки (до арта). Для T1..namedTiers.length. */
  tint: number;
}

export interface BoosterDef {
  id: BoosterId;
  /** Имя для UI. */
  name: string;
  /** Короткий значок для кнопки-заглушки до арта. */
  glyph: string;
  /** Сколько штук дать в стартовом инвентаре. */
  starterCount: number;
}

export interface Balance {
  /** Жёсткий cap тира (защита tierValue/арта). Активный набор задаёт tierCount. */
  maxTier: number;
  /** Именованные тиры с tint. Для T > namedTiers.length — генерируется в money.getTierStyle. */
  namedTiers: TierDef[];
  /** Число активных типов плиток на поле. Старт — 4 (T1..T4). Растёт с прогрессией (будущее). */
  tierCount: number;
  board: {
    cols: number;
    rows: number;
  };
  match: {
    /** Минимальная длина цепочки для сбора. 2 = достаточно двух соседних одинаковых. */
    minChain: number;
    /** Диагональная смежность. true = 8 соседей (орт.+диагонали), цепочку можно вести «узелком»
     *  (повторно одну клетку выбрать нельзя). false = только ортогонально (в линию). */
    diagonal: boolean;
    /** Бонус-множитель ценности за каждую плитку сверх minChain: mult = 1 + (len−minChain)·comboStep. */
    comboStep: number;
    /** Масштаб денег за плитку: collect = tierValue(t) × baseTileValue × investmentMultiplier. */
    baseTileValue: number;
  };
  economy: {
    /** Стартовый Баланс на новом сейве. */
    startBalance: number;
    /** Стартовый запас 💎. */
    startDiamonds: number;
    /** Стартовый множитель ценности сбора (инвестиции поднимают его — будущая фича). */
    investmentMultiplier: number;
  };
  boosters: {
    /** 4 типа бустеров (пока заглушки — помогают собирать деньги с поля). */
    definitions: BoosterDef[];
  };
}

export const balance: Balance = {
  maxTier: 99,
  namedTiers: [
    { id: 1, name: 'Монета',       tint: 0xb87333 },
    { id: 2, name: 'Стопка монет', tint: 0xc0c0c0 },
    { id: 3, name: 'Купюра',       tint: 0x66bb6a },
    { id: 4, name: 'Пачка купюр',  tint: 0x2e7d32 },
    { id: 5, name: 'Чемодан денег', tint: 0x6d4c41 },
    { id: 6, name: 'Золотой слиток', tint: 0xffd700 },
    { id: 7, name: 'Бриллиант',    tint: 0x40c4ff },
    { id: 8, name: 'Сейф',         tint: 0x37474f },
  ],
  // Старт — 4 типа объектов (арт T1..T4). Прогрессия добавит тиры позже.
  tierCount: 4,
  board: {
    cols: 6,
    rows: 6,
  },
  match: {
    minChain: 2,
    diagonal: true,   // 8 направлений (орт.+диагонали); цепочку можно вести «узелком», без повторов клеток
    comboStep: 0.1,    // 5-цепочка (3 сверх min) → ×1.3
    baseTileValue: 5,  // T1-плитка = $10, T4-плитка = $80 (× tierValue 2^t)
  },
  economy: {
    startBalance: 0,
    startDiamonds: 50,
    investmentMultiplier: 1,
  },
  boosters: {
    // Заглушки этой итерации (реальные эффекты — будущая фаза). Помогают собирать деньги:
    definitions: [
      { id: 'shuffle',   name: 'Перемешать', glyph: '🔀', starterCount: 3 },
      { id: 'hammer',    name: 'Молоток',    glyph: '🔨', starterCount: 3 },
      { id: 'lightning', name: 'Молния',     glyph: '⚡', starterCount: 3 },
      { id: 'magnet',    name: 'Магнит',     glyph: '🧲', starterCount: 3 },
    ],
  },
};
