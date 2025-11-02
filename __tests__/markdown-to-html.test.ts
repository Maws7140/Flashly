/**
 * Tests for Markdown to HTML converter
 */

import { convertMarkdownToHTML, stripMarkdownFormatting } from '../src/utils/markdown-to-html';

describe('MarkdownToHTMLConverter', () => {
  describe('Block Elements', () => {
    it('converts headers', () => {
      expect(convertMarkdownToHTML('# H1')).toContain('<h1>H1</h1>');
      expect(convertMarkdownToHTML('## H2')).toContain('<h2>H2</h2>');
      expect(convertMarkdownToHTML('### H3')).toContain('<h3>H3</h3>');
      expect(convertMarkdownToHTML('#### H4')).toContain('<h4>H4</h4>');
      expect(convertMarkdownToHTML('##### H5')).toContain('<h5>H5</h5>');
      expect(convertMarkdownToHTML('###### H6')).toContain('<h6>H6</h6>');
    });

    it('converts unordered lists', () => {
      const md = '- Item 1\n- Item 2\n- Item 3';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
      expect(html).toContain('<li>Item 2</li>');
      expect(html).toContain('</ul>');
    });

    it('converts ordered lists', () => {
      const md = '1. First\n2. Second\n3. Third';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>First</li>');
      expect(html).toContain('</ol>');
    });

    it('converts blockquotes', () => {
      const md = '> This is a quote\n> Second line';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<blockquote>');
      expect(html).toContain('This is a quote');
      expect(html).toContain('</blockquote>');
    });

    it('converts horizontal rules', () => {
      expect(convertMarkdownToHTML('---')).toContain('<hr>');
      expect(convertMarkdownToHTML('***')).toContain('<hr>');
      expect(convertMarkdownToHTML('___')).toContain('<hr>');
    });

    it('converts code blocks with language', () => {
      const md = '```python\nprint("hello")\n```';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<pre>');
      expect(html).toContain('<code class="language-python">');
      expect(html).toContain('print(&quot;hello&quot;)');
      expect(html).toContain('</code></pre>');
    });

    it('converts code blocks without language', () => {
      const md = '```\ncode here\n```';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<pre>');
      expect(html).toContain('<code class="language-">');
    });
  });

  describe('Inline Elements', () => {
    it('converts bold with asterisks', () => {
      expect(convertMarkdownToHTML('**bold**')).toContain('<strong>bold</strong>');
    });

    it('converts bold with underscores', () => {
      expect(convertMarkdownToHTML('__bold__')).toContain('<strong>bold</strong>');
    });

    it('converts italic with single asterisk', () => {
      const html = convertMarkdownToHTML('*italic*');
      expect(html).toContain('<em>italic</em>');
    });

    it('converts italic with single underscore', () => {
      const html = convertMarkdownToHTML('_italic_');
      expect(html).toContain('<em>italic</em>');
    });

    it('handles bold and italic together', () => {
      const md = '**bold** and *italic*';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('converts inline code', () => {
      expect(convertMarkdownToHTML('`code`')).toContain('<code>code</code>');
    });

    it('converts strikethrough', () => {
      expect(convertMarkdownToHTML('~~deleted~~')).toContain('<del>deleted</del>');
    });

    it('converts links', () => {
      const html = convertMarkdownToHTML('[text](https://example.com)');
      expect(html).toContain('<a href="https://example.com">text</a>');
    });

    it('converts images', () => {
      const html = convertMarkdownToHTML('![alt text](image.png)');
      expect(html).toContain('<img src="image.png" alt="alt text">');
    });
  });

  describe('Obsidian Syntax', () => {
    it('converts simple wikilinks', () => {
      const html = convertMarkdownToHTML('[[page]]');
      expect(html).toContain('page');
      expect(html).not.toContain('[[');
    });

    it('converts wikilinks with display text', () => {
      const html = convertMarkdownToHTML('[[page|display]]');
      expect(html).toContain('display');
      expect(html).not.toContain('page');
      expect(html).not.toContain('[[');
    });

    it('converts highlights', () => {
      expect(convertMarkdownToHTML('==highlight==')).toContain('<mark>highlight</mark>');
    });

    it('converts image embeds', () => {
      const html = convertMarkdownToHTML('![[image.png]]');
      expect(html).toContain('<img src="image.png"');
    });

    it('removes comments', () => {
      const html = convertMarkdownToHTML('text %% comment %% more');
      expect(html).not.toContain('comment');
      expect(html).toContain('text');
      expect(html).toContain('more');
    });
  });

  describe('Complex Scenarios', () => {
    it('handles mixed formatting', () => {
      const md = '# Header\n\n**Bold** and *italic* with `code`\n\n- List item';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<h1>Header</h1>');
      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('<li>List item</li>');
    });

    it('handles nested formatting in lists', () => {
      const md = '- Item with **bold**\n- Item with *italic*\n- Item with `code`';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<li>Item with <strong>bold</strong></li>');
      expect(html).toContain('<li>Item with <em>italic</em></li>');
      expect(html).toContain('<li>Item with <code>code</code></li>');
    });

    it('protects code blocks from inline formatting', () => {
      const md = '```\n**this should not be bold**\n```';
      const html = convertMarkdownToHTML(md);
      expect(html).not.toContain('<strong>');
      expect(html).toContain('**this should not be bold**');
    });

    it('handles special HTML characters in code', () => {
      const md = '```\n<div>content</div>\n```';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('&lt;div&gt;');
      expect(html).not.toContain('<div>content</div>');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string', () => {
      expect(convertMarkdownToHTML('')).toBe('');
    });

    it('handles plain text without formatting', () => {
      const text = 'Just plain text';
      expect(convertMarkdownToHTML(text)).toContain(text);
    });

    it('handles multiple consecutive headers', () => {
      const md = '# H1\n## H2\n### H3';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<h1>H1</h1>');
      expect(html).toContain('<h2>H2</h2>');
      expect(html).toContain('<h3>H3</h3>');
    });

    it('handles mixed list types', () => {
      const md = '- Unordered\n1. Ordered\n- Unordered again';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<ul>');
      expect(html).toContain('<ol>');
    });
  });

  describe('Plain Text Mode', () => {
    it('strips headers', () => {
      expect(stripMarkdownFormatting('# Header')).toBe('Header');
      expect(stripMarkdownFormatting('## H2')).toBe('H2');
    });

    it('strips bold', () => {
      expect(stripMarkdownFormatting('**bold**')).toBe('bold');
      expect(stripMarkdownFormatting('__bold__')).toBe('bold');
    });

    it('strips italic', () => {
      expect(stripMarkdownFormatting('*italic*')).toBe('italic');
      expect(stripMarkdownFormatting('_italic_')).toBe('italic');
    });

    it('strips inline code', () => {
      expect(stripMarkdownFormatting('`code`')).toBe('code');
    });

    it('strips lists', () => {
      const md = '- Item 1\n- Item 2';
      const plain = stripMarkdownFormatting(md);
      expect(plain).not.toContain('-');
      expect(plain).toContain('Item 1');
      expect(plain).toContain('Item 2');
    });

    it('strips wikilinks but keeps text', () => {
      expect(stripMarkdownFormatting('[[page]]')).toBe('page');
      expect(stripMarkdownFormatting('[[page|display]]')).toBe('display');
    });

    it('strips images completely', () => {
      const plain = stripMarkdownFormatting('![alt](image.png)');
      expect(plain).not.toContain('image.png');
      expect(plain).not.toContain('alt');
    });

    it('strips code blocks', () => {
      const md = '```python\ncode\n```';
      const plain = stripMarkdownFormatting(md);
      expect(plain).not.toContain('```');
      expect(plain).not.toContain('python');
    });

    it('strips all formatting from complex text', () => {
      const md = '# Header\n\n**Bold** and *italic*\n\n- List\n- Items\n\n`code` and [[link]]';
      const plain = stripMarkdownFormatting(md);
      expect(plain).not.toContain('#');
      expect(plain).not.toContain('**');
      expect(plain).not.toContain('*');
      expect(plain).not.toContain('-');
      expect(plain).not.toContain('`');
      expect(plain).not.toContain('[[');
      expect(plain).toContain('Header');
      expect(plain).toContain('Bold');
      expect(plain).toContain('italic');
      expect(plain).toContain('List');
      expect(plain).toContain('link');
    });
  });
});
