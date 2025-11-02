/**
 * Base interfaces and types for export functionality
 */

import { FlashlyCard } from '../../models/card';

/**
 * Supported export formats
 */
export type ExportFormat = 
	| 'anki'         // Anki .apkg format
	| 'csv'          // Generic CSV with all fields
	| 'csv-quizlet'  // Quizlet-compatible CSV
	| 'json'         // JSON format
	| 'markdown';    // Markdown format

/**
 * Base export options
 */
export interface ExportOptions {
	format: ExportFormat;
	selectedDecks?: string[];
	selectedTags?: string[];
	dateRange?: {
		start: Date;
		end: Date;
	};
	includeScheduling: boolean;
	includeTags: boolean;
	includeMedia: boolean;
	ankiDeckPrefix?: string;
	ankiConvertMarkdown?: boolean;
	ankiPlainTextMode?: boolean;
}

/**
 * Anki-specific export options
 */
export interface AnkiExportOptions extends ExportOptions {
	format: 'anki';
	deckName: string;
	convertMarkdown: boolean;
	clozeNoteType: string;
	basicNoteType: string;
}

/**
 * CSV-specific export options
 */
export interface CSVExportOptions extends ExportOptions {
	format: 'csv' | 'csv-quizlet';
	delimiter: ',' | ';' | '\t';
	includeHeaders: boolean;
	includeBOM: boolean; // UTF-8 BOM for Excel compatibility
}

/**
 * Export result information
 */
export interface ExportResult {
	success: boolean;
	filePath?: string;
	cardCount: number;
	error?: string;
	timestamp: Date;
}

/**
 * Preview data for UI
 */
export interface PreviewData {
	cards: FlashlyCard[];
	totalCount: number;
	previewCount: number;
}

/**
 * Export history entry
 */
export interface ExportHistoryEntry {
	id: string;
	timestamp: Date;
	format: ExportFormat;
	cardCount: number;
	filePath: string;
	success: boolean;
}

/**
 * SM-2 scheduling data for Anki
 */
export interface SM2Data {
	interval: number;      // Days until next review
	repetitions: number;   // Number of successful reviews
	easeFactor: number;    // Ease multiplier (2.5 default)
}

/**
 * Media reference extracted from Markdown
 */
export interface MediaReference {
	type: 'image' | 'audio' | 'video';
	path: string;
	alt?: string;
}

/**
 * Base transformer interface
 * Transforms FlashlyCard[] to format-specific data structure
 */
export interface ExportTransformer<T> {
	/**
	 * Transform cards to target format
	 */
	transform(cards: FlashlyCard[], options: ExportOptions): T;
	
	/**
	 * Validate transformed data
	 */
	validate(data: T): boolean;
}
