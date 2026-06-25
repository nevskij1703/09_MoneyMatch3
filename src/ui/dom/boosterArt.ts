// Путь к PNG-арту бустера (public/assets/boosters/). Принимает и SpecialKind поля (bomb/rocket-h/
// rocket-v/drone/magnet), и BoosterId кнопок (bomb/rocket/drone/magnet).
//   • ракета — ОТДЕЛЬНЫЙ арт по ориентации: rocket-h → Rocket_horizontal, rocket-v → Rocket_vertical
//     (кнопка-«rocket» без ориентации → горизонтальный как репрезентативный);
//   • drone → Dron, magnet → Magnet, bomb → Bomb.
// ВАЖНО: регистр имён — РОВНО как файлы на диске (Bomb/Dron/Magnet/Rocket_*), он критичен для
// case-sensitive FS (Android/WebView в APK); в Vite-dev на Windows регистр не проверяется.
export function boosterIconUrl(kind: string): string {
  const file =
    kind === 'drone' ? 'Dron' :
    kind === 'magnet' ? 'Magnet' :
    kind === 'rocket-v' ? 'Rocket_vertical' :
    (kind === 'rocket' || kind === 'rocket-h') ? 'Rocket_horizontal' :
    'Bomb'; // bomb (единственный оставшийся вид)
  return `assets/boosters/${file}.png`;
}
