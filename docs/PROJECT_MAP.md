# MoneyMatch3 / «Hamster Bank» — Карта проекта

Назначение: быстрый поиск нужного модуля без чтения всего кода.

**Игра:** f2p **классический match-3**, бренд экрана **«Hamster Bank»** (синяя тема, маскот-хомяк).
Игрок **свайпает** — меняет местами две ортогонально соседние плитки; линии ≥ `minLine` (=3) и
квадраты 2×2 одного тира авто-схлопываются в **Баланс**; гравитация досыпает новые плитки —
каскадами, пока есть матчи (комбо растёт). Свап без матча откатывается. Поле **6×5**. Сложный матч
рождает **бустер на поле** (T/L→💣, линия-4→🚀, 2×2→🛸 дрон, линия-5→🧲); плюс **кнопки-бустеры** внизу.
На поле также **собираемые** (💎 алмаз / ⚡ молния / 🎁 сейф-лутбокс) — собираются схлопом рядом/бустером.
Энергия тратится в момент свайпа. Над полем — карта баланса с маскотом,
офферы (SALE / Watch Ad), строка Level / Energy / Income. Снизу — меню из 5 вкладок.

> Кодовая база/сейв — `MoneyMatch3` / `mmatch_save`. «Hamster Bank» — отображаемый бренд
> (макет Figma «Play window», дизайн-холст **390×844**).

## Быстрый указатель: «куда смотреть, если…»

| Что меняем | Файл |
|---|---|
| Любая цифра баланса (тиры, board 6×5, minLine/rocketLineLen, energy, startLevel, бустеры, шансы 💎/⚡/🎁) | [src/config/balance.ts](../src/config/balance.ts) |
| Кор-логика match-3 (свап, матчи, каскад, гравитация+спавн 💎/⚡/🎁, сбор собираемых, дедлок) | [src/core/match3.ts](../src/core/match3.ts) |
| Тип-гарды `isBooster`/`isCollectible`, конверсии координат, getSpecial | [src/core/board.ts](../src/core/board.ts) |
| Ценность схлопа (каскад-комбо) → Баланс | [src/core/economy.ts](../src/core/economy.ts) |
| Внутренняя стоимость тира (2^t) + формат денег | [src/core/money.ts](../src/core/money.ts) |
| Поле — свайп-ввод, 6×5, каскад-анимация, гравитация/досыпка | [src/ui/dom/boardView.ts](../src/ui/dom/boardView.ts) |
| Шапка (аватар-хомяк + Hamster Bank + 🔔/⚙) | [src/ui/dom/headerView.ts](../src/ui/dom/headerView.ts) |
| Карта Баланс+Алмазы + маскот + декор | [src/ui/dom/balanceCardView.ts](../src/ui/dom/balanceCardView.ts) |
| Офферы SALE / Watch Ad | [src/ui/dom/offersView.ts](../src/ui/dom/offersView.ts) |
| Строка Level / Energy / Income | [src/ui/dom/infoRowView.ts](../src/ui/dom/infoRowView.ts) |
| Низ: 4 кнопки-бустера + меню 5 вкладок | [src/ui/dom/actionBarView.ts](../src/ui/dom/actionBarView.ts) |
| Спрайт тира T1..T28 / fallback-круг | [src/ui/dom/tierArt.ts](../src/ui/dom/tierArt.ts) |
| Оркестратор экрана (FIT 390×844, сбор→карта, заглушки) | [src/app/GameApp.ts](../src/app/GameApp.ts) |
| Сохранение / миграции / mergeDefaults | [src/core/storage.ts](../src/core/storage.ts), [src/core/migrations.ts](../src/core/migrations.ts) |
| Бустеры (id bomb/drone/rocket/magnet + shuffleBoard) | [src/core/boosters.ts](../src/core/boosters.ts) |
| Арт макета | `public/assets/{hud,char,offers,boosters,nav,decor}/` |
| Дев-панель (только DEV) | [src/ui/devPanel.ts](../src/ui/devPanel.ts) |

## Структура `src/`

```
src/
├── main.ts                  Bootstrap: balanceRuntime → styles.css → load() → new GameApp(#stage) → (DEV) devPanel
├── styles.css               Глобальные стили: #stage 390×844 FIT, синий фон/тема, блоки .hb-* (header/card/offer/pill/booster/nav), поле, FX, combo
├── types.ts                 SaveData (balance/diamonds/board/investmentMultiplier/level/energy/boosters/…), FieldState (+special), Tier; BoosterKind|CollectibleKind = SpecialKind
│
├── app/GameApp.ts           Оркестратор (390×844): сборка вью, комбо-аккумулятор+баннер, onMoveEnd→economy.commitMove→полёт в карту
│
├── config/
│   ├── balance.ts           ЕДИНЫЙ источник баланса (board 6×5, tierCount, match.{minLine,rocketLineLen,…}, economy, startLevel, energy, collect{шансы 💎/⚡/🎁}, boosters×4)
│   └── anim.ts              Скорости анимаций перемещения (мс / px·мс) — читаются boardView на лету; DEV-override из дев-панели (вкладка «Анимации»)
│
├── core/                    ЛОГИКА (pure, без DOM)
│   ├── board.ts             isValidTier, isBooster/isCollectible (тип-гарды), idxToXY/xyToIdx, getSpecial, makeBoard
│   ├── match3.ts            areOrthoNeighbors, swapCells, findMatches (схлоп + спавн бустеров за сложный матч),
│   │                        countMatchGroups, applyClear/resolveStep, applyGravityAndRefill (+спавн 💎/⚡/🎁),
│   │                        resolveCollectibles (сбор/открытие), wouldSwapMatch, hasAnyValidMove, makeMatch3Board;
│   │                        эффекты бустеров: boosterTargets/pickNearestTileTier/expandClearWithSpecials,
│   │                        cellsInPlus/droneTargets/pickDroneFlightTarget (дрон: плюс + полёт преим. в обычную плитку),
│   │                        cellsInSquare/cellsInRows/cellsInCols/pickRandomPresentTier (комбо)
│   ├── economy.ts           tileCollectValue, comboMoneyMultiplier, comboTotal, commitMove
│   ├── money.ts             tierValue=2^t, formatMoney, formatMoneyFull (все знаки), getTierStyle
│   ├── energy.ts            regenEnergy/energyToNextMs/hasEnergyForMove/spendEnergyForMove
│   ├── boosters.ts          BoosterId (bomb/drone/rocket/magnet) + shuffleBoard (только плитки, спецобъекты на местах)
│   ├── storage.ts           localStorage 'mmatch_save': load/save/getState/update/reset, mergeDefaults
│   ├── migrations.ts        Каскадные миграции (сейчас v1 = identity), self-test
│   ├── balanceRuntime.ts    Dev-override 'mmatch_balance_override' (DEV only)
│   └── rng.ts               pickGeometric / pickWeightedIndex (на будущее)
│
└── ui/
    ├── dom/                 DOM-вью (координаты 390×844)
    │   ├── dom.ts           el(), hexColor(), css(), centerTransform()
    │   ├── tierArt.ts       makeTierIcon (PNG T1..T28 + fallback)
    │   ├── headerView.ts    Шапка: аватар-хомяк, «Hamster Bank» + тэглайн, 🔔(+бэйдж), ⚙
    │   ├── balanceCardView.ts  Карта Баланс+Алмазы (все знаки, авто-уменьшение) + маскот + декор; refresh/bumpBalance; MONEY_TARGET
    │   ├── offersView.ts    Офферы SALE / Watch Ad (тап → заглушка)
    │   ├── infoRowView.ts   Level / Energy / Income (из сейва/конфига)
    │   ├── boardView.ts     Синяя база + 6×5: свайп-ввод, рендер плиток/бустеров/собираемых, постепенная анимация сбора (radial/instant), полёт дрона/💎/⚡, гравитация/досыпка
    │   ├── match3Fx.ts      WAAPI VFX сбора
    │   └── actionBarView.ts 4 круглые кнопки-бустера (счётчик) + нижнее меню 5 вкладок (Игра — центр)
    │
    ├── stubModal.ts         Generic «раздел в разработке»
    ├── settingsModal.ts     Настройки (sound/vibration; точка входа на экране пока заглушка)
    └── devPanel.ts          Dev-панель (DEV-only; tree-shaken в release): Ресурсы/Поле/Бустеры/Баланс/Анимации (скорости + копия JSON)
```

## Принципы

1. **`core/` без DOM** — pure-функции, тестируются изолированно.
2. **`ui/` рисует, `core/` думает** — все мутации SaveData через `core/`.
3. **`app/GameApp.ts` оркестрирует** — вызывает `core/` и обновляет `ui/`.
4. **`config/balance.ts`** — единый источник числовых параметров (override из дев-панели).
5. **Координаты 1-в-1** — DOM-вью позиционируются в дизайн-координатах **390×844**, `#stage`
   масштабируется FIT (`transform:scale`).

## Потоки данных

**Свайп-обмен (свап по полю):**
1. [boardView.ts](../src/ui/dom/boardView.ts) `pointerdown` запоминает клетку, `pointermove` за
   порогом определяет соседа → `trySwap(a,b)`: `swapCells` + `hasMatchAny` (нет матча → откат назад).
   Собираемые (💎/⚡/🎁) свапаются как фишки (обмен прилипает по матчу; свайп на бустер активирует и собирает их). Валидный ход → `onSpendEnergy()` СРАЗУ (в момент свайпа).
2. Каскад-петля: `resolveStep` (`findMatches` → `applyClear(..., byMatch=true)`: собираемые ловятся
   соседством с НАТУРАЛЬНЫМ матчем; бустеры (`byMatch=false`) — только ПРЯМЫМ попаданием по клетке →
   обнуление → `applyGravityAndRefill` со спавном 💎/⚡/🎁) пока есть матчи. `step.groups` = число
   матч-групп (`countMatchGroups`). Сложный матч → бустер; собранные 💎/⚡ → `onCollect` (полёт в баланс/энергию).
3. На каждом шаге `onCascadeStep(tiers, groups)` → [GameApp](../src/app/GameApp.ts) копит `baseSum`
   + уровень комбо (Σ групп), обновляет баннер «Комбо ×N» + сумму $ (`updateCombo`).
4. Анимация шага: pop схлопнутых (для бустеров — ПОСТЕПЕННО от ближних к дальним, radial; бомба —
   instant), полёт собранных 💎/⚡, открытие 🎁 (растворение+вспышка+баунс награды), падение уцелевших +
   досыпка ПОТОКОМ снизу-вверх (постоянная скорость, зазор ~1.5 ячейки) (WAAPI). Свайп бустера на
   плитку с матчем: сперва схлоп матча (родить бустер), затем активация бустера — новые бустеры иммунны.
5. В конце хода `onMoveEnd()` → `economy.commitMove` (Баланс растёт ОДИН раз), деньги улетают в
   **карту** (`flyMoneyToBalance` → `card.refresh()` + bump). Бустеры активируются после
   перемещения / тапом; дрон собирает плюс НА ВЗЛЁТЕ и дольше летит к цели; комбо двух бустеров —
   5×5 / 3+3 / крест / всё поле / магнит-спавн / 3 дрона / дрон-уносит-бустер. Энергия списана на
   свайпе (шаг 1). Анти-дедлок (`hasAnyValidMove` → shuffle; только бустеры = гарант.ход). Сейв.

**Тап по кнопке-бустеру / офферу / вкладке / 🔔:** → `stubModal` (заглушки этой итерации).
