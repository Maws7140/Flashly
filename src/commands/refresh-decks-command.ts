import { App, Notice } from 'obsidian';
import { StorageService } from '../services/storage-service';
import { FlashlySettings } from '../settings';
import { DeckSelectModal } from '../ui/deck-select-modal';
import { State } from 'ts-fsrs';
import type FlashlyPlugin from '../../main';

export class RefreshDecksCommand {
	constructor(
		private readonly app: App,
		private readonly storage: StorageService,
		private readonly getSettings: () => FlashlySettings,
		private readonly plugin?: FlashlyPlugin
	) {}

	getId(): string {
		return 'refresh-decks';
	}

	getName(): string {
		return 'Force decks ready for review';
	}

	getCallback(): () => Promise<void> {
		return () => this.refreshDecks();
	}

	async refreshDecks(preselectedDecks?: string[]): Promise<void> {
		const settings = this.getSettings();
		const selection = await this.resolveDeckSelection(settings, preselectedDecks);

		if (selection === null) {
			new Notice('Refresh cancelled.');
			return;
		}

		const deckSet = selection ? new Set(selection.map(deck => deck.toLowerCase())) : null;
		const cards = this.storage.getAllCards();
		const now = new Date();
		let updatedCount = 0;

		for (const card of cards) {
			if (deckSet && !deckSet.has(card.deck.toLowerCase())) {
				continue;
			}

			const { fsrsCard } = card;

			const updatedFsrs = {
				...fsrsCard,
				due: new Date(now.getTime() - 60 * 1000),
				state: fsrsCard.state === State.New ? State.Review : fsrsCard.state
			};

			this.storage.updateCard(card.id, { fsrsCard: updatedFsrs });
			updatedCount++;
		}

		if (updatedCount === 0) {
			new Notice('No matching cards found to refresh.');
			return;
		}

		await this.storage.save();

		// Refresh browser views to show updated cards
		if (this.plugin) {
			this.plugin.refreshBrowserViews();
		}

		new Notice(`Forced ${updatedCount} card${updatedCount === 1 ? '' : 's'} ready for review.`);
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
			const modal = new DeckSelectModal(this.app, deckNames, resolve);
			modal.open();
		});
	}
}
