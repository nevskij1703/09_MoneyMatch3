# MoneyMatch3 — Карта проекта

Назначение: быстрый поиск нужного модуля без чтения всего кода.

**Игра:** f2p **классический match-3**. Игрок **свайпает** — меняет местами две ортогонально
соседние денежные плитки; линии ≥ `minLine` (=3) и квадраты 2×2 одного тира авто-схлопываются
в **Баланс**; спецматчи рождают спецтайлы (2×2 → 💣 Бомба 3×3, линия-5 → 🧲 Магнит = весь тир);
затем гравитация: уцелевшие плитки падают вниз, сверху досыпаются новые БЕСПЛАТНО — каскадами,
пока есть матчи. Свап без матча откатывается. Сверху — заглушка Уоррена Баффета. Снизу —
4 инвентарных бустера (заглушки) + тулбар-вкладки (заглушки).

> Проект отделён от `08_MergeMoney` (общий каркас Vite/TS/DOM, координаты 384×844), но это
> **самостоятельный** проект со своей кор-механикой, сейвом (`mmatch_save`) и документацией.

## Быстрый указатель: «куда смотреть, если…»

| Что меняем | Файл |
|---|---|
| Любая цифра баланса (тиры, minLine, спецтайлы, ценность сбора, бустеры) | [src/config/balance.ts](../src/config/balance.ts) |
| Кор-логика match-3 (свап, поиск матчей, спецтайлы, каскад, гравитация, дедлок) | [src/core/match3.ts](../src/core/match3.ts) |
| Ценность схлопа (каскад-комбо) → Баланс | [src/core/economy.ts](../src/core/economy.ts) |
| Внутренняя стоимость тира (2^t) + формат денег | [src/core/money.ts](../src/core/money.ts) |
| Хелперы поля (idx↔xy, makeBoard, isValidTier) | [src/core/board.ts](../src/core/board.ts) |
| Поле — свайп-ввод, каскад-анимация, спецтайлы, гравитация/досыпка | [src/ui/dom/boardView.ts](../src/ui/dom/boardView.ts) |
| VFX сбора (вспышка / ударная волна / искры) | [src/ui/dom/match3Fx.ts](../src/ui/dom/match3Fx.ts) |
| HUD: Баланс + 💎 + лого MONEY MATCH | [src/ui/dom/hudView.ts](../src/ui/dom/hudView.ts) |
| Баффет сверху (заглушка + реакции) | [src/ui/dom/buffettView.ts](../src/ui/dom/buffettView.ts) |
| Низ: 4 бустера (заглушки) + тулбар 5 вкладок | [src/ui/dom/actionBarView.ts](../src/ui/dom/actionBarView.ts) |
| Спрайт тира T1..T28 / fallback-круг | [src/ui/dom/tierArt.ts](../src/ui/dom/tierArt.ts) |
| Оркестратор экрана (FIT-масштаб, сбор→Баланс, заглушки) | [src/app/GameApp.ts](../src/app/GameApp.ts) |
| Сохранение / миграции / mergeDefaults | [src/core/storage.ts](../src/core/storage.ts), [src/core/migrations.ts](../src/core/migrations.ts) |
| Бустеры (4 id + shuffleBoard) | [src/core/boosters.ts](../src/core/boosters.ts) |
| Дев-панель (только DEV) | [src/ui/devPanel.ts](../src/ui/devPanel.ts) |

## Структура `src/`

```
src/
├── main.ts                  Bootstrap: balanceRuntime (side-effect) → styles.css → load() →
│                            new GameApp(#stage) → (DEV) devPanel
├── styles.css               Глобальные стили: #stage FIT, поле, баланс-бар, цепочка-коннектор,
│                            бустеры, зона Баффета, FX, попы
├── types.ts                 SaveData (balance/diamonds/board/investmentMultiplier/boosters/…), FieldState (+special), Tier, SpecialKind
│
├── app/GameApp.ts           Оркестратор: сборка вью, onCollected→economy.addCollected, заглушки
│
├── config/
│   └── balance.ts           ЕДИНЫЙ источник баланса (board, tierCount, match.{minLine,colorLineLen,
│                            bombRadius,comboStep,baseTileValue}, economy, boosters×4)
│
├── core/                    ЛОГИКА (pure, без DOM)
│   ├── board.ts             isValidTier, idxToXY/xyToIdx, getSpecial, makeBoard
│   ├── match3.ts            areOrthoNeighbors, swapCells, findMatches, activateSpecial,
│   │                        expandClearWithSpecials, applyClear/resolveStep, applyGravityAndRefill,
│   │                        wouldSwapMatch, hasAnyValidMove, makeMatch3Board
│   ├── economy.ts           tileCollectValue, cascadeComboMultiplier, clearValue, addCollected
│   ├── money.ts             tierValue=2^t, formatMoney, getTierStyle
│   ├── boosters.ts          BoosterId (shuffle/hammer/lightning/magnet) + shuffleBoard
│   ├── storage.ts           localStorage 'mmatch_save': load/save/getState/update/reset, mergeDefaults
│   ├── migrations.ts        Каскадные миграции (сейчас v1 = identity), self-test
│   ├── balanceRuntime.ts    Dev-override 'mmatch_balance_override' (DEV only)
│   └── rng.ts               pickGeometric / pickWeightedIndex (на будущее — взвешенная досыпка)
│
└── ui/
    ├── dom/                 DOM-вью (координаты 384×844)
    │   ├── dom.ts           el(), hexColor(), css(), centerTransform()
    │   ├── tierArt.ts       makeTierIcon (PNG T1..T28 + fallback)
    │   ├── boardView.ts     Стол + 5×5: свайп-ввод, каскад-анимация, спецтайлы, гравитация/досыпка
    │   ├── match3Fx.ts      WAAPI VFX сбора
    │   ├── hudView.ts       Баланс-плашка + 💎-пилл + лого
    │   ├── buffettView.ts   Зона Баффета (заглушка) + падающие деньги + popReaction
    │   └── actionBarView.ts 4 бустера + нижний тулбар (вкладки-заглушки)
    │
    ├── stubModal.ts         Generic «раздел в разработке»
    ├── settingsModal.ts     Настройки (sound/vibration; точки входа на экране пока нет)
    └── devPanel.ts          Dev-панель (DEV-only; tree-shaken в release)
```

## Принципы

1. **`core/` без DOM** — pure-функции, тестируются изолированно (см. headless-тесты при разработке).
2. **`ui/` рисует, `core/` думает** — все мутации SaveData через `core/`.
3. **`app/GameApp.ts` оркестрирует** — вызывает `core/` и обновляет `ui/`.
4. **`config/balance.ts`** — единый источник числовых параметров (override из дев-панели).
5. **Координаты 1-в-1** — DOM-вью позиционируются в дизайн-координатах 384×844, `#stage`
   масштабируется FIT (`transform:scale`).

## Потоки данных

**Свайп-обмен (свап по полю):**
1. [boardView.ts](../src/ui/dom/boardView.ts) `pointerdown` запоминает клетку, `pointermove` за
   порогом определяет соседа → `trySwap(a,b)`. Спецтайл → применение на месте; иначе `swapCells`
   + проверка `hasMatchAny` (нет матча → откат назад).
2. Каскад-петля: `resolveStep` (`findMatches` → `applyClear`: обнуление, спавн спецтайлов,
   `applyGravityAndRefill`) пока есть матчи — `comboIndex` растёт. Логика СРАЗУ, поле консистентно.
3. На каждом шаге `onCollected(tiers, comboIndex, spawnedSpecial)` → [GameApp](../src/app/GameApp.ts)
   `economy.addCollected` (Баланс растёт), HUD refresh + поп «+$N», реакция Баффета (`comboIndex≥2`
   или спецтайл).
4. Анимация шага: pop схлопнутых + морф спецтайлов + падение уцелевших + досыпка (WAAPI). По
   оседании — анти-дедлок (`hasAnyValidMove` → shuffle). Сейв.

**Тап по бустеру / вкладке:** → `stubModal` (заглушки этой итерации).
