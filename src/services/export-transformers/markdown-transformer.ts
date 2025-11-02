import { FlashlyCard } from '../../models/card';
import { ExportTransformer, ExportOptions } from './base-transformer';

export interface MarkdownExportFormat {
  decks: Map<string, string>;
}

export class MarkdownTransformer implements ExportTransformer<MarkdownExportFormat> {
  transform(cards: FlashlyCard[], options: ExportOptions): MarkdownExportFormat {
    const decks = new Map<string, string>();

    // Group cards by deck
    const deckMap = new Map<string, FlashlyCard[]>();
    for (const card of cards) {
      const deckName = card.deck || 'Default';
      if (!deckMap.has(deckName)) {
        deckMap.set(deckName, []);
      }
      deckMap.get(deckName)!.push(card);
    }

    // Generate markdown for each deck
    for (const [deckName, deckCards] of deckMap.entries()) {
      const markdown = this.generateDeckMarkdown(deckName, deckCards, options);
      decks.set(deckName, markdown);
    }

    return { decks };
  }

  validate(data: MarkdownExportFormat): boolean {
    return data.decks && data.decks.size > 0;
  }

  private generateDeckMarkdown(deckName: string, cards: FlashlyCard[], options: ExportOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${deckName}`);
    lines.push('');
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push(`Total Cards: ${cards.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Cards
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      lines.push(`## Card ${i + 1}`);
      lines.push('');
      
      // Tags
      if (options.includeTags && card.tags && card.tags.length > 0) {
        lines.push(`**Tags:** ${card.tags.join(', ')}`);
        lines.push('');
      }

      // Front
      lines.push('### Front');
      lines.push('');
      lines.push(card.front);
      lines.push('');

      // Back
      lines.push('### Back');
      lines.push('');
      lines.push(card.back);
      lines.push('');

      // Metadata
      if (options.includeScheduling) {
        lines.push('### Metadata');
        lines.push('');
        lines.push(`- **Created:** ${card.created.toLocaleString()}`);
        lines.push(`- **Updated:** ${card.updated.toLocaleString()}`);
        lines.push(`- **Review Count:** ${card.fsrsCard.reps || 0}`);
        
        if (card.fsrsCard.due) {
          lines.push(`- **Due:** ${card.fsrsCard.due.toLocaleString()}`);
        }

        if (card.fsrsCard) {
          lines.push(`- **State:** ${card.fsrsCard.state}`);
          if (card.fsrsCard.difficulty !== undefined) {
            lines.push(`- **Difficulty:** ${card.fsrsCard.difficulty.toFixed(2)}`);
          }
          if (card.fsrsCard.stability !== undefined) {
            lines.push(`- **Stability:** ${card.fsrsCard.stability.toFixed(2)}`);
          }
        }
        
        lines.push(`- **Source:** ${card.source.file}:${card.source.line}`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate a single markdown file with all decks
   */
  generateCombinedMarkdown(cards: FlashlyCard[], options: ExportOptions): string {
    const lines: string[] = [];

    // Main header
    lines.push('# Flashly Export');
    lines.push('');
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push(`Total Cards: ${cards.length}`);
    lines.push('');

    // Group by deck
    const deckMap = new Map<string, FlashlyCard[]>();
    for (const card of cards) {
      const deckName = card.deck || 'Default';
      if (!deckMap.has(deckName)) {
        deckMap.set(deckName, []);
      }
      deckMap.get(deckName)!.push(card);
    }

    lines.push('## Table of Contents');
    lines.push('');
    for (const deckName of deckMap.keys()) {
      lines.push(`- [${deckName}](#${this.slugify(deckName)})`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Add each deck
    for (const [deckName, deckCards] of deckMap.entries()) {
      lines.push(`# ${deckName}`);
      lines.push('');
      lines.push(`Cards in this deck: ${deckCards.length}`);
      lines.push('');

      for (let i = 0; i < deckCards.length; i++) {
        const card = deckCards[i];
        lines.push(`## ${i + 1}. ${this.truncate(card.front, 50)}`);
        lines.push('');
        
        if (options.includeTags && card.tags && card.tags.length > 0) {
          lines.push(`**Tags:** ${card.tags.join(', ')}`);
          lines.push('');
        }

        lines.push('**Q:** ' + card.front);
        lines.push('');
        lines.push('**A:** ' + card.back);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }
}
