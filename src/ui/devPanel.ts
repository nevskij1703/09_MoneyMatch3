// Дев-панель (HTML-оверлей). ТОЛЬКО для dev — вызывается из main.ts под
// import.meta.env.DEV, поэтому Vite tree-shaking вырезает её из release-сборки.
//
// Вкладки: Ресурсы (Баланс/💎), Поле (очистка/заливка/перемешать), Бустеры,
// Баланс-конфиг (быстрые ползунки match + override JSON). Хоткей: ~ (тильда).

import { getData, update, reset } from '../core/storage';
import { balance } from '../config/balance';
import { makeBoard } from '../core/board';
import { shuffleBoard } from '../core/boosters';
import {
  exportBalanceJSON,
  applyBalanceOverrideJSON,
  resetBalanceOverride,
  hasBalanceOverride,
} from '../core/balanceRuntime';

const OVERRIDE_KEY = 'mmatch_balance_override';

const css = (el: HTMLElement, style: string): void => { el.style.cssText = style; };

function btn(label: string, id: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.textContent = label;
  css(b, 'background:#2e7d32;color:#fff;border:0;border-radius:6px;padding:6px 10px;margin:3px 3px 3px 0;font:12px monospace;cursor:pointer;');
  return b;
}

function field(labelText: string, id: string, value: string): HTMLDivElement {
  const wrap = document.createElement('div');
  css(wrap, 'display:flex;align-items:center;gap:6px;margin:4px 0;');
  const lab = document.createElement('label');
  lab.textContent = labelText;
  css(lab, 'flex:1;');
  const inp = document.createElement('input');
  inp.id = id;
  inp.value = value;
  inp.type = 'number';
  css(inp, 'width:120px;background:#15171c;color:#fff;border:1px solid #3a414d;border-radius:4px;padding:4px;font:12px monospace;');
  wrap.append(lab, inp);
  return wrap;
}

export function initDevPanel(refresh: () => void): void {
  if (document.getElementById('mm-dev-toggle')) return;

  const toggle = document.createElement('button');
  toggle.id = 'mm-dev-toggle';
  toggle.textContent = 'DEV';
  css(toggle, 'position:fixed;top:6px;right:6px;z-index:99999;background:#b23b3b;color:#fff;border:0;border-radius:6px;padding:6px 10px;font:bold 12px monospace;cursor:pointer;opacity:.85;');

  const panel = document.createElement('div');
  panel.id = 'mm-dev-panel';
  css(panel, 'position:fixed;top:40px;right:6px;z-index:99999;width:300px;max-height:88vh;overflow:auto;background:#0a0b0e;color:#ddd;border:1px solid #3a414d;border-radius:8px;padding:10px;font:12px monospace;display:none;box-shadow:0 6px 24px #000a;');

  const tabsBar = document.createElement('div');
  css(tabsBar, 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;');
  const contentHost = document.createElement('div');

  const tabs: Record<string, HTMLDivElement> = {};
  const makeTab = (key: string, title: string): HTMLDivElement => {
    const tb = document.createElement('button');
    tb.textContent = title;
    css(tb, 'flex:1;background:#20242c;color:#fff;border:0;border-radius:6px;padding:6px;font:12px monospace;cursor:pointer;');
    tb.onclick = () => {
      Object.values(tabs).forEach((t) => (t.style.display = 'none'));
      tabs[key]!.style.display = 'block';
    };
    tabsBar.appendChild(tb);
    const div = document.createElement('div');
    div.style.display = 'none';
    tabs[key] = div;
    contentHost.appendChild(div);
    return div;
  };

  // --- Вкладка «Ресурсы» ---
  const resTab = makeTab('res', 'Ресурсы');
  resTab.append(field('Баланс ($)', 'mm-balance', String(Math.floor(getData().balance))));
  const setBal = btn('Применить', 'mm-set-bal');
  setBal.onclick = () => {
    const val = Math.max(0, Number((document.getElementById('mm-balance') as HTMLInputElement).value) || 0);
    update((d) => { d.balance = val; });
    refresh();
  };
  const add1k = btn('+1 000', 'mm-add-1k');
  add1k.onclick = () => {
    update((d) => { d.balance += 1000; });
    (document.getElementById('mm-balance') as HTMLInputElement).value = String(Math.floor(getData().balance));
    refresh();
  };
  const add100k = btn('+100 000', 'mm-add-100k');
  add100k.onclick = () => {
    update((d) => { d.balance += 100000; });
    (document.getElementById('mm-balance') as HTMLInputElement).value = String(Math.floor(getData().balance));
    refresh();
  };
  resTab.append(setBal, add1k, add100k);

  const diamondsLabel = document.createElement('div');
  css(diamondsLabel, 'color:#9aa0a6;margin:10px 0 2px;font-size:11px;');
  diamondsLabel.textContent = 'Алмазы:';
  resTab.append(diamondsLabel);
  const addDiamonds = btn('+100 💎', 'mm-add-diamonds');
  css(addDiamonds, addDiamonds.style.cssText.replace('#2e7d32', '#1c5a8f'));
  addDiamonds.onclick = () => {
    update((d) => { d.diamonds = (d.diamonds ?? 0) + 100; });
    refresh();
  };
  resTab.append(addDiamonds);

  // --- Вкладка «Поле» ---
  const boardTab = makeTab('board', 'Поле');
  const clearBtn = btn('Очистить', 'mm-clear');
  clearBtn.onclick = () => {
    update((d) => { for (let i = 0; i < d.board.cells.length; i++) d.board.cells[i] = null; });
    refresh();
  };
  const randBtn = btn(`Случайная T1-T${balance.tierCount}`, 'mm-rand');
  randBtn.onclick = () => {
    update((d) => { d.board = makeBoard(balance.board.cols, balance.board.rows, 1, balance.tierCount); });
    refresh();
  };
  const fillT1 = btn('Залить T1', 'mm-fill-t1');
  fillT1.onclick = () => {
    update((d) => { for (let i = 0; i < d.board.cells.length; i++) d.board.cells[i] = 1; });
    refresh();
  };
  const shuffleBtn = btn('Перемешать', 'mm-shuffle');
  shuffleBtn.onclick = () => {
    update((d) => { shuffleBoard(d.board); });
    refresh();
  };
  boardTab.append(clearBtn, randBtn, fillT1, shuffleBtn);

  // --- Вкладка «Бустеры» ---
  const boosterTab = makeTab('boost', 'Бустеры');
  for (const def of balance.boosters.definitions) {
    const b = btn(`+5 ${def.name}`, `mm-add-${def.id}`);
    b.onclick = () => {
      update((d) => { d.boosters[def.id] = (d.boosters[def.id] ?? 0) + 5; });
      refresh();
    };
    boosterTab.append(b);
  }
  const resetLabel = document.createElement('div');
  css(resetLabel, 'color:#9aa0a6;margin:12px 0 2px;font-size:11px;');
  resetLabel.textContent = 'Сейв:';
  boosterTab.append(resetLabel);
  const resetBtn = btn('Сбросить сейв', 'mm-reset');
  css(resetBtn, resetBtn.style.cssText.replace('#2e7d32', '#b23b3b'));
  resetBtn.onclick = () => {
    if (!confirm('Сбросить весь прогресс?')) return;
    reset();
    refresh();
    const inp = document.getElementById('mm-balance') as HTMLInputElement | null;
    if (inp) inp.value = String(Math.floor(getData().balance));
  };
  boosterTab.append(resetBtn);

  // --- Вкладка «Баланс» (конфиг) ---
  const balTab = makeTab('bal', 'Баланс');
  const balHint = document.createElement('div');
  css(balHint, 'color:#8a8f99;font-size:11px;margin-bottom:12px;line-height:1.4;');
  balHint.textContent = 'Override применяется поверх balance.ts на лету. После Apply экран пересобирается. Reset делает location.reload для возврата дефолтов.';
  balTab.append(balHint);

  const status = document.createElement('div');
  css(status, 'margin:2px 0 6px;color:#9fe870;');
  const updateStatus = (): void => {
    status.textContent = hasBalanceOverride() ? 'override АКТИВЕН' : 'override нет (значения из balance.ts)';
  };

  // Быстрые ползунки match.
  type Dom = 'match' | 'economy';
  const quick: Array<{ key: string; label: string; step: number; domain: Dom }> = [
    { key: 'minChain', label: 'match.minChain', step: 1, domain: 'match' },
    { key: 'comboStep', label: 'match.comboStep', step: 0.05, domain: 'match' },
    { key: 'baseTileValue', label: 'match.baseTileValue', step: 1, domain: 'match' },
    { key: 'investmentMultiplier', label: 'economy.investMult', step: 0.5, domain: 'economy' },
  ];
  const quickInputs = new Map<string, HTMLInputElement>();
  for (const q of quick) {
    const row = document.createElement('div');
    css(row, 'display:flex;align-items:center;gap:6px;margin:3px 0;');
    const lab = document.createElement('label');
    lab.textContent = q.label;
    css(lab, 'flex:1;font-size:11px;');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(q.step);
    inp.value = String((balance[q.domain] as Record<string, unknown>)[q.key]);
    css(inp, 'width:90px;background:#15171c;color:#fff;border:1px solid #3a414d;border-radius:4px;padding:4px;font:11px monospace;');
    row.append(lab, inp);
    balTab.append(row);
    quickInputs.set(`${q.domain}.${q.key}`, inp);
  }

  const ta = document.createElement('textarea');
  ta.id = 'mm-bal-text';
  css(ta, 'width:100%;height:220px;background:#15171c;color:#cfe;border:1px solid #3a414d;border-radius:4px;padding:6px;font:11px monospace;white-space:pre;margin-top:8px;');
  ta.value = exportBalanceJSON();

  const applyQuick = btn('Применить ползунки', 'mm-apply-quick');
  css(applyQuick, 'width:100%;margin-top:4px;');
  applyQuick.onclick = () => {
    let current: any = {};
    try { const raw = localStorage.getItem(OVERRIDE_KEY); if (raw) current = JSON.parse(raw); } catch { /* ignore */ }
    const merged = { ...current };
    for (const q of quick) {
      const v = Number(quickInputs.get(`${q.domain}.${q.key}`)!.value);
      if (!Number.isFinite(v)) continue;
      merged[q.domain] = { ...(current[q.domain] ?? {}), [q.key]: v };
    }
    try {
      applyBalanceOverrideJSON(JSON.stringify(merged));
      ta.value = exportBalanceJSON();
      updateStatus();
      refresh();
    } catch (e) { alert('Ошибка: ' + (e as Error).message); }
  };
  balTab.append(applyQuick);

  const applyBtn = btn('Применить JSON', 'mm-bal-apply');
  applyBtn.onclick = () => {
    try { applyBalanceOverrideJSON(ta.value); updateStatus(); refresh(); }
    catch (e) { alert('Невалидный JSON: ' + (e as Error).message); }
  };
  const resetBalBtn = btn('Сбросить override', 'mm-bal-reset');
  css(resetBalBtn, resetBalBtn.style.cssText.replace('#2e7d32', '#555'));
  resetBalBtn.onclick = () => { resetBalanceOverride(); };
  balTab.append(status, ta, applyBtn, resetBalBtn);
  updateStatus();

  tabs.res!.style.display = 'block';

  panel.append(tabsBar, contentHost);
  toggle.onclick = () => {
    const showing = panel.style.display !== 'none';
    panel.style.display = showing ? 'none' : 'block';
    if (!showing) {
      const inp = document.getElementById('mm-balance') as HTMLInputElement | null;
      if (inp) inp.value = String(Math.floor(getData().balance));
      updateStatus();
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') toggle.click();
  });

  document.body.append(toggle, panel);
}
