// DOM-модалка настроек: тумблеры sound / vibration / mixedTierChains.
// Изменения сразу применяются к SaveData через колбэк onToggle.

import type { Settings } from '../types';
import { getData } from '../core/storage';

function css(el: HTMLElement, style: string): void { el.style.cssText = style; }

export interface SettingsModalCallbacks {
  onToggle(key: keyof Settings, value: boolean): void;
  onClose(): void;
}

export interface SettingsModalApi {
  close(): void;
}

interface ToggleDef {
  key: keyof Settings;
  label: string;
  hint: string;
}

const TOGGLES: ToggleDef[] = [
  { key: 'sound', label: 'Звук', hint: 'SFX-сигналы (резерв в разработке).' },
  { key: 'vibration', label: 'Вибрация', hint: 'Тактильный отклик (резерв в разработке).' },
];

export function openSettingsModal(callbacks: SettingsModalCallbacks): SettingsModalApi {
  const existing = document.getElementById('mm-settings-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mm-settings-modal';
  css(overlay, 'position:fixed;inset:0;z-index:9999;background:rgba(5,7,10,0.78);display:flex;align-items:center;justify-content:center;padding:20px;');

  const panel = document.createElement('div');
  css(panel, 'width:100%;max-width:480px;background:#15171c;border:1px solid #3a414d;border-radius:12px;padding:18px;font-family:Roboto, monospace;color:#dddddd;');

  const header = document.createElement('div');
  css(header, 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;');
  const title = document.createElement('h2');
  title.textContent = 'Настройки';
  css(title, 'margin:0;font-size:20px;color:#9fe870;font-weight:900;');
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  css(closeBtn, 'background:transparent;color:#dddddd;border:0;font-size:22px;cursor:pointer;padding:4px 10px;');
  header.append(title, closeBtn);
  panel.append(header);

  const data = getData();

  for (const def of TOGGLES) {
    const row = document.createElement('label');
    css(row, 'display:flex;align-items:flex-start;gap:12px;padding:10px;background:#1c2027;border:1px solid #3a414d;border-radius:8px;margin-bottom:8px;cursor:pointer;');
    const info = document.createElement('div');
    css(info, 'flex:1;');
    const lab = document.createElement('div');
    lab.textContent = def.label;
    css(lab, 'font-size:14px;color:#fff;font-weight:700;margin-bottom:2px;');
    const hint = document.createElement('div');
    hint.textContent = def.hint;
    css(hint, 'font-size:11px;color:#8a8f99;line-height:1.3;');
    info.append(lab, hint);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(data.settings[def.key]);
    css(checkbox, 'width:20px;height:20px;margin-top:2px;cursor:pointer;accent-color:#9fe870;');
    checkbox.onchange = () => callbacks.onToggle(def.key, checkbox.checked);

    row.append(info, checkbox);
    panel.append(row);
  }

  overlay.append(panel);
  document.body.append(overlay);

  const close = (): void => {
    overlay.remove();
    callbacks.onClose();
  };
  closeBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return { close };
}
