// Путь к PNG-арту бустера (public/assets/boosters/). Принимает и SpecialKind поля (bomb/rocket-h/
// rocket-v/drone/magnet), и BoosterId кнопок (bomb/rocket/drone/magnet).
//   • ракета — ОТДЕЛЬНЫЙ арт по ориентации: rocket-h → rocket_horizontal, rocket-v → rocket_vertical
//     (кнопка-«rocket» без ориентации → горизонтальный как репрезентативный);
//   • drone/magnet — обновлённый арт «_v2»; bomb — без изменений.
export function boosterIconUrl(kind: string): string {
  const file =
    kind === 'drone' ? 'drone_v2' :
    kind === 'magnet' ? 'magnet_v2' :
    kind === 'rocket-v' ? 'rocket_vertical' :
    (kind === 'rocket' || kind === 'rocket-h') ? 'rocket_horizontal' :
    kind; // bomb
  return `assets/boosters/${file}.png`;
}
