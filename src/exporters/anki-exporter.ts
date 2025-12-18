import { FlashlyCard } from '../models/card';
import { ExportOptions } from '../services/export-transformers/base-transformer';
import { AnkiTransformer, AnkiCard } from '../services/export-transformers/anki-transformer';

/**
 * Anki Exporter
 *
 * Exports flashcards to Anki-compatible CSV format.
 * This CSV can be imported directly into Anki via File > Import.
 */
export class AnkiExporter {
  private transformer: AnkiTransformer;

  constructor() {
    this.transformer = new AnkiTransformer();
  }

  /**
   * Export as Anki-compatible CSV format
   * This format can be imported directly into Anki via File > Import
   */
  export(cards: FlashlyCard[], options: ExportOptions): string {
    const ankiCards = this.transformer.transform(cards, options);

    // Generate CSV in Anki import format
    // Format: Front\tBack\tTags\tDeck
    const lines: string[] = [];

    // Add header comment
    lines.push('#separator:tab');
    lines.push('#html:true');
    lines.push('#deck column:4');
    lines.push('#tags column:3');
    lines.push('');

    // Add cards
    for (const card of ankiCards) {
      const front = this.escapeForAnki(card.fields.Front);
      const back = this.escapeForAnki(card.fields.Back);
      const tags = card.tags.join(' ');
      const deck = card.deckName;

      lines.push(`${front}\t${back}\t${tags}\t${deck}`);
    }

    return lines.join('\n');
  }

  /**
   * Export multiple decks to separate files
   */
  exportMultipleDecks(cards: FlashlyCard[], options: ExportOptions): Map<string, string> {
    const ankiCards = this.transformer.transform(cards, options);

    // Group cards by deck
    const deckMap = new Map<string, AnkiCard[]>();
    for (const card of ankiCards) {
      if (!deckMap.has(card.deckName)) {
        deckMap.set(card.deckName, []);
      }
      deckMap.get(card.deckName)!.push(card);
    }

    const result = new Map<string, string>();

    // Create a separate CSV for each deck
    for (const [deckName, deckCards] of deckMap.entries()) {
      const lines: string[] = [];

      lines.push('#separator:tab');
      lines.push('#html:true');
      lines.push('#deck:' + deckName);
      lines.push('');

      for (const card of deckCards) {
        const front = this.escapeForAnki(card.fields.Front);
        const back = this.escapeForAnki(card.fields.Back);
        const tags = card.tags.join(' ');

        lines.push(`${front}\t${back}\t${tags}`);
      }

      result.set(deckName, lines.join('\n'));
    }

    return result;
  }

  private escapeForAnki(text: string): string {
    // Replace tabs with spaces
    text = text.replace(/\t/g, '    ');
    // Preserve newlines as <br> for HTML
    text = text.replace(/\n/g, '<br>');
    return text;
  }
}
