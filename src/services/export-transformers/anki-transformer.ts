import { App } from 'obsidian';
import { FlashlyCard } from '../../models/card';
import { ExportTransformer, ExportOptions, SM2Data } from './base-transformer';
import { convertMarkdownToHTML, stripMarkdownFormatting } from '../../utils/markdown-to-html';
import { State } from 'ts-fsrs';
import { MediaExtractor, MediaReference } from '../../utils/media-extractor';

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
  media?: MediaReference[];
}

export class AnkiTransformer implements ExportTransformer<AnkiCard[]> {
  constructor(private app?: App) {}

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
    const tags = this.transformTags(card, options);

    // 1. Extract Media from original markdown
    let media: MediaReference[] = [];
    if (options.includeMedia && this.app) {
      const extractor = new MediaExtractor(this.app);
      const frontMedia = extractor.extractFromMarkdown(card.front, card.source.file);
      const backMedia = extractor.extractFromMarkdown(card.back, card.source.file);
      media = [...frontMedia, ...backMedia];
    }

    // 2. Transform Fields (Pass media here to handle replacement BEFORE HTML conversion)
    const fields = this.transformFields(card, options, media);

    const ankiCard: AnkiCard = {
      deckName,
      modelName: 'Basic',
      fields,
      tags,
      guid: this.generateGuid(card),
      media
    };

    return ankiCard;
  }

  private getDeckName(card: FlashlyCard, options: ExportOptions): string {
    const prefix = options.ankiDeckPrefix || 'Flashly';
    const deckName = card.deck || 'Default';
    return `${prefix}::${deckName}`;
  }

  private transformFields(
    card: FlashlyCard, 
    options: ExportOptions, 
    media: MediaReference[]
  ): { Front: string; Back: string } {
    let front = card.front;
    let back = card.back;

    // STEP A: Replace Obsidian Image Syntax with Anki HTML while still Markdown
    // This matches the reference implementation logic directly
    if (media.length > 0) {
      front = this.replaceMediaInMarkdown(front, media);
      back = this.replaceMediaInMarkdown(back, media);
    }

    // STEP B: Convert the rest of the content
    if (options.ankiPlainTextMode) {
      // Plain text mode: strip all formatting
      front = stripMarkdownFormatting(front);
      back = stripMarkdownFormatting(back);
    } else if (options.ankiConvertMarkdown) {
      // Convert Markdown to HTML
      // Note: The HTML converter must tolerate existing <img src="..."> tags
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
    // Generate a stable GUID based on card content, source file, and line number
    // Include source location to ensure header-based cards from different locations are unique
    const content = `${card.front}${card.back}${card.deck}${card.source.file}${card.source.line}`;
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
   * CORRECTED LOGIC:
   * Perform regex replacement on raw markdown.
   * Matches logic from src/utils.ts in reference: convertImagesMDToHtml
   * Replace ![[image.png]] with <img src='ankiFilename'> or ![[audio.mp3]] with <audio src='ankiFilename'>
   * BEFORE converting to HTML
   */
  private replaceMediaInMarkdown(markdown: string, media: MediaReference[]): string {
    let result = markdown;

    // Iterate through the media references extracted earlier
    for (const ref of media) {
      // Create a regex that looks for the specific wikilink found by the extractor
      // We escape the string to be regex-safe
      const escapedOriginal = ref.originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Create appropriate HTML tag based on media type
      // Anki strictly requires the filename ONLY in the src attribute
      let htmlTag: string;
      if (ref.type === 'audio') {
        htmlTag = `<audio src='${ref.ankiFilename}' controls></audio>`;
      } else if (ref.type === 'video') {
        htmlTag = `<video src='${ref.ankiFilename}' controls></video>`;
      } else {
        // Default to image tag
        htmlTag = `<img src='${ref.ankiFilename}'>`;
      }
      
      // Replace all instances
      const regex = new RegExp(escapedOriginal, 'g');
      result = result.replace(regex, htmlTag);
    }

    return result;
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
