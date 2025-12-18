/**
 * Export Command - Allows users to export flashcards to various formats
 */

import { App, Notice } from 'obsidian';
import { ExportService } from '../services/export-service';
import { ExportModal } from '../ui/export-modal';
import { FlashlySettings } from '../settings';

export class ExportCommand {
	private id = 'export-flashcards';
	private name = 'Export flashcards';

	constructor(
		private app: App,
		private exportService: ExportService,
		private settings: () => FlashlySettings
	) {}

	getId(): string {
		return this.id;
	}

	getName(): string {
		return this.name;
	}

	getCallback() {
		return () => {
			// Check if there are any cards to export
			const decks = this.exportService.getAvailableDecks();
			
			if (decks.length === 0) {
				new Notice('No flashcards found to export. Scan your vault first.');
				return;
			}

			// Open export modal
			const modal = new ExportModal(this.app, this.exportService, this.settings());
			modal.open();
		};
	}
}
