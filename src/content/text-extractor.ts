export const HOVER_TEXT_LIMIT = 500;

const SEMANTIC_BLOCKS =
  'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption';
const EXCLUDED =
  'input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),script,style,[data-quick-translate-host]';
const PAGE_CONTAINERS = new Set(['BODY', 'MAIN', 'ARTICLE']);
const SENTENCE_BOUNDARIES = ['.', '!', '?', '。', '！', '？', ' '];

export interface TextCandidate {
  text: string;
  anchorRect: DOMRect;
  element: Element;
}

export function normalizeAndLimitText(
  text: string,
  maxCodePoints = HOVER_TEXT_LIMIT,
): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const points = Array.from(normalized);
  if (points.length <= maxCodePoints) return normalized;

  const prefix = points.slice(0, maxCodePoints).join('');
  const boundary = Math.max(
    ...SENTENCE_BOUNDARIES.map(character => prefix.lastIndexOf(character)),
  );
  const minimumBoundary = Math.floor(maxCodePoints * 0.75);

  return boundary >= minimumBoundary
    ? prefix.slice(0, boundary + 1).trim()
    : prefix;
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function isExcluded(element: Element): boolean {
  return element.closest(EXCLUDED) !== null;
}

function isVisible(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function hasDirectText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    node =>
      node.nodeType === Node.TEXT_NODE &&
      Boolean(node.textContent?.trim()),
  );
}

function nearestTextContainer(origin: Element): Element | null {
  const semanticBlock = origin.closest(SEMANTIC_BLOCKS);
  if (semanticBlock) return semanticBlock;

  let current: Element | null = origin;
  while (current && !PAGE_CONTAINERS.has(current.tagName)) {
    if (hasDirectText(current)) return current;
    current = current.parentElement;
  }
  return null;
}

export function extractHoverCandidate(
  target: EventTarget | null,
): TextCandidate | null {
  const origin = elementFromTarget(target);
  if (!origin || isExcluded(origin)) return null;

  const element = nearestTextContainer(origin);
  if (!element || !isVisible(element)) return null;

  const text = normalizeAndLimitText(element.textContent ?? '');
  if (!text) return null;

  return {
    text,
    anchorRect: element.getBoundingClientRect(),
    element,
  };
}

export function extractSelectionCandidate(
  selection: Selection | null,
): TextCandidate | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const element = elementFromTarget(range.commonAncestorContainer);
  if (!element || isExcluded(element) || !isVisible(element)) return null;

  const text = selection.toString().replace(/\s+/gu, ' ').trim();
  if (!text) return null;

  return {
    text,
    anchorRect: range.getBoundingClientRect(),
    element,
  };
}
