import { App, Modal, Notice, MarkdownRenderer, Component } from 'obsidian';
import { Rating } from 'ts-fsrs';
import { SupportedRating } from '../scheduler/scheduler-types';
import { ReviewSessionViewModel, SessionSummary } from '../viewmodels/review-session-viewmodel';

interface ReviewModalOptions {
	enableKeyboardShortcuts: boolean;
	onComplete?: (summary: SessionSummary) => void;
}

const RATING_ORDER: SupportedRating[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export class ReviewModal extends Modal {
	private cardContainer!: HTMLElement;
	private cardInner!: HTMLElement;
	private frontEl!: HTMLElement;
	private backEl!: HTMLElement;
	private progressEl!: HTMLElement;
	private readonly ratingButtons = new Map<SupportedRating, HTMLButtonElement>();
	private readonly boundKeydown: (event: KeyboardEvent) => void;
	private component: Component | null = null;
	private isAnimating = false;
	private currentCardId: string | null = null;

	constructor(
		app: App,
		private readonly viewModel: ReviewSessionViewModel,
		private readonly options: ReviewModalOptions
	) {
		super(app);
		this.boundKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
	}

	onOpen(): void {
		if (this.viewModel.isComplete()) {
			new Notice('No cards available for review.');
			this.close();
			return;
		}

		this.component = new Component();
		this.component.load();

		this.buildLayout();
		this.render();

		if (this.options.enableKeyboardShortcuts) {
			window.addEventListener('keydown', this.boundKeydown);
		}
	}

	onClose(): void {
		if (this.component) {
			this.component.unload();
			this.component = null;
		}
		this.contentEl.empty();
		if (this.options.enableKeyboardShortcuts) {
			window.removeEventListener('keydown', this.boundKeydown);
		}
	}

	private buildLayout(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('flashly-review-modal');

		const title = contentEl.createEl('h2', { text: 'Flashly review session' });
		title.addClass('flashly-review-title');

		// Create 3D flip structure
		this.cardContainer = contentEl.createDiv({ cls: 'flashly-card-container' });
		this.cardInner = this.cardContainer.createDiv({ cls: 'flashly-card-inner' });
		
		// Front face (question) - clickable
		const frontFace = this.cardInner.createDiv({ cls: 'flashly-card-face flashly-card-front flashly-card-clickable' });
		this.frontEl = frontFace.createDiv({ cls: 'flashly-card-content' });
		frontFace.addEventListener('click', (e) => {
			// Only flip if clicking the card face itself, not when scrolling
			if (e.target === frontFace || frontFace.contains(e.target as Node)) {
				this.toggleWithAnimation();
			}
		});
		
		// Back face (answer) - clickable
		const backFace = this.cardInner.createDiv({ cls: 'flashly-card-face flashly-card-back flashly-card-clickable' });
		this.backEl = backFace.createDiv({ cls: 'flashly-card-content' });
		backFace.addEventListener('click', (e) => {
			// Only flip if clicking the card face itself, not when scrolling
			if (e.target === backFace || backFace.contains(e.target as Node)) {
				this.toggleWithAnimation();
			}
		});

		const ratingsContainer = contentEl.createDiv({ cls: 'flashly-rating-container' });
		RATING_ORDER.forEach((rating) => {
			const button = ratingsContainer.createEl('button', {
				text: '...',
				cls: 'flashly-rating-btn'
			});
			button.addEventListener('click', () => {
				void this.handleRating(rating);
			});
			this.ratingButtons.set(rating, button);
		});

		this.progressEl = contentEl.createDiv({ cls: 'flashly-session-progress' });
	}

	private render(): void {
		if (this.viewModel.isComplete()) {
			this.renderSummary();
			this.options.onComplete?.(this.viewModel.getSummary());
			return;
		}

		this.renderCard();
		this.renderRatings();
		this.renderProgress();
	}

	private renderCard(): void {
		const current = this.viewModel.getCurrentCard();
		if (!current) {
			return;
		}

		const showingAnswer = this.viewModel.getProgress().showingAnswer;
		const isNewCard = this.currentCardId !== current.card.id;

		// When switching to a new card, instantly reset to front without animation
		if (isNewCard && !showingAnswer) {
			// Disable transitions temporarily
			this.cardInner.addClass('no-transition');
			this.cardInner.removeClass('flipped');
			// Force browser to apply the change
			void this.cardInner.offsetHeight;
			// Re-enable transitions
			this.cardInner.removeClass('no-transition');
			this.currentCardId = current.card.id;
		} else {
			// Normal flip animation for same card
			this.cardInner.toggleClass('flipped', showingAnswer);
			if (isNewCard) {
				this.currentCardId = current.card.id;
			}
		}

		// Clean up old component and create fresh one for this render
		if (this.component) {
			this.component.unload();
		}
		this.component = new Component();
		this.component.load();

		// Clear previous content
		this.frontEl.empty();
		this.backEl.empty();

		// Render markdown with full support for code blocks, images, etc.
		if (this.component) {
			void MarkdownRenderer.render(
				this.app,
				current.card.front,
				this.frontEl,
				current.card.source.file,
				this.component
			);

			void MarkdownRenderer.render(
				this.app,
				current.card.back,
				this.backEl,
				current.card.source.file,
				this.component
			);
		}
	}

	private renderRatings(): void {
		const preview = this.viewModel.getCurrentPreview();
		if (!preview) {
			return;
		}

		RATING_ORDER.forEach((rating) => {
			const info = preview[rating];
			const button = this.ratingButtons.get(rating);
			if (!info || !button) {
				return;
			}

			const intervalLabel = this.formatInterval(info.intervalDays);
			button.setText(`${info.label} - ${intervalLabel}`);
			button.setAttr('data-rating', info.label.toLowerCase());
		});
	}

	private renderProgress(): void {
		const progress = this.viewModel.getProgress();
		const snapshot = this.viewModel.getQueueSnapshot();

		const dueRemaining = Math.max(snapshot.totalDue - this.countCompletedOfType('due'), 0);
		const newRemaining = Math.max(snapshot.totalNew - this.countCompletedOfType('new'), 0);

		this.progressEl.setText(
			`${progress.completed}/${progress.totalCards} reviewed - ${dueRemaining} due remaining - ${newRemaining} new remaining`
		);
	}

	private countCompletedOfType(type: 'due' | 'new'): number {
		return this.viewModel.getCompleted().filter(item => item.type === type).length;
	}

	private async handleRating(rating: SupportedRating): Promise<void> {
		if (this.viewModel.isComplete()) {
			return;
		}

		await this.viewModel.rateCard(rating);
		this.render();
	}

	private handleKeydown(evt: KeyboardEvent): void {
		if (evt.defaultPrevented) {
			return;
		}

		switch (evt.key) {
			case ' ':
				evt.preventDefault();
				this.toggleWithAnimation();
				break;
			case '1':
				evt.preventDefault();
				void this.handleRating(Rating.Again);
				break;
			case '2':
				evt.preventDefault();
				void this.handleRating(Rating.Hard);
				break;
			case '3':
				evt.preventDefault();
				void this.handleRating(Rating.Good);
				break;
			case '4':
				evt.preventDefault();
				void this.handleRating(Rating.Easy);
				break;
			case 'Escape':
				evt.preventDefault();
				this.close();
				break;
		}
	}

	private renderSummary(): void {
		const summary = this.viewModel.getSummary();
		const { contentEl } = this;
		contentEl.empty();

		const container = contentEl.createDiv({ cls: 'flashly-summary-container' });
		container.createEl('h2', { text: 'Review session complete!' });
		container.createEl('p', {
			text: `Reviewed ${summary.totalReviewed} card${summary.totalReviewed === 1 ? '' : 's'}.`
		});

		const list = container.createEl('ul');
		list.createEl('li', { text: `${summary.reviewedDue} due cards` });
		list.createEl('li', { text: `${summary.reviewedNew} new cards` });

		const closeBtn = container.createEl('button', {
			text: 'Close',
			cls: 'mod-cta'
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	private toggleWithAnimation(): void {
		if (this.isAnimating) {
			return; // Prevent multiple simultaneous animations
		}

		this.isAnimating = true;

		// Add will-change for GPU acceleration
		this.cardInner.addClass('animating');

		// Toggle the answer state
		this.viewModel.toggleAnswer();
		this.renderCard();

		// Remove will-change after animation completes to free GPU memory
		setTimeout(() => {
			this.cardInner.removeClass('animating');
			this.isAnimating = false;
		}, 400); // Match CSS transition duration
	}

	private formatInterval(intervalDays: number): string {
		if (intervalDays < 1) {
			const minutes = Math.round(intervalDays * 24 * 60);
			if (minutes < 60) {
				return `${minutes} minute${minutes === 1 ? '' : 's'}`;
			}
			const hours = Math.round(intervalDays * 24);
			return `${hours} hour${hours === 1 ? '' : 's'}`;
		}

		if (intervalDays < 7) {
			const days = Math.round(intervalDays);
			return `${days} day${days === 1 ? '' : 's'}`;
		}

		const weeks = Math.round(intervalDays / 7);
		return `${weeks} week${weeks === 1 ? '' : 's'}`;
	}
}
