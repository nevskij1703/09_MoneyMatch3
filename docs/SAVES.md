# Сейвы — контракт MoneyMatch3

Один ключ `localStorage`: **`mmatch_save`**. Балансовые override'ы — отдельный ключ
`mmatch_balance_override` (только DEV, на схему сейва не влияет).

## Структура

```jsonc
{
  "schemaVersion": 1,
  "data": {
    "balance": 0,                 // главная валюта (собранные деньги)
    "diamonds": 50,               // премиум 💎
    "board": { "cols": 6, "rows": 6, "cells": [ /* 36 × (Tier|null) */ ] },
    "investmentMultiplier": 1,    // множитель ценности сбора (будущие инвестиции)
    "boosters": { "shuffle": 3, "hammer": 3, "lightning": 3, "magnet": 3 },
    "totalCollected": 0,          // lifetime собрано (стат + хук прогрессии)
    "bestChain": 0,               // самая длинная цепочка (стат)
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
  за полем по дефолтам и валидации (НЕ spread) — мусор/легаси-поля не утекают. Поле берётся из
  сейва только при совпадении форм-фактора (`cols/rows`), иначе генерируется заново.
- Любое breaking-изменение формата (новое поле, переименование, смена типа) = новая функция
  миграции. **До первого RC** можно расширять `migrations[1]` свободно (живых юзеров нет).

## Anti-patterns (по глобальным правилам)

- ❌ Multi-key хранение — только один ключ `mmatch_save`.
- ❌ Константа `SCHEMA_VERSION`, дублирующая `max(keys(migrations))` — используем авто-вывод.
- ❌ Backup-and-reset при mismatch — используем каскадные миграции (теряют прогресс только при
   откате из будущей версии: бэкап в `mmatch_save_backup_vN` + старт с дефолта).
