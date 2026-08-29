import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractHoverCandidate,
  extractSelectionCandidate,
  HOVER_TEXT_LIMIT,
  normalizeAndLimitText,
} from '../../src/content/text-extractor';

afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe('normalizeAndLimitText', () => {
  it('collapses whitespace and keeps short text intact', () => {
    expect(normalizeAndLimitText('  Hello\n\tworld  ')).toBe('Hello world');
  });

  it('cuts at a sentence boundary close to the code-point limit', () => {
    const input = `${'a'.repeat(480)}. ${'b'.repeat(40)}`;
    const result = normalizeAndLimitText(input, HOVER_TEXT_LIMIT);

    expect(Array.from(result)).toHaveLength(481);
    expect(result.endsWith('.')).toBe(true);
  });

  it('counts astral Unicode characters as one code point', () => {
    expect(normalizeAndLimitText('😀'.repeat(510), 500)).toBe('😀'.repeat(500));
  });
});

describe('extractHoverCandidate', () => {
  it('uses the nearest semantic text block', () => {
    document.body.innerHTML =
      '<article><p id="paragraph">Hello <strong id="word">world</strong></p></article>';

    const paragraph = document.querySelector('#paragraph')!;
    const candidate = extractHoverCandidate(document.querySelector('#word'));

    expect(candidate?.text).toBe('Hello world');
    expect(candidate?.element).toBe(paragraph);
  });

  it('uses a compact non-semantic text container without capturing the whole page', () => {
    document.body.innerHTML =
      '<main><div id="card"><span id="word">Compact label</span></div><p>Other copy</p></main>';

    const candidate = extractHoverCandidate(document.querySelector('#word')?.firstChild ?? null);

    expect(candidate?.text).toBe('Compact label');
    expect(candidate?.element).toBe(document.querySelector('#word'));
  });

  it.each([
    '<input id="target" value="secret">',
    '<textarea id="target">secret</textarea>',
    '<select id="target"><option>secret</option></select>',
    '<div id="target" contenteditable="true">secret</div>',
    '<div data-quick-translate-host><p id="target">owned</p></div>',
  ])('ignores excluded content: %s', markup => {
    document.body.innerHTML = markup;
    expect(extractHoverCandidate(document.querySelector('#target'))).toBeNull();
  });

  it('ignores hidden elements and empty text', () => {
    document.body.innerHTML =
      '<p id="hidden" style="visibility:hidden">hidden</p><p id="empty">   </p>';

    expect(extractHoverCandidate(document.querySelector('#hidden'))).toBeNull();
    expect(extractHoverCandidate(document.querySelector('#empty'))).toBeNull();
  });

  it('includes only visible text and excludes hidden or executable descendants', () => {
    document.body.innerHTML = [
      '<p id="paragraph">Visible',
      '<span style="display:none">secret</span>',
      '<script>hiddenScript()</script>',
      '<span>copy</span></p>',
    ].join(' ');

    expect(extractHoverCandidate(document.querySelector('#paragraph'))?.text).toBe(
      'Visible copy',
    );
  });

  it('provides a live anchor rectangle and invalidates it after removal', () => {
    document.body.innerHTML = '<p id="paragraph">Visible copy</p>';
    const paragraph = document.querySelector<HTMLElement>('#paragraph')!;
    const currentRect = new DOMRect(30, 40, 120, 24);
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue(currentRect);

    const candidate = extractHoverCandidate(paragraph)!;
    expect(candidate.getAnchorRect()).toBe(currentRect);

    paragraph.remove();
    expect(candidate.getAnchorRect()).toBeNull();
  });
});

describe('extractSelectionCandidate', () => {
  it('extracts a non-collapsed selection and its range rectangle', () => {
    document.body.innerHTML = '<p id="paragraph">Hello world</p>';
    const text = document.querySelector('#paragraph')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    Object.assign(range, {
      getBoundingClientRect: () => new DOMRect(10, 20, 80, 20),
    });
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(extractSelectionCandidate(selection)).toMatchObject({
      text: 'Hello',
      anchorRect: { x: 10, y: 20, width: 80, height: 20 },
      element: document.querySelector('#paragraph'),
    });
  });

  it('rejects collapsed and extension-owned selections', () => {
    const selection = document.getSelection()!;
    expect(extractSelectionCandidate(selection)).toBeNull();

    document.body.innerHTML =
      '<div data-quick-translate-host><p id="owned">owned text</p></div>';
    const text = document.querySelector('#owned')!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(text);
    Object.assign(range, { getBoundingClientRect: () => new DOMRect() });
    selection.addRange(range);

    expect(extractSelectionCandidate(selection)).toBeNull();
  });

  it('excludes hidden descendants from a range selection', () => {
    document.body.innerHTML =
      '<p id="paragraph">Visible <span style="display:none">secret</span><span>copy</span></p>';
    const paragraph = document.querySelector('#paragraph')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    Object.assign(range, { getBoundingClientRect: () => new DOMRect() });
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(extractSelectionCandidate(selection)?.text).toBe('Visible copy');
  });
});
