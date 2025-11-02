/**
 * CSV Transformer - Converts FlashlyCard[] to CSV format
 */

import { FlashlyCard } from '../../models/card';
import { ExportTransformer, ExportOptions, CSVExportOptions } from './base-transformer';
import { getCardStateLabel } from '../../models/card';

export interface CSVRow {
	Front: string;
	Back: string;
	Deck: string;
	Tags: string;
	State?: string;
	Created?: string;
	Updated?: string;
	Due?: string;
	Interval?: number;
	EaseFactor?: number;
	SourceFile?: string;
	SourceLine?: number;
}

export class CSVTransformer implements ExportTransformer<CSVRow[]> {
	transform(cards: FlashlyCard[], options: ExportOptions): CSVRow[] {
		const csvOptions = options as CSVExportOptions;
		const rows: CSVRow[] = [];

		for (const card of cards) {
			const row: CSVRow = {
				Front: this.cleanText(card.front),
				Back: this.cleanText(card.back),
				Deck: card.deck,
				Tags: options.includeTags ? card.tags.join(',') : ''
			};

			// Add scheduling data if requested
			if (options.includeScheduling && card.fsrsCard) {
				row.State = getCardStateLabel(card.fsrsCard.state);
				row.Due = card.fsrsCard.due ? card.fsrsCard.due.toISOString() : '';
				row.Interval = card.fsrsCard.scheduled_days || 0;
				row.EaseFactor = card.fsrsCard.difficulty || 2.5;
			}

			// Add metadata
			row.Created = card.created.toISOString();
			row.Updated = card.updated.toISOString();
			row.SourceFile = card.source.file;
			row.SourceLine = card.source.line;

			rows.push(row);
		}

		return rows;
	}

	validate(data: CSVRow[]): boolean {
		if (!Array.isArray(data)) {
			return false;
		}

		if (data.length === 0) {
			return true; // Empty is valid
		}

		// Check first row has required fields
		const firstRow = data[0];
		return (
			typeof firstRow.Front === 'string' &&
			typeof firstRow.Back === 'string' &&
			typeof firstRow.Deck === 'string'
		);
	}

	/**
	 * Clean text for CSV export
	 * - Strip markdown formatting
	 * - Handle newlines
	 * - Remove special characters that might break CSV
	 */
	private cleanText(text: string): string {
		return text
			.replace(/\r\n/g, ' ')  // Replace CRLF with space
			.replace(/\n/g, ' ')     // Replace LF with space
			.trim();
	}
}

/**
 * Quizlet-specific CSV transformer (simplified 2-column format)
 */
export class QuizletCSVTransformer implements ExportTransformer<{ term: string; definition: string }[]> {
	transform(
		cards: FlashlyCard[],
		options: ExportOptions
	): { term: string; definition: string }[] {
		return cards.map(card => ({
			term: this.stripMarkdown(card.front),
			definition: this.stripMarkdown(card.back)
		}));
	}

	validate(data: { term: string; definition: string }[]): boolean {
		if (!Array.isArray(data)) {
			return false;
		}

		if (data.length === 0) {
			return true;
		}

		const firstRow = data[0];
		return (
			typeof firstRow.term === 'string' &&
			typeof firstRow.definition === 'string'
		);
	}

	/**
	 * Strip Markdown formatting for plain text
	 */
	private stripMarkdown(text: string): string {
		return text
			// Remove headers
			.replace(/^#{1,6}\s+/gm, '')
			// Remove bold
			.replace(/\*\*(.*?)\*\*/g, '$1')
			// Remove italic
			.replace(/\*(.*?)\*/g, '$1')
			// Remove links [text](url)
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			// Remove code blocks
			.replace(/```[\s\S]*?```/g, '')
			// Remove inline code
			.replace(/`([^`]+)`/g, '$1')
			// Remove images
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
			// Replace newlines with spaces
			.replace(/\r\n/g, ' ')
			.replace(/\n/g, ' ')
			.trim();
	}
}
