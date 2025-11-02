import { FlashlyCard } from '../models/card';
import { ExportOptions } from '../services/export-transformers/base-transformer';
import { MarkdownTransformer } from '../services/export-transformers/markdown-transformer';

export class MarkdownExporter {
  private transformer: MarkdownTransformer;

  constructor() {
    this.transformer = new MarkdownTransformer();
  }

  async export(cards: FlashlyCard[], options: ExportOptions): Promise<Map<string, string>> {
    const result = this.transformer.transform(cards, options);
    return result.decks;
  }

  /**
   * Export all cards to a single markdown file
   */
  async exportCombined(cards: FlashlyCard[], options: ExportOptions): Promise<string> {
    return this.transformer.generateCombinedMarkdown(cards, options);
  }
}
