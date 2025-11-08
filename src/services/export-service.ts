/**
 * Export Service - Core orchestration for export functionality
 */

import { App, Notice } from 'obsidian';
import { StorageService } from './storage-service';
import { FlashlyCard } from '../models/card';
import { FlashlySettings } from '../settings';
import {
	ExportOptions,
	ExportResult,
	PreviewData,
	ExportHistoryEntry,
	ExportFormat,
	CSVExportOptions
} from './export-transformers/base-transformer';
import { CSVExporter } from '../exporters/csv-exporter';
import { AnkiExporter } from '../exporters/anki-exporter';
import { JSONExporter } from '../exporters/json-exporter';
import { MarkdownExporter } from '../exporters/markdown-exporter';

export class ExportService {
	private exportHistory: ExportHistoryEntry[] = [];

	constructor(
		private app: App,
		private storage: StorageService,
		private settings: () => FlashlySettings
	) {}

	/**
	 * Main export function
	 */
	async export(options: ExportOptions): Promise<ExportResult> {
		const startTime = Date.now();
		
		try {
			// Step 1: Filter cards based on options
			const cards = this.filterCards(options);
			
			if (cards.length === 0) {
				return {
					success: false,
					error: 'No cards match the export criteria',
					cardCount: 0,
					timestamp: new Date()
				};
			}

			// Step 2: Export based on format
			let filePath: string;
			switch (options.format) {
				case 'csv':
				case 'csv-quizlet':
					filePath = await this.exportCSV(cards, options);
					break;
				case 'anki':
					filePath = await this.exportAnki(cards, options);
					break;
				case 'json':
					filePath = await this.exportJSON(cards, options);
					break;
				case 'markdown':
					filePath = await this.exportMarkdown(cards, options);
					break;
				default:
					throw new Error(`Unsupported export format: ${options.format}`);
			}

			// Step 3: Record success
			const duration = Date.now() - startTime;
			const result: ExportResult = {
				success: true,
				filePath,
				cardCount: cards.length,
				timestamp: new Date()
			};

			this.recordExport(result, options.format);
			
			new Notice(`✅ Exported ${cards.length} cards in ${duration}ms`);
			return result;

		} catch (error) {
			console.error('Export failed:', error);
			new Notice(`❌ Export failed: ${error.message}`);
			
			return {
				success: false,
				error: error.message,
				cardCount: 0,
				timestamp: new Date()
			};
		}
	}

	/**
	 * Filter cards based on export options
	 */
	private filterCards(options: ExportOptions): FlashlyCard[] {
		let cards = this.storage.getAllCards();

		// Filter by deck
		if (options.selectedDecks && options.selectedDecks.length > 0) {
			cards = cards.filter(card => 
				options.selectedDecks!.includes(card.deck)
			);
		}

		// Filter by tags
		if (options.selectedTags && options.selectedTags.length > 0) {
			cards = cards.filter(card =>
				card.tags.some(tag => options.selectedTags!.includes(tag))
			);
		}

		// Filter by date range
		if (options.dateRange) {
			cards = cards.filter(card => {
				const cardDate = new Date(card.created);
				return cardDate >= options.dateRange!.start && 
					cardDate <= options.dateRange!.end;
			});
		}

		return cards;
	}

	/**
	 * Export as CSV (placeholder - will implement in Phase 1)
	 */
	private async exportCSV(
		cards: FlashlyCard[],
		options: ExportOptions
	): Promise<string> {
		const exporter = new CSVExporter();
		
		// Build CSV export options
		const csvOptions: CSVExportOptions = {
			...options,
			format: options.format as 'csv' | 'csv-quizlet',
			delimiter: this.settings().export.csvDelimiter,
			includeHeaders: true,
			includeBOM: this.settings().export.csvIncludeBOM
		};

		// Generate CSV content (no longer async)
		const csvContent = exporter.export(cards, csvOptions);

		// Determine filename
		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const formatName = options.format === 'csv-quizlet' ? 'quizlet' : 'flashcards';
		const filename = `flashly-export-${formatName}-${timestamp}.csv`;

		// Save file to vault
		const filePath = await this.saveFile(filename, csvContent);
		return filePath;
	}

	/**
	 * Export as Anki-compatible CSV
	 */
	private async exportAnki(
		cards: FlashlyCard[],
		options: ExportOptions
	): Promise<string> {
		const exporter = new AnkiExporter();
		
		// Add Anki-specific options from settings
		options.ankiDeckPrefix = this.settings().export.ankiDeckPrefix;
		options.ankiConvertMarkdown = this.settings().export.ankiConvertMarkdown;
		options.ankiPlainTextMode = this.settings().export.ankiPlainTextMode;

		// Generate Anki CSV
		const ankiCSV = exporter.export(cards, options);

		// Determine filename
		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const filename = `flashly-export-anki-${timestamp}.txt`;

		// Save file to vault
		const filePath = await this.saveFile(filename, ankiCSV);
		return filePath;
	}

	/**
	 * Export as JSON
	 */
	private async exportJSON(
		cards: FlashlyCard[],
		options: ExportOptions
	): Promise<string> {
		const exporter = new JSONExporter();
		
		// Generate JSON content
		const jsonContent = exporter.export(cards, options);

		// Determine filename
		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const filename = `flashly-export-${timestamp}.json`;

		// Save file to vault
		const filePath = await this.saveFile(filename, jsonContent);
		return filePath;
	}

	/**
	 * Export as Markdown
	 */
	private async exportMarkdown(
		cards: FlashlyCard[],
		options: ExportOptions
	): Promise<string> {
		const exporter = new MarkdownExporter();
		
		// Export as combined markdown
		const markdownContent = exporter.exportCombined(cards, options);

		// Determine filename
		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const filename = `flashly-export-${timestamp}.md`;

		// Save file to vault
		const filePath = await this.saveFile(filename, markdownContent);
		return filePath;
	}

	/**
	 * Generate preview of cards to be exported
	 */
	preview(options: ExportOptions, limit = 10): PreviewData {
		const cards = this.filterCards(options);
		const previewCards = cards.slice(0, limit);

		return {
			cards: previewCards,
			totalCount: cards.length,
			previewCount: previewCards.length
		};
	}

	/**
	 * Get all unique deck names
	 */
	getAvailableDecks(): string[] {
		return this.storage.getDeckNames();
	}

	/**
	 * Get all unique tags
	 */
	getAvailableTags(): string[] {
		const tags = new Set<string>();
		const cards = this.storage.getAllCards();
		
		for (const card of cards) {
			for (const tag of card.tags) {
				tags.add(tag);
			}
		}
		
		return Array.from(tags).sort();
	}

	/**
	 * Get export history
	 */
	getExportHistory(): ExportHistoryEntry[] {
		return [...this.exportHistory];
	}

	/**
	 * Record export in history
	 */
	private recordExport(result: ExportResult, format: ExportFormat): void {
		if (result.success && result.filePath) {
			this.exportHistory.unshift({
				id: `${Date.now()}-${Math.random()}`,
				timestamp: result.timestamp,
				format,
				cardCount: result.cardCount,
				filePath: result.filePath,
				success: true
			});

			// Keep only last 20 entries
			if (this.exportHistory.length > 20) {
				this.exportHistory = this.exportHistory.slice(0, 20);
			}
		}
	}

	/**
	 * Save file to vault
	 */
	private async saveFile(filename: string, content: string): Promise<string> {
		const { vault } = this.app;
		
		// Create exports folder if it doesn't exist
		const exportFolder = 'flashly-exports';
		try {
			await vault.adapter.mkdir(exportFolder);
		} catch {
			// Folder might already exist, ignore error
		}

		// Generate full path
		const filePath = `${exportFolder}/${filename}`;

		// Write file
		await vault.adapter.write(filePath, content);

		return filePath;
	}

	/**
	 * Save binary file to vault
	 */
	private async saveFileBinary(filename: string, content: Uint8Array): Promise<string> {
		const { vault } = this.app;
		
		// Create exports folder if it doesn't exist
		const exportFolder = 'flashly-exports';
		try {
			await vault.adapter.mkdir(exportFolder);
		} catch {
			// Folder might already exist, ignore error
		}

		// Generate full path
		const filePath = `${exportFolder}/${filename}`;

		// Write binary file - create a new ArrayBuffer to ensure correct type
		const arrayBuffer = new ArrayBuffer(content.byteLength);
		const view = new Uint8Array(arrayBuffer);
		view.set(content);
		await vault.adapter.writeBinary(filePath, arrayBuffer);

		return filePath;
	}
}
