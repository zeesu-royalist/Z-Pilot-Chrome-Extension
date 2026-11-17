import { describe, it, expect } from 'vitest';
import {
  stripTrackingUrls,
  unwrapBrokenLines,
  cleanQuotesAndChars,
  convertHtmlToMarkdown,
  transformCase,
  getTextStats,
  cleanAllText,
  buildOcrPrompt,
} from '../services/clean-copy-ocr.js';

describe('Z-Pilot Clean Copy & OCR Engine', () => {
  describe('1. Tracking URL Stripper', () => {
    it('strips standard UTM parameters while preserving canonical link', () => {
      const input = 'Check this out: https://example.com/product?utm_source=twitter&utm_medium=social&utm_campaign=winter_sale for details.';
      const output = stripTrackingUrls(input);
      expect(output).toBe('Check this out: https://example.com/product for details.');
    });

    it('strips social/ad click IDs: fbclid, gclid, igshid, twclid, msclkid', () => {
      const input = 'https://store.com/item?fbclid=IwAR123&gclid=Cj0K456&item_id=999';
      const output = stripTrackingUrls(input);
      expect(output).toBe('https://store.com/item?item_id=999');
    });

    it('strips YouTube share tracking param "si" while keeping video id', () => {
      const input = 'https://youtu.be/dQw4w9WgXcQ?si=abcdef123456';
      const output = stripTrackingUrls(input);
      expect(output).toBe('https://youtu.be/dQw4w9WgXcQ');

      const fullYt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=12345&t=42s';
      expect(stripTrackingUrls(fullYt)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
    });

    it('handles multiple URLs in text with trailing punctuation cleanly', () => {
      const text = 'Visit https://site.com/?utm_source=ad. Also see https://blog.org/post?ref=newsletter!';
      const res = stripTrackingUrls(text);
      expect(res).toBe('Visit https://site.com/. Also see https://blog.org/post!');
    });

    it('leaves URLs without tracking parameters untouched', () => {
      const clean = 'https://github.com/zeesu-royalist/Z-Pilot?tab=readme';
      expect(stripTrackingUrls(clean)).toBe(clean);
    });
  });

  describe('2. PDF & Broken Line Unwrapper', () => {
    it('unwraps sentences broken across lines within a paragraph', () => {
      const pdfText = `The autonomous AI browser
assistant provides smart automation,
webpage summarization, and
instant video downloads.`;
      const unwrapped = unwrapBrokenLines(pdfText);
      expect(unwrapped).toBe(
        'The autonomous AI browser assistant provides smart automation, webpage summarization, and instant video downloads.'
      );
    });

    it('re-connects hyphenated broken words', () => {
      const hyphenText = `This extension offers multi-
lingual translation and multi-
currency conversion.`;
      const res = unwrapBrokenLines(hyphenText);
      expect(res).toBe(
        'This extension offers multilingual translation and multicurrency conversion.'
      );
    });

    it('strictly preserves separate paragraphs separated by blank lines', () => {
      const multiPara = `Paragraph 1 line A
Paragraph 1 line B.

Paragraph 2 line A
Paragraph 2 line B.`;
      const res = unwrapBrokenLines(multiPara);
      expect(res).toBe(
        'Paragraph 1 line A Paragraph 1 line B.\n\nParagraph 2 line A Paragraph 2 line B.'
      );
    });

    it('preserves bullet lists, numbered lists, headings, and code fences', () => {
      const doc = `# Title
- First bullet item
- Second bullet item
1. Numbered item 1
2. Numbered item 2
> A blockquote line

A normal paragraph line that
should be joined together.`;

      const res = unwrapBrokenLines(doc);
      expect(res).toContain('# Title');
      expect(res).toContain('- First bullet item\n- Second bullet item');
      expect(res).toContain('1. Numbered item 1\n2. Numbered item 2');
      expect(res).toContain('> A blockquote line');
      expect(res).toContain('A normal paragraph line that should be joined together.');
    });
  });

  describe('3. Quote & Character Sanitizer', () => {
    it('normalizes curly smart quotes into standard ascii quotes', () => {
      const messy = `“Hello World” and ‘Single Quotes’ or „German quotes“`;
      const clean = cleanQuotesAndChars(messy);
      expect(clean).toBe(`"Hello World" and 'Single Quotes' or "German quotes"`);
    });

    it('removes zero-width and invisible unicode spaces', () => {
      const withZeroWidth = 'Clean\u200BText\uFEFFWith\u00A0Spaces';
      const clean = cleanQuotesAndChars(withZeroWidth);
      expect(clean).toBe('CleanTextWith Spaces');
    });

    it('strips Wikipedia and academic citation brackets', () => {
      const wiki = 'The solar system formed 4.6 billion years ago[1][2] from a gravitational collapse[citation needed].';
      const clean = cleanQuotesAndChars(wiki, { stripCitations: true });
      expect(clean).toBe('The solar system formed 4.6 billion years ago from a gravitational collapse.');
    });

    it('strips email reply quote arrows', () => {
      const email = `> Here is an old reply
>> Nested reply line
Regular line`;
      const clean = cleanQuotesAndChars(email, { stripQuotesPrefix: true });
      expect(clean).toBe('Here is an old reply\nNested reply line\nRegular line');
    });
  });

  describe('4. HTML to Clean Markdown Converter', () => {
    it('converts basic HTML elements into Markdown', () => {
      const html = '<h1>Heading</h1><p>This is <b>bold</b>, <i>italic</i>, and <code>code</code>.</p>';
      const md = convertHtmlToMarkdown(html);
      expect(md).toContain('# Heading');
      expect(md).toContain('**bold**');
      expect(md).toContain('*italic*');
      expect(md).toContain('`code`');
    });

    it('converts hyperlinks and lists to Markdown', () => {
      const html = '<p>Check <a href="https://google.com">Google</a>.</p><ul><li>Alpha</li><li>Beta</li></ul>';
      const md = convertHtmlToMarkdown(html);
      expect(md).toContain('[Google](https://google.com)');
      expect(md).toContain('- Alpha');
      expect(md).toContain('- Beta');
    });

    it('strips scripts and styles safely', () => {
      const dangerous = '<style>body { color: red; }</style><p>Hello</p><script>alert("hack")</script>';
      const clean = convertHtmlToMarkdown(dangerous);
      expect(clean).toBe('Hello');
    });
  });

  describe('5. Case Transformation Studio', () => {
    it('transforms to Title Case correctly ignoring minor words', () => {
      const text = 'the quick brown fox jumps over the lazy dog';
      expect(transformCase(text, 'title')).toBe('The Quick Brown Fox Jumps over the Lazy Dog');
    });

    it('transforms to UPPERCASE and lowercase', () => {
      expect(transformCase('Hello World', 'upper')).toBe('HELLO WORLD');
      expect(transformCase('Hello World', 'lower')).toBe('hello world');
    });

    it('transforms to Sentence case', () => {
      const text = 'hello world. how are you? i am fine!';
      expect(transformCase(text, 'sentence')).toBe('Hello world. How are you? I am fine!');
    });

    it('transforms to camelCase, snake_case, and kebab-case', () => {
      const text = 'z pilot browser agent';
      expect(transformCase(text, 'camel')).toBe('zPilotBrowserAgent');
      expect(transformCase(text, 'snake')).toBe('z_pilot_browser_agent');
      expect(transformCase(text, 'kebab')).toBe('z-pilot-browser-agent');
    });
  });

  describe('6. Text Statistics & Reading Time', () => {
    it('computes accurate characters, words, sentences, and reading time', () => {
      const sample = 'Z-Pilot is an autonomous AI browser assistant. It enables smart browsing, video downloads, and ad blocking. Enjoy faster workflows!';
      const stats = getTextStats(sample);

      expect(stats.words).toBe(19);
      expect(stats.sentences).toBe(3);
      expect(stats.charactersWithSpaces).toBe(sample.length);
      expect(stats.readingTimeMinutes).toBeGreaterThan(0);
    });

    it('handles empty string gracefully without throwing', () => {
      const stats = getTextStats('');
      expect(stats.words).toBe(0);
      expect(stats.charactersWithSpaces).toBe(0);
      expect(stats.readingTimeMinutes).toBe(0);
    });
  });

  describe('7. Multimodal Vision OCR Prompts & Pipeline', () => {
    it('builds appropriate prompts for all OCR modes', () => {
      expect(buildOcrPrompt('raw')).toContain('verbatim');
      expect(buildOcrPrompt('markdown')).toContain('GitHub Flavored Markdown');
      expect(buildOcrPrompt('code')).toContain('programming code');
      expect(buildOcrPrompt('translate', 'Hindi')).toContain('Hindi');
      expect(buildOcrPrompt('summarize')).toContain('summary');
    });

    it('cleanAllText executes full pipeline smoothly', () => {
      const messy = `Read <a href="https://example.com/?utm_source=newsletter">this article</a>[1].
Line broken
here with “smart quotes”.`;

      const result = cleanAllText(messy);
      expect(result).not.toContain('utm_source');
      expect(result).not.toContain('[1]');
      expect(result).toContain('"smart quotes"');
      expect(result).toContain('Line broken here with "smart quotes".');
    });

    it('strips tracking params while preserving URL anchors and hash targets', () => {
      const url = 'https://docs.site.com/guide?utm_medium=email#installation-step';
      expect(stripTrackingUrls(url)).toBe('https://docs.site.com/guide#installation-step');
    });
  });
});
