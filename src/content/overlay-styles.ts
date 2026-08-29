export const OVERLAY_STYLES = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    color-scheme: light dark;
  }

  * { box-sizing: border-box; }

  .card {
    position: fixed;
    width: max-content;
    min-width: 210px;
    max-width: min(290px, calc(100vw - 16px));
    padding: 12px;
    overflow-wrap: anywhere;
    border: 1px solid rgba(128, 128, 128, 0.28);
    border-radius: 12px;
    background: Canvas;
    color: CanvasText;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
    animation: quick-translate-in 120ms ease-out;
  }

  .header,
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header { justify-content: space-between; margin-bottom: 8px; }
  .language { color: GrayText; font-size: 11px; }
  .text { margin: 0; white-space: pre-wrap; font-size: 14px; }
  .notice { color: GrayText; }
  .error { color: #b3261e; }
  .actions { margin-top: 10px; flex-wrap: wrap; }
  .spacer { flex: 1; }

  progress {
    width: 100%;
    height: 4px;
    margin-top: 8px;
    accent-color: #0b57d0;
  }

  button {
    appearance: none;
    min-width: 28px;
    min-height: 28px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: color-mix(in srgb, CanvasText 7%, Canvas);
    color: CanvasText;
    font: inherit;
    cursor: pointer;
  }

  button:hover { background: color-mix(in srgb, CanvasText 13%, Canvas); }
  button[aria-pressed="true"] { color: #0b57d0; background: #e8f0fe; }
  button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 2px; }
  .close { font-size: 17px; line-height: 1; }

  @keyframes quick-translate-in {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
  }
`;
