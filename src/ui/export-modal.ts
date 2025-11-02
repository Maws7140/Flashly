/**
 * Export Modal - UI for configuring and executing exports
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { ExportService } from '../services/export-service';
import { ExportOptions, ExportFormat } from '../services/export-transformers/base-transformer';

export class ExportModal extends Modal {
	private format: ExportFormat = 'csv';
	private selectedDecks: string[] = [];
	private includeScheduling = true;
	private includeTags = true;
	private includeMedia = false;

	constructor(
		app: App,
		private exportService: ExportService
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Export Flashcards' });

		// Format selection
		new Setting(contentEl)
			.setName('Export Format')
			.setDesc('Choose the format for exported flashcards')
			.addDropdown(dropdown => {
				dropdown
					.addOption('csv', 'CSV (Generic)')
					.addOption('csv-quizlet', 'CSV (Quizlet)')
					.addOption('anki', 'Anki (.apkg)')
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
		deckContainer.createEl('h3', { text: 'Select Decks' });
		
		// Select All / Deselect All buttons
		const buttonContainer = deckContainer.createDiv({ cls: 'export-button-group' });
		const selectAllBtn = buttonContainer.createEl('button', { text: 'Select All' });
		const deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect All' });
		
		selectAllBtn.onclick = () => {
			this.selectedDecks = [...decks];
			checkboxes.forEach(cb => cb.checked = true);
		};
		
		deselectAllBtn.onclick = () => {
			this.selectedDecks = [];
			checkboxes.forEach(cb => cb.checked = false);
		};

		// Deck checkboxes
		const checkboxes: HTMLInputElement[] = [];
		decks.forEach(deck => {
			const setting = new Setting(deckContainer)
				.setName(deck)
				.addToggle(toggle => {
					const checkbox = toggle.toggleEl.querySelector('input') as HTMLInputElement;
					checkboxes.push(checkbox);
					
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
				});
		});

		// Export options
		contentEl.createEl('h3', { text: 'Export Options' });

		new Setting(contentEl)
			.setName('Include Tags')
			.setDesc('Include card tags in export')
			.addToggle(toggle => toggle
				.setValue(this.includeTags)
				.onChange(value => this.includeTags = value)
			);

		new Setting(contentEl)
			.setName('Include Scheduling Data')
			.setDesc('Include FSRS scheduling information (review intervals, due dates)')
			.addToggle(toggle => toggle
				.setValue(this.includeScheduling)
				.onChange(value => this.includeScheduling = value)
			);

		new Setting(contentEl)
			.setName('Include Media')
			.setDesc('Include images and audio (Anki only)')
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
		exportBtn.onclick = () => this.export();
		
		// Cancel button
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
	}

	async preview() {
		const options: ExportOptions = {
			format: this.format,
			selectedDecks: this.selectedDecks,
			includeScheduling: this.includeScheduling,
			includeTags: this.includeTags,
			includeMedia: this.includeMedia
		};

		const preview = await this.exportService.preview(options, 10);
		
		new Notice(
			`Preview: ${preview.previewCount} of ${preview.totalCount} cards will be exported`
		);
	}

	async export() {
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
			new Notice(`✅ Exported ${result.cardCount} cards to ${result.filePath}`);
		} else {
			new Notice(`❌ Export failed: ${result.error}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
