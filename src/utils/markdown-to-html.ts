/**
 * Comprehensive Markdown to HTML converter for Anki export
 * Handles Obsidian-flavored Markdown with proper ordering
 */

interface ConversionOptions {
  preserveCodeBlocks: boolean;
  convertWikilinks: boolean;
  stripObsidianSyntax: boolean;
  plainTextMode: boolean;
}

export class MarkdownToHTMLConverter {
  private codeBlockPlaceholders: Map<string, string>;
  
  constructor(private options: ConversionOptions) {
    this.codeBlockPlaceholders = new Map();
  }

  convert(markdown: string): string {
    if (this.options.plainTextMode) {
      return this.stripAllFormatting(markdown);
    }

    let html = markdown;

    // Phase 1: Protect and process code blocks
    html = this.protectCodeBlocks(html);

    // Phase 2: Block-level elements
    html = this.convertHeaders(html);
    html = this.convertLists(html);
    html = this.convertBlockquotes(html);
    html = this.convertHorizontalRules(html);

    // Phase 3: Obsidian-specific syntax
    if (!this.options.stripObsidianSyntax) {
      html = this.convertWikilinks(html);
      html = this.convertHighlights(html);
      html = this.convertCallouts(html);
    }
    html = this.removeComments(html);

    // Phase 4: Inline elements (order matters!)
    html = this.convertImages(html);  // Images BEFORE links
    html = this.convertInlineCode(html);
    html = this.convertLinks(html);
    html = this.convertBold(html);
    html = this.convertItalic(html);
    html = this.convertStrikethrough(html);

    // Phase 5: Restore code blocks
    html = this.restoreCodeBlocks(html);

    // Phase 6: Cleanup
    html = this.convertLineBreaks(html);
    html = this.cleanupWhitespace(html);

    return html;
  }

  private protectCodeBlocks(text: string): string {
    // Match ``` code blocks and replace with placeholders
    return text.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (match, lang: string, code: string) => {
      const placeholder = `<<<CODEBLOCK${Date.now()}N${this.codeBlockPlaceholders.size}>>>`;
      const html = `<pre><code class="language-${lang}">${this.escapeHTML(code.trim())}</code></pre>`;
      this.codeBlockPlaceholders.set(placeholder, html);
      return placeholder;
    });
  }

  private restoreCodeBlocks(text: string): string {
    for (const [placeholder, html] of this.codeBlockPlaceholders.entries()) {
      text = text.replace(placeholder, html);
    }
    return text;
  }

  private convertHeaders(text: string): string {
    // H6 to H1 (reverse order to avoid conflicts)
    text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    text = text.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    text = text.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    return text;
  }

  private convertLists(text: string): string {
    // Split into lines for processing
    const lines = text.split('\n');
    const result: string[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Unordered list (-, *, +)
      const ulMatch = line.match(/^[-*+]\s+(.+)$/);
      // Ordered list (1., 2., etc.)
      const olMatch = line.match(/^\d+\.\s+(.+)$/);

      if (ulMatch) {
        if (!inList) {
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        } else if (listType === 'ol') {
          result.push('</ol>');
          result.push('<ul>');
          listType = 'ul';
        }
        result.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (!inList) {
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        } else if (listType === 'ul') {
          result.push('</ul>');
          result.push('<ol>');
          listType = 'ol';
        }
        result.push(`<li>${olMatch[1]}</li>`);
      } else {
        if (inList) {
          result.push(listType === 'ul' ? '</ul>' : '</ol>');
          inList = false;
          listType = null;
        }
        result.push(line);
      }
    }

    // Close any open list
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
    }

    return result.join('\n');
  }

  private convertBlockquotes(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let inBlockquote = false;

    for (const line of lines) {
      const match = line.match(/^>\s+(.+)$/);
      if (match) {
        if (!inBlockquote) {
          result.push('<blockquote>');
          inBlockquote = true;
        }
        result.push(match[1]);
      } else {
        if (inBlockquote) {
          result.push('</blockquote>');
          inBlockquote = false;
        }
        result.push(line);
      }
    }

    if (inBlockquote) {
      result.push('</blockquote>');
    }

    return result.join('\n');
  }

  private convertHorizontalRules(text: string): string {
    return text.replace(/^([-*_])\1{2,}$/gm, '<hr>');
  }

  private convertWikilinks(text: string): string {
    // First handle image embeds with ! prefix
    text = text.replace(/!\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, path, pipe, alt) => {
      const altText = alt || path.split('/').pop()?.split('.')[0] || 'image';
      return `<img src="${path}" alt="${altText}">`;
    });
    
    if (!this.options.convertWikilinks) {
      // Strip remaining wikilinks to plain text
      return text.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, page, pipe, display) => {
        return display || page;
      });
    }
    
    // Convert [[page|display]] to display text (no links in Anki)
    return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
               .replace(/\[\[([^\]]+)\]\]/g, '$1');
  }

  private convertHighlights(text: string): string {
    return text.replace(/==(.+?)==/g, '<mark>$1</mark>');
  }

  private convertCallouts(text: string): string {
    // Convert > [!note] Title to styled div
    return text.replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, 
      '<div class="callout callout-$1"><strong>$2</strong></div>');
  }

  private removeComments(text: string): string {
    // Remove %% comments %%
    return text.replace(/%%[\s\S]*?%%/g, '');
  }

  private convertInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  private convertImages(text: string): string {
    // Obsidian embeds: ![[image.png]] - must come BEFORE standard markdown images
    text = text.replace(/!\[\[([^\]]+)\]\]/g, '<img src="$1" alt="">');
    
    // Standard Markdown: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    
    return text;
  }

  private convertLinks(text: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  private convertBold(text: string): string {
    // Process ** and __ (must be before italic)
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    return text;
  }

  private convertItalic(text: string): string {
    // Process * and _ (after bold to avoid conflicts)
    // Use negative lookbehind/lookahead to avoid matching ** or __
    text = text.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '<em>$1</em>');
    return text;
  }

  private convertStrikethrough(text: string): string {
    return text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  }

  private convertLineBreaks(text: string): string {
    // Convert remaining newlines to <br>
    return text.replace(/\n/g, '<br>');
  }

  private cleanupWhitespace(text: string): string {
    // Remove multiple consecutive <br> tags
    text = text.replace(/(<br>){3,}/g, '<br><br>');
    // Remove <br> before closing block elements
    text = text.replace(/<br>(<\/(ul|ol|blockquote|div|h[1-6])>)/g, '$1');
    // Remove <br> after opening block elements
    text = text.replace(/(<(ul|ol|blockquote|div|h[1-6])>)<br>/g, '$1');
    return text.trim();
  }

  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private stripAllFormatting(text: string): string {
    // Remove all Markdown syntax for plain text mode
    let plain = text;
    
    // Remove code blocks
    plain = plain.replace(/```[\s\S]*?```/g, '');
    
    // Remove headers
    plain = plain.replace(/^#{1,6}\s+/gm, '');
    
    // Remove lists
    plain = plain.replace(/^[-*+]\s+/gm, '');
    plain = plain.replace(/^\d+\.\s+/gm, '');
    
    // Remove blockquotes
    plain = plain.replace(/^>\s+/gm, '');
    
    // Remove wikilinks
    plain = plain.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, page, pipe, display) => {
      return display || page;
    });
    
    // Remove highlights
    plain = plain.replace(/==(.+?)==/g, '$1');
    
    // Remove comments
    plain = plain.replace(/%%[\s\S]*?%%/g, '');
    
    // Remove inline code
    plain = plain.replace(/`([^`]+)`/g, '$1');
    
    // Remove images
    plain = plain.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    plain = plain.replace(/!\[\[([^\]]+)\]\]/g, '');
    
    // Remove links (keep text)
    plain = plain.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remove bold
    plain = plain.replace(/\*\*(.+?)\*\*/g, '$1');
    plain = plain.replace(/__(.+?)__/g, '$1');
    
    // Remove italic
    plain = plain.replace(/\*([^*]+)\*/g, '$1');
    plain = plain.replace(/_([^_]+)_/g, '$1');
    
    // Remove strikethrough
    plain = plain.replace(/~~(.+?)~~/g, '$1');
    
    // Remove horizontal rules
    plain = plain.replace(/^([-*_]){3,}$/gm, '');
    
    return plain.trim();
  }
}

// Factory function
export function convertMarkdownToHTML(
  markdown: string, 
  options: Partial<ConversionOptions> = {}
): string {
  const converter = new MarkdownToHTMLConverter({
    preserveCodeBlocks: true,
    convertWikilinks: true,
    stripObsidianSyntax: false,
    plainTextMode: false,
    ...options
  });
  
  return converter.convert(markdown);
}

// Plain text export option
export function stripMarkdownFormatting(markdown: string): string {
  const converter = new MarkdownToHTMLConverter({
    preserveCodeBlocks: false,
    convertWikilinks: false,
    stripObsidianSyntax: true,
    plainTextMode: true
  });
  
  return converter.convert(markdown);
}
