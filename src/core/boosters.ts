// Бустеры — операции над FieldState. Pure-функции, мутируют переданный FieldState.
// Эта итерация: 4 типа-ЗАГЛУШКИ (реальные эффекты — будущая фаза). Из рабочего —
// только shuffleBoard (используется при дедлоке поля и будущим бустером «Перемешать»).

import type { FieldState } from '../types';
import { getSpecial } from './board';

/** Идентификаторы 4 бустеров-кнопок (макет Hamster Bank). Расширяется по мере итераций. */
export type BoosterId = 'bomb' | 'drone' | 'rocket' | 'magnet';

/**
 * Перемешать ТОЛЬКО плитки-деньги (клетки без спецобъекта), оставив бустеры и собираемые
 * (diamond/lightning/safe) на местах — иначе ломается инвариант cells[i]=null под special[i].
 * Fisher-Yates по тир-значениям обычных клеток. Mutates field in-place.
 */
export function shuffleBoard(field: FieldState, rng: () => number = Math.random): void {
  const sp = getSpecial(field);
  const cells = field.cells;
  const idxs: number[] = [];
  for (let i = 0; i < cells.length; i++) if (!sp[i] && cells[i] != null) idxs.push(i);
  for (let k = idxs.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    const a = idxs[k], b = idxs[j];
    const tmp = cells[a]; cells[a] = cells[b]; cells[b] = tmp;
  }
}
