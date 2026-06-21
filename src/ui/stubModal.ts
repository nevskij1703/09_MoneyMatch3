// Универсальный DOM-модал «Раздел в разработке» — заглушка под секции,
// которые ещё не реализованы (Магазин, Коллекции).

function css(el: HTMLElement, style: string): void { el.style.cssText = style; }

export interface StubModalApi {
  close(): void;
}

export interface StubModalCallbacks {
  onClose?(): void;
}

export function openStubModal(title: string, message: string, callbacks: StubModalCallbacks = {}): StubModalApi {
  const id = `mm-stub-modal`;
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = id;
  css(overlay, 'position:fixed;inset:0;z-index:9999;background:rgba(5,7,10,0.78);display:flex;align-items:center;justify-content:center;padding:20px;');

  const panel = document.createElement('div');
  css(panel, "width:100%;max-width:420px;background:#15171c;border:1px solid #3a414d;border-radius:12px;padding:22px;font-family:'Roboto Flex',sans-serif;color:#dddddd;text-align:center;");

  const h = document.createElement('h2');
  h.textContent = title;
  css(h, 'margin:0 0 10px 0;font-size:22px;color:#ffd700;font-weight:900;');

  const p = document.createElement('p');
  p.textContent = message;
  css(p, 'margin:0 0 18px 0;font-size:14px;color:#a8aeb8;line-height:1.4;');

  const btn = document.createElement('button');
  btn.textContent = 'Got it';
  css(btn, 'background:#2e7d32;color:#fff;border:0;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;');

  panel.append(h, p, btn);
  overlay.append(panel);
  document.body.append(overlay);

  const close = (): void => {
    overlay.remove();
    callbacks.onClose?.();
  };
  btn.onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  return { close };
}
