// Мелкие DOM-хелперы для вью игрового экрана (создание элементов, цвет, текст).
// Pure-DOM, без зависимостей от логики. Используются hudView/clientsView/
// boardView/actionBarView/mergeFx.

export interface ElOpts {
  cls?: string;
  text?: string;
  /** Инлайн-стиль (cssText). Перетирает то, что не покрыто классом. */
  style?: string;
  parent?: HTMLElement;
}

/** Создать HTMLElement с классом/текстом/стилем и (опц.) добавить в parent. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOpts = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.style) node.style.cssText = opts.style;
  if (opts.parent) opts.parent.appendChild(node);
  return node;
}

/** 0xRRGGBB → '#rrggbb'. */
export function hexColor(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

/** Применить cssText (короткая запись, как в существующих модалках). */
export function css(node: HTMLElement, style: string): void {
  node.style.cssText = style;
}

/**
 * CSS-transform для центрирования элемента в точке (cx,cy) внутри слоя.
 * Конвенция всех анимируемых вью/FX: left:0;top:0→ transform двигает по центру.
 * translate(-50%,-50%) центрирует относительно собственного размера элемента,
 * поэтому scale не сдвигает центр. Анимация = интерполяция этой строки (WAAPI).
 */
export function centerTransform(cx: number, cy: number, scale = 1): string {
  return `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${scale})`;
}
