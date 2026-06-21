// Энергия: трата за ход + восстановление по реальному времени (+regenAmount каждые
// regenSeconds, по умолчанию +10 за 10 минут). Pure-функции над SaveData; время (`now`,
// мс) передаётся снаружи (Date.now() в GameApp), чтобы логика оставалась тестируемой.
//
// Модель: `energyTs` — якорь, от которого отсчитывается следующий тик регена. Текущая
// энергия восстанавливается порциями: каждые regenSeconds добавляется regenAmount (до max).
// Якорь продвигается на целое число прошедших интервалов (остаток сохраняется в таймере).

import type { SaveData } from '../types';
import { balance } from '../config/balance';

const regenMs = (): number => balance.energy.regenSeconds * 1000;

/** Применить накопленный реген к энергии по прошедшему времени. Mutates `d`. */
export function regenEnergy(d: SaveData, now: number): void {
  const max = balance.energy.max;
  if (d.energy >= max) { d.energyTs = now; return; }           // полная — якорь «сейчас»
  if (!d.energyTs || d.energyTs <= 0 || d.energyTs > now) { d.energyTs = now; return; } // нет/битый якорь
  const ms = regenMs();
  const ticks = Math.floor((now - d.energyTs) / ms);
  if (ticks <= 0) return;
  d.energy = Math.min(max, d.energy + ticks * balance.energy.regenAmount);
  d.energyTs = d.energy >= max ? now : d.energyTs + ticks * ms;
}

/** Мс до следующего +regenAmount (0, если энергия полная). */
export function energyToNextMs(d: SaveData, now: number): number {
  if (d.energy >= balance.energy.max) return 0;
  const ms = regenMs();
  if (!d.energyTs || d.energyTs <= 0 || d.energyTs > now) return ms;
  return ms - ((now - d.energyTs) % ms);
}

/** Хватает ли энергии на ход. */
export function hasEnergyForMove(d: SaveData): boolean {
  return d.energy >= balance.energy.costPerMove;
}

/** Списать энергию за ход. Если энергия была полной — запускает отсчёт регена. Mutates `d`. */
export function spendEnergyForMove(d: SaveData, now: number): void {
  if (d.energy >= balance.energy.max) d.energyTs = now;
  d.energy = Math.max(0, d.energy - balance.energy.costPerMove);
}
