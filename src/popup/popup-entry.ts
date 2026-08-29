import { initializePopup } from './popup';

function start(): void {
  void initializePopup().catch(() => undefined);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
