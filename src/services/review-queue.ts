import { FlashlyCard } from '../models/card';
import { StorageService } from './storage-service';
import { State } from 'ts-fsrs';

export interface QueueBuildOptions {
	decks?: string[];
	limitDue?: number;
	limitNew?: number;
	includeLearning?: boolean;
	now?: Date;
	excludeEmptyAnswers?: boolean;
}

export interface QueueSnapshot {
	due: FlashlyCard[];
	new: FlashlyCard[];
	remainingDue: number;
	remainingNew: number;
	generatedAt: Date;
	totalDue: number;
	totalNew: number;
}

const DEFAULT_LIMIT_DUE = 100;
const DEFAULT_LIMIT_NEW = 20;

/**
 * Builds review queues for study sessions using stored cards.
 */
export class ReviewQueueService {
	constructor(private storage: StorageService) {}

	build(options: QueueBuildOptions = {}): QueueSnapshot {
		const {
			decks,
			limitDue = DEFAULT_LIMIT_DUE,
			limitNew = DEFAULT_LIMIT_NEW,
			includeLearning = true,
			now,
			excludeEmptyAnswers = true
		} = options;

		const current = now ?? new Date();
		const cards = this.filterCards(this.storage.getAllCards(), {
			decks,
			includeLearning,
			excludeEmptyAnswers
		});

		const dueCards = this.sortDue(cards.filter(card => this.isDue(card, current)));
		const newCards = this.sortNew(cards.filter(card => this.isNew(card)));

		if (limitDue < 0 || limitNew < 0) {
			throw new Error('Queue limits must be non-negative.');
		}

		const dueSelection = dueCards.slice(0, limitDue);
		const newSelection = newCards.slice(0, limitNew);

		return {
			due: dueSelection,
			new: newSelection,
			remainingDue: Math.max(0, dueCards.length - dueSelection.length),
			remainingNew: Math.max(0, newCards.length - newSelection.length),
			generatedAt: current,
			totalDue: dueCards.length,
			totalNew: newCards.length
		};
	}

	private filterCards(
		cards: FlashlyCard[],
		options: { decks?: string[]; includeLearning: boolean; excludeEmptyAnswers: boolean }
	): FlashlyCard[] {
		const deckSet = options.decks ? new Set(options.decks.map(d => d.toLowerCase())) : null;

		return cards.filter(card => {
			if (options.excludeEmptyAnswers && card.needsFilling) {
				return false;
			}

			if (deckSet && !deckSet.has(card.deck.toLowerCase())) {
				return false;
			}

			if (!options.includeLearning && card.fsrsCard.state === State.Learning) {
				return false;
			}

			return true;
		});
	}

	private isNew(card: FlashlyCard): boolean {
		return card.fsrsCard.state === State.New;
	}

	private isDue(card: FlashlyCard, current: Date): boolean {
		if (!card.fsrsCard?.due) {
			return false;
		}

		if (this.isNew(card)) {
			return false;
		}

		// Check if card is due by end of current day (not just current moment)
		// This matches the "due today" count shown in the UI
		const endOfToday = new Date(current);
		endOfToday.setHours(23, 59, 59, 999);

		return card.fsrsCard.due.getTime() <= endOfToday.getTime();
	}

	private sortDue(cards: FlashlyCard[]): FlashlyCard[] {
		return [...cards].sort((a, b) => {
			const dueDiff = a.fsrsCard.due.getTime() - b.fsrsCard.due.getTime();
			if (dueDiff !== 0) {
				return dueDiff;
			}
			return a.updated.getTime() - b.updated.getTime();
		});
	}

	private sortNew(cards: FlashlyCard[]): FlashlyCard[] {
		return [...cards].sort((a, b) => a.created.getTime() - b.created.getTime());
	}
}
