import { FlashlyCard } from '../models/card';
import { ExportOptions } from '../services/export-transformers/base-transformer';
import { JSONTransformer } from '../services/export-transformers/json-transformer';

export class JSONExporter {
  private transformer: JSONTransformer;

  constructor() {
    this.transformer = new JSONTransformer();
  }

  async export(cards: FlashlyCard[], options: ExportOptions): Promise<string> {
    const jsonData = this.transformer.transform(cards, options);
    
    // Pretty print with 2 spaces indentation
    const jsonString = JSON.stringify(jsonData, null, 2);
    
    return jsonString;
  }

  /**
   * Export as compact JSON (no formatting)
   */
  async exportCompact(cards: FlashlyCard[], options: ExportOptions): Promise<string> {
    const jsonData = this.transformer.transform(cards, options);
    return JSON.stringify(jsonData);
  }
}
