import { FlashlyCard } from '../../models/card';
import { ExportTransformer, ExportOptions } from './base-transformer';

export interface JSONExportFormat {
  version: string;
  exportDate: string;
  totalCards: number;
  decks: {
    [deckName: string]: JSONCard[];
  };
}

export interface JSONCard {
  front: string;
  back: string;
  deck: string;
  tags: string[];
  created: string;
  updated: string;
  due?: string;
  fsrsCard?: {
    state: number;
    difficulty?: number;
    stability?: number;
    scheduled_days?: number;
    // elapsed_days?: number; // Deprecated in FSRS v6.0.0
    reps?: number;
    lapses?: number;
    last_review?: string;
  };
  sourceFile: string;
  sourceLine: number;
}

export class JSONTransformer implements ExportTransformer<JSONExportFormat> {
  transform(cards: FlashlyCard[], options: ExportOptions): JSONExportFormat {
    const decks: { [deckName: string]: JSONCard[] } = {};

    for (const card of cards) {
      const jsonCard = this.transformCard(card, options);
      const deckName = card.deck || 'Default';
      
      if (!decks[deckName]) {
        decks[deckName] = [];
      }
      decks[deckName].push(jsonCard);
    }

    return {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      totalCards: cards.length,
      decks
    };
  }

  validate(data: JSONExportFormat): boolean {
    if (!data.version || !data.exportDate || !data.decks) {
      return false;
    }

    for (const deckCards of Object.values(data.decks)) {
      if (!Array.isArray(deckCards)) {
        return false;
      }
      for (const card of deckCards) {
        if (!card.front || !card.back) {
          return false;
        }
      }
    }

    return true;
  }

  private transformCard(card: FlashlyCard, options: ExportOptions): JSONCard {
    const jsonCard: JSONCard = {
      front: card.front,
      back: card.back,
      deck: card.deck || 'Default',
      tags: options.includeTags && card.tags ? card.tags : [],
      created: card.created.toISOString(),
      updated: card.updated.toISOString(),
      sourceFile: card.source.file,
      sourceLine: card.source.line
    };

    if (card.fsrsCard.due) {
      jsonCard.due = card.fsrsCard.due.toISOString();
    }

    if (options.includeScheduling && card.fsrsCard) {
      jsonCard.fsrsCard = {
        state: card.fsrsCard.state,
        difficulty: card.fsrsCard.difficulty,
        stability: card.fsrsCard.stability,
        scheduled_days: card.fsrsCard.scheduled_days,
        // elapsed_days: card.fsrsCard.elapsed_days, // Deprecated in FSRS v6.0.0
        reps: card.fsrsCard.reps,
        lapses: card.fsrsCard.lapses,
        last_review: card.fsrsCard.last_review?.toISOString()
      };
    }

    return jsonCard;
  }

  /**
   * Parse JSON export data back into FlashlyCard format
   */
  static parse(json: string): Partial<FlashlyCard>[] {
    const data: JSONExportFormat = JSON.parse(json);
    const cards: Partial<FlashlyCard>[] = [];

    for (const [deckName, deckCards] of Object.entries(data.decks)) {
      for (const jsonCard of deckCards) {
        const card: Partial<FlashlyCard> = {
          front: jsonCard.front,
          back: jsonCard.back,
          deck: jsonCard.deck,
          tags: jsonCard.tags,
          created: new Date(jsonCard.created),
          updated: new Date(jsonCard.updated),
          source: {
            file: jsonCard.sourceFile,
            line: jsonCard.sourceLine
          }
        };
        cards.push(card);
      }
    }

    return cards;
  }
}
