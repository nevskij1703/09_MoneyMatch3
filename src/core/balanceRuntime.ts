// Рантайм-баланс = base (config/balance.ts) + dev-override (localStorage 'mmatch_balance_override').
// В release override игнорируется. Override НЕ влияет на схему сейва. См. docs/SAVES.md.
//
// КАК ЭТО РАБОТАЕТ:
// Все модули импортируют `balance` напрямую из `config/balance.ts` — это ссылка
// на единый mutable объект. Override применяется через deepAssign — мутируем
// этот объект прямо при загрузке (side-effect ниже) и повторно из apply.
// После apply вызывается полный rebuild GameApp, чтобы вью пересоздались и
// подхватили новые значения. reset делает location.reload — восстановить
// мутированные поля без полной загрузки нельзя.

import { balance as activeBalance, type Balance } from '../config/balance';

const OVERRIDE_KEY = 'mmatch_balance_override';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Глубокая мутация target ⟵ source. Массивы не мерджит — заменяет целиком. */
function deepAssign(target: any, source: any): void {
  if (!isPlainObject(target) || !isPlainObject(source)) return;
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = target[k];
    if (isPlainObject(tv) && isPlainObject(sv)) {
      deepAssign(tv, sv);
    } else {
      target[k] = sv;
    }
  }
}

/**
 * Применить override из localStorage к balance. Вызывается ОДИН РАЗ при
 * загрузке модуля (side-effect в конце файла) и повторно из apply.
 */
function applyStoredOverrideToActiveBalance(): boolean {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return false;
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return false;
    deepAssign(activeBalance, JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

/** Текущий balance (для UI/калькуляторов). Возвращает тот же объект что balance. */
export function getBalance(): Balance {
  return activeBalance;
}

// --- dev-only управление override (вкладка Баланс дев-панели) ---

export function exportBalanceJSON(): string {
  return JSON.stringify(activeBalance, null, 2);
}

export function applyBalanceOverrideJSON(json: string): void {
  const parsed = JSON.parse(json);   // бросит при невалидном JSON — поймает дев-панель
  localStorage.setItem(OVERRIDE_KEY, json);
  deepAssign(activeBalance, parsed);
}

export function resetBalanceOverride(): void {
  localStorage.removeItem(OVERRIDE_KEY);
  // Чтобы вернуть исходные значения — нужен полный reload (мутированные
  // поля иначе не восстановить без хранения копии оригинала).
  if (typeof location !== 'undefined') location.reload();
}

export function hasBalanceOverride(): boolean {
  try {
    return localStorage.getItem(OVERRIDE_KEY) != null;
  } catch {
    return false;
  }
}

// Side-effect: применить сохранённый override к balance при импорте модуля.
// main.ts импортирует balanceRuntime ПЕРВЫМ (см. main.ts) — к моменту
// инициализации Phaser balance уже патчен.
applyStoredOverrideToActiveBalance();
