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
    /** Минимальная длина линии для схлопывания (классический match-3 = 3). */
    minLine: number;
    /** Линия такой длины (или длиннее) рождает спецтайл «Магнит» (color). По умолчанию 5. */
    colorLineLen: number;
    /** Радиус взрыва «Бомбы» (bomb) из квадрата 2×2: 1 = область 3×3. */
    bombRadius: number;
    /** Денежный бонус за 1-й уровень комбо (2-е натуральное исчезновение за ход). По умолч. +5%. */
    comboBaseBonus: number;
    /** Прирост денежного бонуса за каждый следующий уровень комбо. По умолч. +1% (×2→+6%, ×3→+7%). */
    comboBonusStep: number;
    /** Масштаб денег за плитку: collect = tierValue(t) × baseTileValue × investmentMultiplier. */
    baseTileValue: number;
  };
  economy: {
    /** Стартовый Баланс на новом сейве. */
    startBalance: number;
    /** Стартовый запас 💎. */
    startDiamonds: number;
    /** Стартовый множитель ценности сбора (HUD «Income ×N»; инвестиции/уровень поднимают — будущее). */
    investmentMultiplier: number;
  };
  /** Стартовый уровень игрока (HUD «Level»; прокачка — будущее окно). */
  startLevel: number;
  energy: {
    /** Максимум энергии (HUD «N/max»). */
    max: number;
    /** Секунд на восстановление 1 энергии (показ таймера; реген/трата — будущее). */
    regenSeconds: number;
  };
  boosters: {
    /** 4 бустера-кнопки (bomb/drone/rocket/magnet; эффекты — будущее). На поле НЕ спавнятся. */
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
    rows: 5, // макет Hamster Bank: 6×5 (освобождает место под Level/Energy/Income, офферы, кнопки-бустеры)
  },
  match: {
    minLine: 3,        // 3 в ряд по верт./гориз. схлопываются
    colorLineLen: 5,   // линия из 5 → спецтайл «Магнит» (сносит весь тир)
    bombRadius: 1,        // квадрат 2×2 → «Бомба»: взрыв 3×3 (радиус 1)
    comboBaseBonus: 0.05, // Комбо → +5% к деньгам шага
    comboBonusStep: 0.01, // каждый следующий уровень: +1% (Комбо ×2 → +6%, ×3 → +7%, …)
    baseTileValue: 5,     // T1-плитка = $10, T4-плитка = $80 (× tierValue 2^t)
  },
  economy: {
    startBalance: 0,
    startDiamonds: 50,
    investmentMultiplier: 1,
  },
  startLevel: 1,
  energy: {
    max: 100,
    regenSeconds: 600,
  },
  boosters: {
    // Кнопки-бустеры (реальные эффекты — будущая фаза). Иконки — public/assets/boosters/<id>.png.
    // glyph — эмодзи-фолбэк. starterCount подобран под демо-вид макета.
    definitions: [
      { id: 'bomb',   name: 'Бомба',  glyph: '💣', starterCount: 3 },
      { id: 'drone',  name: 'Дрон',   glyph: '🛸', starterCount: 8 },
      { id: 'rocket', name: 'Ракета', glyph: '🚀', starterCount: 12 },
      { id: 'magnet', name: 'Магнит', glyph: '🧲', starterCount: 0 },
    ],
  },
};
