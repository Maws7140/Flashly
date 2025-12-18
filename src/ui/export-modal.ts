/**
 * Export Modal - UI for configuring and executing exports
 */

import { App, Modal, Setting, ToggleComponent, Notice } from 'obsidian';
import { ExportService } from '../services/export-service';
import { ExportOptions, ExportFormat } from '../services/export-transformers/base-transformer';
import { AnkiConnectService } from '../services/anki-connect';
import { FlashlySettings } from '../settings';

export class ExportModal extends Modal {
	private format: ExportFormat = 'csv';
	private selectedDecks: string[] = [];
	private includeScheduling = true;
	private includeTags = true;
	private includeMedia = false;

	constructor(
		app: App,
		private exportService: ExportService,
		private settings: FlashlySettings
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Export flashcards' });

		// AnkiConnect info box (if enabled)
		if (this.settings.export.ankiConnectEnabled) {
			const infoBox = contentEl.createDiv({ cls: 'flashly-info-box' });
			infoBox.createEl('p', {
				text: '💡 AnkiConnect is enabled! Use the "Sync to Anki" button below to send cards directly to Anki (requires Anki running with AnkiConnect plugin). Or use "Export" to save as a file.'
			});
		}

		// Format selection
		new Setting(contentEl)
			.setName('Export format')
			.setDesc('Choose the format for exported flashcards')
			.addDropdown(dropdown => {
			dropdown
				.addOption('csv', 'CSV (generic)')
				.addOption('csv-quizlet', 'CSV (quizlet format)')
				.addOption('anki', 'Anki (CSV file)')
					.addOption('json', 'JSON')
					.addOption('markdown', 'Markdown')
					.setValue(this.format)
					.onChange(value => {
						this.format = value as ExportFormat;
					});
			});

		// Deck selection
		const decks = this.exportService.getAvailableDecks();
		const deckContainer = contentEl.createDiv({ cls: 'export-deck-selection' });
		deckContainer.createEl('h3', { text: 'Select decks' });
		
		// Add search input
		const searchContainer = deckContainer.createDiv({ cls: 'export-deck-search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search decks...',
			cls: 'export-deck-search-input'
		});

		// Select all / Deselect all buttons
		const buttonContainer = deckContainer.createDiv({ cls: 'export-button-group' });
		const selectAllBtn = buttonContainer.createEl('button', { text: 'Select all' });
		const deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect all' });

		// Deck checkboxes - store references for filtering
		const toggles: ToggleComponent[] = [];
		const deckItems: Array<{ element: HTMLElement, name: string, toggle: ToggleComponent }> = [];
		
		decks.forEach(deck => {
			const setting = new Setting(deckContainer);
			setting.setName(deck);
			const settingEl = setting.settingEl;
			
			setting.addToggle(toggle => {
				toggles.push(toggle);
				
				toggle
					.setValue(true)
					.onChange(value => {
						if (value) {
							if (!this.selectedDecks.includes(deck)) {
								this.selectedDecks.push(deck);
							}
						} else {
							this.selectedDecks = this.selectedDecks.filter(d => d !== deck);
						}
					});
				
				// Start with all selected
				this.selectedDecks.push(deck);
				
				// Store reference for filtering (inside callback where toggle is available)
				deckItems.push({ element: settingEl, name: deck, toggle });
			});
		});

		// Search functionality
		searchInput.addEventListener('input', () => {
			const searchTerm = searchInput.value.toLowerCase();

			deckItems.forEach(item => {
				const matches = item.name.toLowerCase().includes(searchTerm);
				item.element.toggleClass('hidden', !matches);
			});

			// Update no results message
			const visibleItems = deckItems.filter(item => !item.element.hasClass('hidden'));
			let noResultsMsg = deckContainer.querySelector('.export-deck-no-results') as HTMLElement;

			if (visibleItems.length === 0 && searchTerm) {
				if (!noResultsMsg) {
					noResultsMsg = deckContainer.createDiv({
						text: 'No decks found',
						cls: 'export-deck-no-results'
					});
				}
				noResultsMsg.removeClass('hidden');
			} else if (noResultsMsg) {
				noResultsMsg.addClass('hidden');
			}
		});

		// Update Select all / Deselect all to work with visible decks only
		selectAllBtn.onclick = () => {
			const visibleItems = deckItems.filter(item => !item.element.hasClass('hidden'));
			visibleItems.forEach(item => {
				if (!this.selectedDecks.includes(item.name)) {
					this.selectedDecks.push(item.name);
				}
				void item.toggle.setValue(true);
			});
		};
		
		deselectAllBtn.onclick = () => {
			const visibleItems = deckItems.filter(item => !item.element.hasClass('hidden'));
			visibleItems.forEach(item => {
				this.selectedDecks = this.selectedDecks.filter(d => d !== item.name);
				void item.toggle.setValue(false);
			});
		};

		// Export options
		contentEl.createEl('h3', { text: 'Export options' });

		new Setting(contentEl)
			.setName('Include tags')
			.setDesc('Include card tags in export')
			.addToggle(toggle => toggle
				.setValue(this.includeTags)
				.onChange(value => this.includeTags = value)
			);

	new Setting(contentEl)
		.setName('Include scheduling data')
		.setDesc('Include scheduling information (due dates, review history)')
		.addToggle(toggle => toggle
				.setValue(this.includeScheduling)
				.onChange(value => this.includeScheduling = value)
			);

		new Setting(contentEl)
			.setName('Include media')
			.setDesc('Upload images and audio to Anki via AnkiConnect')
			.addToggle(toggle => toggle
				.setValue(this.includeMedia)
				.onChange(value => this.includeMedia = value)
			);

		// Action buttons
		const buttonRow = contentEl.createDiv({ cls: 'export-action-buttons' });

		// Preview button
		const previewBtn = buttonRow.createEl('button', { text: 'Preview' });
		previewBtn.onclick = () => this.preview();

		// Export button
		const exportBtn = buttonRow.createEl('button', {
			text: 'Export',
			cls: 'mod-cta'
		});
		exportBtn.onclick = () => void this.export();

		// Sync to Anki button (only if AnkiConnect is enabled)
		if (this.settings.export.ankiConnectEnabled) {
			const syncBtn = buttonRow.createEl('button', {
				text: 'Sync to Anki',
				cls: 'mod-cta'
			});
			syncBtn.onclick = () => void this.syncToAnki();
		}

		// Cancel button
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
	}

	preview() {
		const options: ExportOptions = {
			format: this.format,
			selectedDecks: this.selectedDecks,
			includeScheduling: this.includeScheduling,
			includeTags: this.includeTags,
			includeMedia: this.includeMedia
		};

		const preview = this.exportService.preview(options, 10);
		
		new Notice(
			`Preview: ${preview.previewCount} of ${preview.totalCount} cards will be exported`
		);
	}

	async export(): Promise<void> {
		if (this.selectedDecks.length === 0) {
			new Notice('Please select at least one deck to export');
			return;
		}

		const options: ExportOptions = {
			format: this.format,
			selectedDecks: this.selectedDecks,
			includeScheduling: this.includeScheduling,
			includeTags: this.includeTags,
			includeMedia: this.includeMedia
		};

		new Notice('Starting export...');
		this.close();

		const result = await this.exportService.export(options);

		if (result.success) {
			new Notice(`✅ exported ${result.cardCount} cards to ${result.filePath}`);
		} else {
			new Notice(`❌ export failed: ${result.error}`);
		}
	}

	async syncToAnki(): Promise<void> {
		if (this.selectedDecks.length === 0) {
			new Notice('Please select at least one deck to sync');
			return;
		}

		const options: ExportOptions = {
			format: 'anki',
			selectedDecks: this.selectedDecks,
			includeScheduling: this.includeScheduling,
			includeTags: this.includeTags,
			includeMedia: this.includeMedia,
			ankiDeckPrefix: this.settings.export.ankiDeckPrefix,
			ankiConvertMarkdown: this.settings.export.ankiConvertMarkdown,
			ankiPlainTextMode: this.settings.export.ankiPlainTextMode,
			ankiAttachmentFolder: this.settings.export.ankiAttachmentFolder,
			ankiExcalidrawFolder: this.settings.export.ankiExcalidrawFolder
		};

		// Get cards to sync
		const preview = this.exportService.preview(options, 999999);
		if (preview.totalCount === 0) {
			new Notice('No cards to sync');
			return;
		}

		// Test connection first
		const service = new AnkiConnectService(this.settings.export.ankiConnectUrl, this.app);
		const connected = await service.testConnection();

		if (!connected) {
			new Notice('❌ Failed to connect to AnkiConnect. Make sure Anki is running with AnkiConnect plugin installed.');
			return;
		}

		new Notice(`Syncing ${preview.totalCount} cards to Anki...`);
		this.close();

		try {
			const results = await service.syncCards(
				preview.cards,
				options,
				this.app.vault  // Pass vault for media upload
			);

			// Enhanced success message with media stats
			let message = `✅ Synced to Anki: ${results.success} cards`;

			if (results.mediaUploaded > 0) {
				message += `, ${results.mediaUploaded} media files`;
			}

			if (results.skipped > 0) {
				message += ` (${results.skipped} duplicates skipped)`;
			}

			if (results.mediaFailed > 0) {
				message += `\n⚠️ ${results.mediaFailed} media files failed`;
			}

			if (results.failed > 0) {
				message += `\n❌ ${results.failed} cards failed`;
			}

			new Notice(message, results.errors.length > 0 ? 10000 : 5000);

			// Show detailed errors if any
			if (results.errors.length > 0) {
				console.error('Sync errors:', results.errors);
			}
		} catch (error) {
			console.error('Failed to sync to Anki:', error);
			new Notice(`❌ Sync failed: ${error.message}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
