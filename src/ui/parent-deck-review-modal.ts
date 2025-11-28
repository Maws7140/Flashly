import { App, Modal } from 'obsidian';
import { DeckInfo } from '../viewmodels/browser-viewmodel';

export type ParentDeckReviewChoice = 'all' | 'direct' | 'cancel';

/**
 * Modal for choosing how to review a parent deck
 * Allows user to choose between reviewing all cards (including children) or just direct cards
 */
export class ParentDeckReviewModal extends Modal {
	private choice: ParentDeckReviewChoice = 'cancel';

	constructor(
		app: App,
		private deck: DeckInfo,
		private onChoose: (choice: ParentDeckReviewChoice) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('flashly-parent-deck-modal');

		contentEl.createEl('h2', { text: `Review "${this.deck.name}"?` });

		const description = contentEl.createEl('p', {
			text: `This deck has ${this.deck.childCount} sub-deck${this.deck.childCount !== 1 ? 's' : ''}. How would you like to review?`,
		});

		const stats = contentEl.createDiv({ cls: 'review-choice-stats' });
		stats.createEl('p', {
			text: `Direct cards: ${this.deck.totalCards} total, ${this.deck.dueToday} due`,
		});
		stats.createEl('p', {
			text: `Including sub-decks: ${this.deck.totalCardsIncludingChildren} total, ${this.deck.dueTodayIncludingChildren} due`,
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		// All cards button
		const allBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: `Review all (${this.deck.dueTodayIncludingChildren} due)`,
		});
		allBtn.addEventListener('click', () => {
			this.choice = 'all';
			this.close();
		});

		// Direct only button
		const directBtn = buttonContainer.createEl('button', {
			text: `Review direct only (${this.deck.dueToday} due)`,
		});

		// Disable if parent deck has no direct cards
		if (this.deck.totalCards === 0) {
			directBtn.disabled = true;
			directBtn.title = 'This deck has no direct cards, only cards in sub-decks';
		}

		directBtn.addEventListener('click', () => {
			this.choice = 'direct';
			this.close();
		});

		// Cancel button
		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
		});
		cancelBtn.addEventListener('click', () => {
			this.choice = 'cancel';
			this.close();
		});
	}

	onClose(): void {
		this.onChoose(this.choice);
		this.contentEl.empty();
	}
}
