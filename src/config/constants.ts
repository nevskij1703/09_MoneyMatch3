// Палитра-заглушка для примитивов MVP (визуал придёт позже).
// (Дизайн-координаты экрана 384×844 живут в app/GameApp.ts — DESIGN_W/DESIGN_H.)
export const COLORS = {
  bg: 0x0e0f12,
  panel: 0x15171c,
  panelStroke: 0x3a414d,
  cell: 0x20242c,
  cellStroke: 0x3a414d,
  chainHighlight: 0xffd700,
  cash: 0x9fe870,        // зелёный — наличность
  gold: 0xe5c233,        // золотой — деньги/тиры
  text: 0xdddddd,
  textMuted: 0x8a8f99,
} as const;

/** Максимум часов оффлайн-расчёта (любой пропуск длиннее обрезается). */
export const MAX_OFFLINE_HOURS = 12;

/** Параметры визуальной отрисовки игрового поля. */
export const BOARD = {
  /** Зазор между плитками в px. */
  gap: 6,
  /** Радиус скругления плитки. */
  cornerRadius: 12,
  /** Толщина рамки выделенной клетки в цепочке. */
  chainStrokeWidth: 4,
  /** Толщина линии-цепочки между клетками. */
  chainLineWidth: 8,
} as const;

export const UI = {
  hudBg: 0x0a0b0e,
  btn: 0x2e7d32,
  btnDisabled: 0x3a3f47,
  btnText: '#ffffff',
} as const;
