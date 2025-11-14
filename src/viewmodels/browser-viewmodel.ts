import { FlashlyCard } from '../models/card';
import { State } from 'ts-fsrs';

export type SortOption =
  | 'created-asc'
  | 'created-desc'
  | 'updated-asc'
  | 'updated-desc'
  | 'due-asc'
  | 'due-desc'
  | 'deck-asc'
  | 'deck-desc';

export interface FilterState {
  decks?: string[];
  tags?: string[];
  status?: State[];
  query?: string;
}

export interface BrowserStatistics {
  totalCards: number;
  cardsDueToday: number;
  deckCount: number;
}

export enum BrowserViewMode {
  DECK_LIST = 'deck-list',
  CARD_VIEW = 'card-view',
}

export interface BrowserViewState {
  mode: BrowserViewMode;
  selectedDeck: string | null;
  currentCardIndex: number;
  showingAnswer: boolean;
}

export interface DeckInfo {
  name: string;
  totalCards: number;
  dueToday: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  relearnCards: number;
  lastStudied: Date | null;
}

/**
 * ViewModel for the Flashcard Browser view.
 * Handles all business logic for filtering, sorting, searching, and statistics.
 * Separates data operations from UI rendering for testability.
 */
export class BrowserViewModel {
  private cards: FlashlyCard[] = [];
  private filters: FilterState = {};
  private sortBy: SortOption = 'due-asc';
  private searchQuery = '';
  private viewState: BrowserViewState = {
    mode: BrowserViewMode.DECK_LIST,
    selectedDeck: null,
    currentCardIndex: 0,
    showingAnswer: false,
  };

  constructor(cards: FlashlyCard[] = [], defaultSort?: SortOption) {
    this.cards = cards;
    if (defaultSort) {
      this.sortBy = defaultSort;
    }
  }

  /**
   * Update the complete card collection
   */
  setCards(cards: FlashlyCard[]): void {
    this.cards = cards;
  }

  /**
   * Set filter criteria
   */
  setFilter(filters: FilterState): void {
    this.filters = filters;
  }

  /**
   * Set search query
   */
  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  /**
   * Set sorting option
   */
  setSortBy(sortBy: SortOption): void {
    this.sortBy = sortBy;
  }

  /**
   * Get current sorting option
   */
  getSortBy(): SortOption {
    return this.sortBy;
  }

  /**
   * Clear all filters and search
   */
  clearFilters(): void {
    this.filters = {};
    this.searchQuery = '';
  }

  /**
   * Get filtered and sorted cards
   */
  getFilteredCards(): FlashlyCard[] {
    let result = [...this.cards];

    // Apply search query
    if (this.searchQuery) {
      const lowerQuery = this.searchQuery.toLowerCase();
      result = result.filter(
        (card) =>
          card.front.toLowerCase().includes(lowerQuery) ||
          card.back.toLowerCase().includes(lowerQuery)
      );
    }

    // Apply deck filter (OR logic within decks)
    if (this.filters.decks && this.filters.decks.length > 0) {
      result = result.filter((card) => (this.filters.decks ?? []).includes(card.deck));
    }

    // Apply tag filter (OR logic within tags)
    if (this.filters.tags && this.filters.tags.length > 0) {
      result = result.filter((card) =>
        (this.filters.tags ?? []).some((tag) => card.tags.includes(tag))
      );
    }

    // Apply status filter (OR logic within statuses)
    if (this.filters.status && this.filters.status.length > 0) {
      result = result.filter((card) =>
        (this.filters.status ?? []).includes(card.fsrsCard.state)
      );
    }

    // Apply sorting
    result = this.applySorting(result);

    return result;
  }

  /**
   * Apply sorting to cards
   */
  private applySorting(cards: FlashlyCard[]): FlashlyCard[] {
    const sorted = [...cards];

    switch (this.sortBy) {
      case 'created-asc':
        sorted.sort((a, b) => a.created.getTime() - b.created.getTime());
        break;
      case 'created-desc':
        sorted.sort((a, b) => b.created.getTime() - a.created.getTime());
        break;
      case 'updated-asc':
        sorted.sort((a, b) => a.updated.getTime() - b.updated.getTime());
        break;
      case 'updated-desc':
        sorted.sort((a, b) => b.updated.getTime() - a.updated.getTime());
        break;
      case 'due-asc':
        sorted.sort(
          (a, b) => a.fsrsCard.due.getTime() - b.fsrsCard.due.getTime()
        );
        break;
      case 'due-desc':
        sorted.sort(
          (a, b) => b.fsrsCard.due.getTime() - a.fsrsCard.due.getTime()
        );
        break;
      case 'deck-asc':
        sorted.sort((a, b) => a.deck.localeCompare(b.deck));
        break;
      case 'deck-desc':
        sorted.sort((a, b) => b.deck.localeCompare(a.deck));
        break;
    }

    return sorted;
  }

  /**
   * Get statistics about the card collection
   */
  getStatistics(): BrowserStatistics {
    const totalCards = this.cards.length;
    const deckCount = this.getAvailableDecks().length;

    // Calculate cards due today (due date <= end of today)
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const cardsDueToday = this.cards.filter(
      (card) => card.fsrsCard.due.getTime() <= endOfToday.getTime()
    ).length;

    return {
      totalCards,
      cardsDueToday,
      deckCount,
    };
  }

  /**
   * Get cards grouped by deck
   */
  getCardsGroupedByDeck(): Map<string, FlashlyCard[]> {
    const grouped = new Map<string, FlashlyCard[]>();

    for (const card of this.cards) {
      if (!grouped.has(card.deck)) {
        grouped.set(card.deck, []);
      }
      const deckCards = grouped.get(card.deck);
      if (deckCards) {
        deckCards.push(card);
      }
    }

    return grouped;
  }

  /**
   * Get list of all unique decks
   */
  getAvailableDecks(): string[] {
    const decks = new Set<string>();
    for (const card of this.cards) {
      decks.add(card.deck);
    }
    return Array.from(decks).sort();
  }

  /**
   * Get list of all unique tags
   */
  getAvailableTags(): string[] {
    const tags = new Set<string>();
    for (const card of this.cards) {
      for (const tag of card.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  // ====== Deck Navigation Methods ======

  /**
   * Get current view state
   */
  getViewState(): BrowserViewState {
    return { ...this.viewState };
  }

  /**
   * Get list of all decks with statistics
   */
  getDeckList(): DeckInfo[] {
    const deckMap = new Map<string, FlashlyCard[]>();

    // Group cards by deck
    for (const card of this.cards) {
      if (!deckMap.has(card.deck)) {
        deckMap.set(card.deck, []);
      }
      const deckCards = deckMap.get(card.deck);
      if (deckCards) {
        deckCards.push(card);
      }
    }

    // Calculate statistics for each deck
    const deckList: DeckInfo[] = [];
    for (const [deckName, deckCards] of deckMap.entries()) {
      deckList.push({
        name: deckName,
        totalCards: deckCards.length,
        dueToday: this.countDueToday(deckCards),
        newCards: deckCards.filter((c) => c.fsrsCard.state === State.New).length,
        learningCards: deckCards.filter((c) => c.fsrsCard.state === State.Learning).length,
        reviewCards: deckCards.filter((c) => c.fsrsCard.state === State.Review).length,
        relearnCards: deckCards.filter((c) => c.fsrsCard.state === State.Relearning).length,
        lastStudied: this.getLastStudiedDate(deckCards),
      });
    }

    return deckList;
  }

  /**
   * Select a deck and enter card view mode
   */
  selectDeck(deckName: string): void {
    this.viewState.selectedDeck = deckName;
    this.viewState.mode = BrowserViewMode.CARD_VIEW;
    this.viewState.currentCardIndex = 0;
    this.viewState.showingAnswer = false;
  }

  /**
   * Get cards in the currently selected deck (sorted)
   */
  getCardsInSelectedDeck(): FlashlyCard[] {
    if (!this.viewState.selectedDeck) return [];
    const deckCards = this.cards.filter((c) => c.deck === this.viewState.selectedDeck);
    return this.applySorting(deckCards);
  }

  /**
   * Get the current card being viewed
   */
  getCurrentCard(): FlashlyCard | null {
    const deckCards = this.getCardsInSelectedDeck();
    if (deckCards.length === 0) return null;
    if (this.viewState.currentCardIndex >= deckCards.length) return null;
    return deckCards[this.viewState.currentCardIndex];
  }

  /**
   * Navigate to the next card in the deck
   */
  goToNextCard(): void {
    const deckCards = this.getCardsInSelectedDeck();
    if (this.viewState.currentCardIndex < deckCards.length - 1) {
      this.viewState.currentCardIndex++;
      this.viewState.showingAnswer = false;
    }
  }

  /**
   * Navigate to the previous card in the deck
   */
  goToPreviousCard(): void {
    if (this.viewState.currentCardIndex > 0) {
      this.viewState.currentCardIndex--;
      this.viewState.showingAnswer = false;
    }
  }

  /**
   * Flip the current card (toggle between question and answer)
   */
  flipCard(): void {
    this.viewState.showingAnswer = !this.viewState.showingAnswer;
  }

  /**
   * Return to deck list view
   */
  backToDeckList(): void {
    this.viewState.mode = BrowserViewMode.DECK_LIST;
    this.viewState.selectedDeck = null;
    this.viewState.currentCardIndex = 0;
    this.viewState.showingAnswer = false;
  }

  // ====== Helper Methods ======

  /**
   * Count cards due today in a set of cards
   */
  private countDueToday(cards: FlashlyCard[]): number {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return cards.filter((c) => c.fsrsCard.due.getTime() <= endOfToday.getTime()).length;
  }

  /**
   * Get the last studied date from a set of cards
   */
  private getLastStudiedDate(cards: FlashlyCard[]): Date | null {
    const reviewed = cards.filter((c) => c.fsrsCard.last_review);
    if (reviewed.length === 0) return null;

    return reviewed.reduce((latest, card) => {
      const lastReview = card.fsrsCard.last_review;
      if (!lastReview) return latest;
      const cardDate = new Date(lastReview);
      return cardDate > latest ? cardDate : latest;
    }, new Date(0));
  }
}
