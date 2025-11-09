import { FlashlyCard } from '../../models/card';
import { ExportTransformer, ExportOptions, SM2Data } from './base-transformer';
import { convertMarkdownToHTML, stripMarkdownFormatting } from '../../utils/markdown-to-html';
import { State } from 'ts-fsrs';

export interface AnkiNote {
  front: string;
  back: string;
  tags: string[];
  guid: string;
  deckName: string;
}

export interface AnkiCard {
  deckName: string;
  modelName: string;
  fields: {
    Front: string;
    Back: string;
  };
  tags: string[];
  guid?: string;
}

export class AnkiTransformer implements ExportTransformer<AnkiCard[]> {
  transform(cards: FlashlyCard[], options: ExportOptions): AnkiCard[] {
    return cards.map(card => this.transformCard(card, options));
  }

  validate(data: AnkiCard[]): boolean {
    return data.every(card => 
      card.deckName &&
      card.modelName &&
      card.fields &&
      card.fields.Front &&
      card.fields.Back
    );
  }

  private transformCard(card: FlashlyCard, options: ExportOptions): AnkiCard {
    const deckName = this.getDeckName(card, options);
    const fields = this.transformFields(card, options);
    const tags = this.transformTags(card, options);

    return {
      deckName,
      modelName: 'Basic',
      fields,
      tags,
      guid: this.generateGuid(card)
    };
  }

  private getDeckName(card: FlashlyCard, options: ExportOptions): string {
    const prefix = options.ankiDeckPrefix || 'Flashly';
    const deckName = card.deck || 'Default';
    return `${prefix}::${deckName}`;
  }

  private transformFields(card: FlashlyCard, options: ExportOptions): { Front: string; Back: string } {
    let front = card.front;
    let back = card.back;

    if (options.ankiPlainTextMode) {
      // Plain text mode: strip all formatting
      front = stripMarkdownFormatting(front);
      back = stripMarkdownFormatting(back);
    } else if (options.ankiConvertMarkdown) {
      // Convert Markdown to HTML
      front = convertMarkdownToHTML(front, {
        convertWikilinks: true,
        stripObsidianSyntax: false
      });
      
      back = convertMarkdownToHTML(back, {
        convertWikilinks: true,
        stripObsidianSyntax: false
      });
    }

    return { Front: front, Back: back };
  }

  private transformTags(card: FlashlyCard, options: ExportOptions): string[] {
    if (!options.includeTags || !card.tags) {
      return [];
    }
    return card.tags.map(tag => tag.replace(/^#/, '').replace(/\//g, '::'));
  }

  private generateGuid(card: FlashlyCard): string {
    // Generate a stable GUID based on card content
    const content = `${card.front}${card.back}${card.deck}`;
    return this.simpleHash(content);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }



  /**
   * Convert FSRS scheduling data to SM-2 format for Anki
   */
  convertToSM2(card: FlashlyCard): SM2Data | null {
    if (!card.fsrsCard || card.fsrsCard.state === State.New) {
      return null;
    }

    // FSRS uses difficulty (0-10), Anki uses ease factor (1.3-2.5)
    // Convert: difficulty 5 ≈ ease 2.5, difficulty 10 ≈ ease 1.3
    const difficulty = card.fsrsCard.difficulty || 5;
    const easeFactor = 2.5 - (difficulty / 10) * 1.2;

    return {
      interval: card.fsrsCard.scheduled_days || 1,
      repetitions: card.fsrsCard.reps || 0,
      easeFactor: Math.max(1.3, Math.min(2.5, easeFactor))
    };
  }
}
