// ЕДИНЫЙ источник правды по балансу MoneyMatch3.
//
// Поля сгруппированы по доменам (board / match / economy / boosters). Все формулы
// в core/* читают только отсюда. Параметры можно override'ить из дев-панели
// (см. core/balanceRuntime.ts) — изменения мутируют этот объект и сохраняются в
// localStorage['mmatch_balance_override'].

import type { BoosterId } from '../core/boosters';

export interface TierDef {
  id: number;
  /** Имя для UI/отладки. value не хранится: tierValue(t) = t (линейно). */
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

/** Постройка локации в окне Build (карточка, прокачивается до upgradesPerBuilding раз). */
export interface BuildBuildingDef {
  /** Стабильный id (ключ шагов в сейве, не зависит от порядка). */
  id: string;
  /** Имя для UI (англ.). */
  name: string;
  /** Файл арта постройки в public/assets/build/items/. */
  art: string;
}

/** Локация в верхнем ряду окна Build (пока активна хардкодно одна — см. activeLocation). */
export interface BuildLocationDef {
  id: string;
  name: string;
  /** Файл миниатюры локации в public/assets/build/spots/. */
  art: string;
  /** Состояние точки: пройдена / текущая / закрыта. */
  state: 'done' | 'active' | 'locked';
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
    /** Линия такой длины (но короче colorLineLen) рождает 🚀 «Ракету». По умолчанию 4. */
    rocketLineLen: number;
    /** Линия такой длины (или длиннее) рождает спецтайл «Магнит» (color). По умолчанию 5. */
    colorLineLen: number;
    /** Радиус взрыва «Бомбы» (bomb): 1 = область 3×3. */
    bombRadius: number;
    /** Денежный бонус за 1-й уровень комбо (2-е натуральное исчезновение за ход). По умолч. +5%. */
    comboBaseBonus: number;
    /** Прирост денежного бонуса за каждый следующий уровень комбо. По умолч. +1% (×2→+6%, ×3→+7%). */
    comboBonusStep: number;
    /** Множитель денег за плитку: collect = tierValue(t)=t × baseTileValue × investmentMultiplier (при 1 → T_t = $t). */
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
    /** Сколько энергии восстанавливается за один интервал регена. */
    regenAmount: number;
    /** Длительность интервала регена в секундах (+regenAmount каждые regenSeconds). */
    regenSeconds: number;
    /** Сколько энергии тратится за один ход (успешный свап с матчем). */
    costPerMove: number;
  };
  /** Собираемые объекты на поле (алмаз/молния/сейф) — шансы спавна при досыпке и их эффект. */
  collect: {
    /** Шанс, что досыпанная клетка — 💎 алмаз (вместо обычной плитки). */
    diamondChance: number;
    /** Шанс, что досыпанная клетка — ⚡ молния (энергия). */
    lightningChance: number;
    /** Шанс, что досыпанная клетка — 🎁 сейф (лутбокс). */
    safeChance: number;
    /** Сколько энергии даёт одна собранная молния (без множителей). */
    lightningEnergy: number;
    /** Веса наград сейфа при открытии (booster — случайный из bomb/rocket/magnet/drone). */
    safeReward: { booster: number; diamond: number; lightning: number };
  };
  boosters: {
    /** 4 бустера-кнопки (bomb/drone/rocket/magnet; эффекты — будущее). На поле НЕ спавнятся. */
    definitions: BoosterDef[];
  };
  /**
   * Окно «Build» (вкладка слева внизу): прокачка построек текущей локации.
   * Цены прокачки — геометрическая лесенка от costMin (1-й шаг 1-й постройки) до costMax
   * (последний шаг последней постройки), равномерно по всем building×step ячейкам.
   * В будущем локаций станет несколько; пока активна одна (activeLocation).
   */
  build: {
    /** Сколько раз можно прокачать каждую постройку. */
    upgradesPerBuilding: number;
    /** Цена самого дешёвого шага (1-я постройка, 1-й шаг). */
    costMin: number;
    /** Цена самого дорогого шага (последняя постройка, последний шаг). */
    costMax: number;
    /** Индекс активной (хардкодно открытой) локации в locations. Пока 2-я (Jet). */
    activeLocation: number;
    /** Файл арта-фона активной локации в public/assets/build/. */
    locationArt: string;
    /** Верхний ряд локаций (визуал; интерактивна только активная). */
    locations: BuildLocationDef[];
    /** Постройки активной локации, по возрастанию цены (порядок = индекс лесенки). */
    buildings: BuildBuildingDef[];
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
    rocketLineLen: 4,  // линия из 4 → 🚀 «Ракета» (сносит ряд/столбец по ориентации линии)
    colorLineLen: 5,   // линия из 5 → 🧲 «Магнит» (сносит весь тир)
    bombRadius: 1,        // T/L (пересечение линий) → 💣 «Бомба»: взрыв 3×3 (радиус 1); квадрат 2×2 → 🛸 «Дрон»
    comboBaseBonus: 0.05, // Комбо → +5% к деньгам шага
    comboBonusStep: 0.01, // каждый следующий уровень: +1% (Комбо ×2 → +6%, ×3 → +7%, …)
    baseTileValue: 1,     // линейно: T1 = $1, T2 = $2, … T_t = $t (× tierValue(t)=t)
  },
  economy: {
    startBalance: 0,
    startDiamonds: 50,
    investmentMultiplier: 1,
  },
  startLevel: 1,
  energy: {
    max: 100,
    regenAmount: 10,   // +10 энергии…
    regenSeconds: 600, // …каждые 10 минут
    costPerMove: 1,    // −1 за ход (успешный свап с матчем)
  },
  collect: {
    diamondChance: 0.005,  // ~0.5% досыпанных клеток — алмаз
    lightningChance: 0.01, // ~1% — молния (энергия)
    safeChance: 0.01,      // ~1% — сейф (лутбокс)
    lightningEnergy: 3,    // молния → +3 энергии
    safeReward: { booster: 0.6, diamond: 0.15, lightning: 0.15 }, // что выпадает из сейфа (нормируется по сумме)
  },
  boosters: {
    // Кнопки-бустеры (реальные эффекты — будущая фаза). Иконки — public/assets/boosters/<id>.png.
    // glyph — эмодзи-фолбэк. starterCount подобран под демо-вид макета. Имена — англ. (UI на англ.).
    definitions: [
      { id: 'bomb',   name: 'Bomb',   glyph: '💣', starterCount: 3 },
      { id: 'drone',  name: 'Drone',  glyph: '🛸', starterCount: 8 },
      { id: 'rocket', name: 'Rocket', glyph: '🚀', starterCount: 12 },
      { id: 'magnet', name: 'Magnet', glyph: '🧲', starterCount: 0 },
    ],
  },
  build: {
    upgradesPerBuilding: 5,
    costMin: 1_000,    // 1K — дешёвый первый шаг
    costMax: 9.99e15,  // 9.99Qa — самый дорогой шаг
    activeLocation: 1, // хардкодно открыта 2-я локация (Jet); остальные — done/locked (визуал)
    locationArt: 'loc-jet.png',
    locations: [
      { id: 'office',    name: 'Office',    art: 'office.png',    state: 'done'   },
      { id: 'jet',       name: 'Jet',       art: 'jet.png',       state: 'active' },
      { id: 'garage',    name: 'Garage',    art: 'garage.png',    state: 'locked' },
      { id: 'penthouse', name: 'Penthouse', art: 'penthouse.png', state: 'locked' },
      { id: 'yacht',     name: 'Yacht',     art: 'yacht.png',     state: 'locked' },
    ],
    buildings: [
      { id: 'seats',  name: 'Seats',  art: 'seats.png'  },
      { id: 'table',  name: 'Table',  art: 'table.png'  },
      { id: 'shelf',  name: 'Shelf',  art: 'shelf.png'  },
      { id: 'tv',     name: 'TV',     art: 'tv.png'     },
      { id: 'dishes', name: 'Dishes', art: 'dishes.png' },
    ],
  },
};
