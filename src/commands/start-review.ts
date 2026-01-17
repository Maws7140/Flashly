import { App, Notice } from 'obsidian';
import { ReviewQueueService } from '../services/review-queue';
import { StorageService } from '../services/storage-service';
import { FSRSScheduler } from '../scheduler/fsrs-scheduler';
import { SM2Scheduler } from '../scheduler/sm2-scheduler';
import { SchedulerStrategy } from '../scheduler/scheduler-types';
import { ReviewSessionViewModel } from '../viewmodels/review-session-viewmodel';
import { ReviewModal } from '../ui/review-modal';
import { DeckSelectModal } from '../ui/deck-select-modal';
import { FlashlySettings, SchedulerType } from '../settings';
import type FlashlyPlugin from '../../main';

export class StartReviewCommand {
	constructor(
		private app: App,
		private storage: StorageService,
		private queueService: ReviewQueueService,
		private getSettings: () => FlashlySettings,
		private plugin?: FlashlyPlugin
	) {}

	getId(): string {
		return 'start-review';
	}

	getName(): string {
		return 'Start review session';
	}

	getCallback(): () => Promise<void> {
		return () => this.startReview();
	}

	private createScheduler(type: SchedulerType): SchedulerStrategy {
		if (type === 'sm2') {
			return new SM2Scheduler();
		}
		return new FSRSScheduler();
	}

	async startReview(preselectedDecks?: string[]): Promise<void> {
		const settings = this.getSettings();
		const scheduler = this.createScheduler(settings.review.scheduler);
		const deckSelection = await this.resolveDeckSelection(settings, preselectedDecks ?? undefined);

		if (deckSelection === null) {
			new Notice('Review cancelled.');
			return;
		}

		const snapshot = this.queueService.build({
			decks: deckSelection ?? undefined,
			limitDue: settings.review.limits.reviewPerDay,
			limitNew: settings.review.limits.newPerDay,
			includeLearning: settings.review.includeLearningCards,
			excludeEmptyAnswers: settings.review.excludeEmptyCards
		});

		if (snapshot.due.length === 0 && snapshot.new.length === 0) {
			new Notice('No flashcards are due or new. Great job staying on track!');
			return;
		}

		const viewModel = new ReviewSessionViewModel({
			storage: this.storage,
			scheduler,
			queueSnapshot: snapshot
		});

		const modal = new ReviewModal(this.app, viewModel, {
			enableKeyboardShortcuts: settings.review.enableKeyboardShortcuts,
			audioAutoPlay: settings.review.audioAutoPlay,
			audioStopOnFlip: settings.review.audioStopOnFlip,
			onComplete: (summary) => {
				this.storage.recordReviewSession(summary);
				void this.storage.save();
				// Refresh browser views to show updated card stats
				if (this.plugin) {
					this.plugin.refreshBrowserViews();
				}
			}
		});

		modal.open();
	}

	private async resolveDeckSelection(
		settings: FlashlySettings,
		preselectedDecks?: string[]
	): Promise<string[] | undefined | null> {
		if (preselectedDecks && preselectedDecks.length > 0) {
			return preselectedDecks;
		}

		if (settings.review.deckFilter.length > 0) {
			return settings.review.deckFilter;
		}

		const deckNames = this.storage.getDeckNames().sort((a, b) => a.localeCompare(b));

		if (deckNames.length === 0) {
			return undefined;
		}

		if (deckNames.length === 1) {
			return [deckNames[0]];
		}

		return new Promise<string[] | undefined | null>((resolve) => {
			const modal = new DeckSelectModal(this.app, deckNames, (selection) => resolve(selection));
			modal.open();
		});
	}
}
