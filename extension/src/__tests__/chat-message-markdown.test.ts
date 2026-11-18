import { describe, it, expect } from 'vitest';
import { parseInlineMarkdown } from '../components/ChatMessage.js';

describe('ChatMessage Markdown Parser', () => {
  it('converts **bold** into strong elements and strips asterisks', () => {
    const nodes = parseInlineMarkdown('This is **important** information.');
    expect(nodes).toHaveLength(3);
    // Node 0: "This is "
    // Node 1: <strong>important</strong>
    // Node 2: " information."
    expect(nodes[0]).toBe('This is ');
    expect(nodes[2]).toBe(' information.');
  });

  it('converts ***bold italic*** into bold italic element', () => {
    const nodes = parseInlineMarkdown('Check this ***super critical*** note.');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe('Check this ');
    expect(nodes[2]).toBe(' note.');
  });

  it('converts inline `code` into code element', () => {
    const nodes = parseInlineMarkdown('Run `npm run build` now.');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe('Run ');
    expect(nodes[2]).toBe(' now.');
  });

  it('converts markdown links and bare URLs into clickable links', () => {
    const nodes = parseInlineMarkdown('Visit [Google](https://google.com) or https://gemini.google.com');
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toBe('Visit ');
    expect(nodes[2]).toBe(' or ');
  });

  it('cleans up lone or unclosed stray ** stars cleanly', () => {
    const nodes = parseInlineMarkdown('Here is **lone star without closing.');
    // The unclosed ** should be stripped cleanly so no raw stars are displayed
    expect(nodes.some((n) => typeof n === 'string' && n.includes('**'))).toBe(false);
  });
});
