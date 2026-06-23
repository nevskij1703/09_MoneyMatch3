// Тайминги анимаций перемещения на поле (мс, либо px/мс для скорости падения).
//
// Это НЕ игровой баланс, а настройка «ощущения» анимаций — читается boardView во время
// проигрывания (значения берутся в момент анимации, поэтому правки применяются на лету).
// В DEV их можно крутить из дев-панели (вкладка «Анимации») и скопировать JSON; override
// хранится в localStorage['mmatch_anim_override'] и подмешивается ТОЛЬКО под import.meta.env.DEV
// (в release — чистые дефолты, ветка чтения override вырезается tree-shaking'ом).

export interface AnimConfig {
  /** Свап двух плиток, мс. */
  swapMs: number;
  /** Схлоп (pop) одной плитки, мс. */
  popMs: number;
  /** Волна сбора бустера до самой дальней клетки, мс (radial span). */
  boosterWaveMs: number;
  /** Скорость падения, px/мс — ОДНА для уцелевших и для досыпки (чтобы они падали одинаково). */
  fallSpeed: number;
  /** Вертикальный зазор между сыплющимися предметами столбца, в ячейках. */
  refillGapCells: number;
  /** Появление спавна (бустер из матча / награда сейфа), мс. */
  spawnMs: number;
  /** Полёт дрона: минимум (близкая цель), мс. */
  droneFlightMinMs: number;
  /** Полёт дрона: максимум (дальняя цель), мс. */
  droneFlightMaxMs: number;
  /** Полёт собранного 💎/⚡ в баланс/энергию, мс. */
  collectFlyMs: number;
  /** Раскрытие сейфа (растворение + производные FX), мс. */
  safeOpenMs: number;
}

export const DEFAULT_ANIM: AnimConfig = {
  swapMs: 300,
  popMs: 460,
  boosterWaveMs: 310,
  fallSpeed: 0.45,
  refillGapCells: 1.5,
  spawnMs: 560,
  droneFlightMinMs: 920,
  droneFlightMaxMs: 1900,
  collectFlyMs: 1080,
  safeOpenMs: 680,
};

/** Активная конфигурация (читается boardView). Мутабельна — правки из дев-панели применяются на лету. */
export const anim: AnimConfig = { ...DEFAULT_ANIM };

const ANIM_KEY = 'mmatch_anim_override';

// DEV: подмешать сохранённый override поверх дефолтов (в release ветка вырезается).
if (import.meta.env.DEV) {
  try {
    const raw = localStorage.getItem(ANIM_KEY);
    if (raw) Object.assign(anim, JSON.parse(raw));
  } catch { /* ignore */ }
}

/** DEV: применить частичные изменения скоростей + сохранить в localStorage. */
export function setAnim(patch: Partial<AnimConfig>): void {
  Object.assign(anim, patch);
  try { localStorage.setItem(ANIM_KEY, JSON.stringify(anim)); } catch { /* ignore */ }
}

/** DEV: сброс к дефолтам (удаляет override). */
export function resetAnim(): void {
  Object.assign(anim, DEFAULT_ANIM);
  try { localStorage.removeItem(ANIM_KEY); } catch { /* ignore */ }
}
