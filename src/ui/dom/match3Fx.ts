// VFX сбора цепочки (match-3): вспышка + ударная волна + разлетающиеся искры
// в точке сбора. DOM/WAAPI, работает в координатах слоя поля (panel). Классы
// .fx/.fx-flash/.fx-shockwave/.fx-spark — в styles.css.

import { el, centerTransform } from './dom';

type Pt = { x: number; y: number };

const EASE = {
  quadOut: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
} as const;

function removeNode(node: HTMLElement): void {
  if (node.parentNode) node.parentNode.removeChild(node);
}

/** Вспышка + ударная волна + N искр наружу из точки center. */
export function playCollectFx(layer: HTMLElement, cellSize: number, center: Pt): void {
  // Вспышка.
  const flashBase = cellSize * 1.6;
  const flash = el('div', {
    cls: 'fx fx-flash',
    style: `width:${flashBase}px;height:${flashBase}px;`,
    parent: layer,
  });
  const fa = flash.animate(
    [
      { transform: centerTransform(center.x, center.y, 0.2), opacity: 0.9 },
      { transform: centerTransform(center.x, center.y, 1), opacity: 0 },
    ],
    { duration: 220, easing: EASE.quadOut, fill: 'forwards' },
  );
  fa.onfinish = () => removeNode(flash);

  // Ударная волна.
  const waveBase = cellSize * 2.6;
  const wave = el('div', {
    cls: 'fx fx-shockwave',
    style: `width:${waveBase}px;height:${waveBase}px;`,
    parent: layer,
  });
  const wa = wave.animate(
    [
      { transform: centerTransform(center.x, center.y, 0.2), opacity: 0.8 },
      { transform: centerTransform(center.x, center.y, 1), opacity: 0 },
    ],
    { duration: 380, easing: EASE.quadOut, fill: 'forwards' },
  );
  wa.onfinish = () => removeNode(wave);

  // Искры наружу.
  const COUNT = 10;
  for (let i = 0; i < COUNT; i++) {
    const angle = (Math.PI * 2 * i) / COUNT + (Math.random() - 0.5) * 0.4;
    const radius = cellSize * (1.0 + Math.random() * 0.8);
    const ex = center.x + Math.cos(angle) * radius;
    const ey = center.y + Math.sin(angle) * radius;
    const size = 6 + Math.random() * 5;
    const spark = el('div', {
      cls: 'fx fx-spark',
      style: `width:${size}px;height:${size}px;transform:${centerTransform(center.x, center.y, 1)};`,
      parent: layer,
    });
    const sa = spark.animate(
      [
        { transform: centerTransform(center.x, center.y, 1), opacity: 1 },
        { transform: centerTransform(ex, ey, 0.3), opacity: 0 },
      ],
      { duration: 380 * (0.7 + Math.random() * 0.4), easing: EASE.quadOut, fill: 'forwards' },
    );
    sa.onfinish = () => removeNode(spark);
  }
}
