# Сейвы — контракт MoneyMatch3

Один ключ `localStorage`: **`mmatch_save`**. Балансовые override'ы — отдельный ключ
`mmatch_balance_override` (только DEV, на схему сейва не влияет).

## Структура

```jsonc
{
  "schemaVersion": 1,
  "data": {
    "balance": 0,                 // главная валюта (карта «Total balance»)
    "diamonds": 50,               // премиум 💎 (карта «Diamonds»)
    "board": {                    // поле match-3 6×5
      "cols": 6, "rows": 5,
      "cells":   [ /* 30 × (Tier|null) */ ],
      "special": [ /* 30 × (SpecialKind|null) — сейчас всегда null: бустеры на поле не спавнятся */ ]
    },
    "investmentMultiplier": 1,    // множитель дохода (HUD «Income ×N»; инвестиции/уровень — будущее)
    "level": 1,                   // уровень игрока (HUD «Level»; прокачка — будущее)
    "energy": 100,                // энергия (HUD «Energy N/100»; трата/реген — будущее)
    "boosters": { "bomb": 3, "drone": 8, "rocket": 12, "magnet": 0 },
    "totalCollected": 0,          // lifetime собрано (стат + хук прогрессии)
    "bestCombo": 0,               // самый глубокий каскад-комбо (стат)
    "settings": { "sound": true, "vibration": true },
    "lastActiveTs": 0
  }
}
```

## Правила

- **`schemaVersion`** — целое, растёт ТОЛЬКО при breaking-изменении формата `data`.
  Авто-выводится из `max(ключей migrations)` ([migrations.ts](../src/core/migrations.ts)) —
  не дублируется константой.
- **Миграции** — каскадные `N: (state) => state` (`v(N-1) → vN`). Сейчас `migrations[1]` =
  identity (новый проект). `migrationsSelfTest()` (DEV) проверяет реестр без дыр.
- **`mergeDefaults`** ([storage.ts](../src/core/storage.ts)) при `load()` собирает `data` поле
  за полем по дефолтам и валидации (НЕ spread) — мусор/легаси-поля не утекают. Новые поля
  (`level`, `energy`) добираются по дефолтам (`balance.startLevel` / `balance.energy.max`).
  `boosters` пере-сеется по актуальным id (`bomb/drone/rocket/magnet`) — старые ключи отбрасываются.
  Поле берётся из сейва только при совпадении форм-фактора (`cols/rows`); старый **6×6** не
  совпадёт с текущим **6×5** → board регенерится заново (`makeMatch3Board`, живых юзеров нет).
  `board.special` нормализуется (`normalizeSpecial`) и сейчас всегда `null` — бустеры на поле
  не спавнятся (они кнопки). При загрузке стартовые матчи поля тихо схлопываются
  (`settleInitial` в boardView), затем гарантируется ход.
- Любое breaking-изменение формата (новое поле, переименование, смена типа) = новая функция
  миграции. **До первого RC** можно расширять `migrations[1]` свободно (живых юзеров нет).

## Anti-patterns (по глобальным правилам)

- ❌ Multi-key хранение — только один ключ `mmatch_save`.
- ❌ Константа `SCHEMA_VERSION`, дублирующая `max(keys(migrations))` — используем авто-вывод.
- ❌ Backup-and-reset при mismatch — используем каскадные миграции (теряют прогресс только при
   откате из будущей версии: бэкап в `mmatch_save_backup_vN` + старт с дефолта).
