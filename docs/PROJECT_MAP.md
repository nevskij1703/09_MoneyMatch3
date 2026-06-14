# MoneyMatch3 — Карта проекта

Назначение: быстрый поиск нужного модуля без чтения всего кода.

**Игра:** f2p match-3 в варианте «соединение цепочки». Игрок ведёт пальцем по цепочке
СОСЕДНИХ одинаковых денежных плиток (длина ≥ `minChain`) — на отпускании они собираются в
**Баланс**; затем гравитация: уцелевшие плитки падают вниз, сверху досыпаются новые
БЕСПЛАТНО (тех же тиров). Сверху — заглушка Уоррена Баффета. Снизу — 4 бустера (заглушки) +
тулбар-вкладки (заглушки).

> Проект отделён от `08_MergeMoney` (общий каркас Vite/TS/DOM, координаты 384×844), но это
> **самостоятельный** проект со своей кор-механикой, сейвом (`mmatch_save`) и документацией.

## Быстрый указатель: «куда смотреть, если…»

| Что меняем | Файл |
|---|---|
| Любая цифра баланса (тиры, длина цепочки, ценность сбора, бустеры) | [src/config/balance.ts](../src/config/balance.ts) |
| Кор-логика match-3 (цепочка, гравитация, досыпка, дедлок) | [src/core/match3.ts](../src/core/match3.ts) |
| Ценность сбора цепочки → Баланс | [src/core/economy.ts](../src/core/economy.ts) |
| Внутренняя стоимость тира (2^t) + формат денег | [src/core/money.ts](../src/core/money.ts) |
| Хелперы поля (idx↔xy, makeBoard, isValidTier) | [src/core/board.ts](../src/core/board.ts) |
| Поле — ввод цепочки, сбор, анимация гравитации/досыпки | [src/ui/dom/boardView.ts](../src/ui/dom/boardView.ts) |
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
├── types.ts                 SaveData (balance/diamonds/board/investmentMultiplier/boosters/…), FieldState, Tier
│
├── app/GameApp.ts           Оркестратор: сборка вью, onCollected→economy.addCollected, заглушки
│
├── config/
│   └── balance.ts           ЕДИНЫЙ источник баланса (board, tierCount, match.{minChain,diagonal,
│                            comboStep,baseTileValue}, economy, boosters×4)
│
├── core/                    ЛОГИКА (pure, без DOM)
│   ├── board.ts             isValidTier, idxToXY/xyToIdx, makeBoard
│   ├── match3.ts            neighbors, canExtendChain(+backtrack), collectChain,
│   │                        applyGravityAndRefill, hasAnyChain, makeMatch3Board
│   ├── economy.ts           tileCollectValue, chainComboMultiplier, chainValue, addCollected
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
    │   ├── boardView.ts     Стол + 6×6: ввод цепочки, подсветка+SVG-линия, сбор, гравитация
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

**Сбор цепочки (drag по полю):**
1. [boardView.ts](../src/ui/dom/boardView.ts) `pointerdown` стартует цепочку, `pointermove` —
   `canExtendChain`/backtrack (подсветка + SVG-линия), `pointerup` при длине ≥ `minChain` → сбор.
2. `collectChain` обнуляет клетки → `applyGravityAndRefill` досыпает (логика СРАЗУ, поле консистентно).
3. `onCollected(tiers)` → [GameApp](../src/app/GameApp.ts) `economy.addCollected` (Баланс растёт),
   HUD refresh + поп «+$N», реакция Баффета на комбо (≥4).
4. Анимация: pop собранных + падение уцелевших + досыпка сверху (WAAPI). Сейв.

**Тап по бустеру / вкладке:** → `stubModal` (заглушки этой итерации).
