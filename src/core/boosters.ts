// Бустеры — операции над FieldState. Pure-функции, мутируют переданный FieldState.
// Эта итерация: 4 типа-ЗАГЛУШКИ (реальные эффекты — будущая фаза). Из рабочего —
// только shuffleBoard (используется при дедлоке поля и будущим бустером «Перемешать»).

import type { FieldState } from '../types';

/** Идентификаторы 4 бустеров. Расширяется по мере итераций. */
export type BoosterId = 'shuffle' | 'hammer' | 'lightning' | 'magnet';

/** Перемешать все клетки поля (Fisher-Yates). Mutates field in-place. */
export function shuffleBoard(field: FieldState, rng: () => number = Math.random): void {
  const cells = field.cells;
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cells[i]!;
    cells[i] = cells[j]!;
    cells[j] = tmp;
  }
}
