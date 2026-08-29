import { initializePopup } from './popup';

function start(): void {
  void initializePopup();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
