// ВАЖНО: balanceRuntime импортируется ПЕРВЫМ — его side-effect (мутация
// activeBalance из localStorage override) должен сработать ДО того как любой
// модуль успеет прочитать значение из `balance`.
import './core/balanceRuntime';

import './styles.css';
import { load, getState, save } from './core/storage';
import { migrationsSelfTest } from './core/migrations';
import { GameApp } from './app/GameApp';

const stage = document.getElementById('stage');
if (!stage) throw new Error('#stage not found');

load();

if (import.meta.env.DEV) {
  try {
    migrationsSelfTest();
    console.info('[selftest] migrations OK');
  } catch (e) {
    console.error(e);
  }
}

let app = new GameApp(stage);

// Dev-инструменты вырезаются из release (Vite tree-shaking по import.meta.env.DEV).
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__mm = { getState, save };
  // «Перезапуск сцены» в DOM = полный rebuild GameApp (как scene.restart в Phaser).
  const rebuild = (): void => {
    app.destroy();
    stage.innerHTML = '';
    app = new GameApp(stage);
    w.__app = app;
  };
  w.__app = app;
  void import('./ui/devPanel').then((m) => m.initDevPanel(rebuild));
}
