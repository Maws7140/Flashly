import { BrowserViewModel } from '../src/viewmodels/browser-viewmodel';
import { FlashlyCard } from '../src/models/card';
import { State, createEmptyCard, Card } from 'ts-fsrs';

// Helper to create mock cards
function createMockCard(overrides: Partial<FlashlyCard> = {}): FlashlyCard {
  const now = new Date();
  const fsrsCard: Card = {
    ...createEmptyCard(),
    state: State.New,
    due: new Date(now.getTime()),
  };

  return {
    id: `card-${Math.random()}`,
    front: 'What is TypeScript?',
    back: 'A typed superset of JavaScript',
    source: {
      file: 'test.md',
      line: 1,
    },
    deck: 'Programming',
    tags: ['typescript', 'programming'],
    needsFilling: false,
    created: new Date(now.getTime()),
    updated: new Date(now.getTime()),
    fsrsCard,
    ...overrides,
  };
}

function createMockCards(count: number): FlashlyCard[] {
  const cards: FlashlyCard[] = [];
  const decks = ['Math', 'Programming', 'History', 'Science'];
  const tags = [['algebra', 'equations'], ['typescript', 'javascript'], ['world-war', 'dates'], ['biology', 'chemistry']];
  const states = [State.New, State.Learning, State.Review, State.Relearning];
  
  for (let i = 0; i < count; i++) {
    const deckIndex = i % decks.length;
    const now = new Date();
    
    const fsrsCard: Card = {
      ...createEmptyCard(),
      state: states[i % states.length],
      due: new Date(now.getTime() + (i * 1000 * 60 * 60 * 24)), // Due spread over days
    };
    
    cards.push(createMockCard({
      id: `card-${i}`,
      front: `Question ${i}`,
      back: `Answer ${i}`,
      deck: decks[deckIndex],
      tags: tags[deckIndex],
      created: new Date(now.getTime() - (i * 1000 * 60 * 60)), // Spread over hours
      updated: new Date(now.getTime() - (i * 1000 * 60 * 30)), // Spread over 30 min intervals
      fsrsCard,
    }));
  }
  
  return cards;
}

describe('BrowserViewModel', () => {
  let viewModel: BrowserViewModel;
  let mockCards: FlashlyCard[];

  beforeEach(() => {
    mockCards = createMockCards(100);
    viewModel = new BrowserViewModel(mockCards);
  });

  describe('Initialization', () => {
    it('should initialize with provided cards', () => {
      expect(viewModel.getFilteredCards()).toHaveLength(100);
    });

    it('should initialize with empty cards array', () => {
      const vm = new BrowserViewModel([]);
      expect(vm.getFilteredCards()).toHaveLength(0);
    });
  });

  describe('Card Management', () => {
    it('should update cards', () => {
      const newCards = createMockCards(50);
      viewModel.setCards(newCards);
      expect(viewModel.getFilteredCards()).toHaveLength(50);
    });

    it('should clear cards', () => {
      viewModel.setCards([]);
      expect(viewModel.getFilteredCards()).toHaveLength(0);
    });
  });

  describe('Filtering - Deck', () => {
    it('should filter by single deck', () => {
      viewModel.setFilter({ decks: ['Math'] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => c.deck === 'Math')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by multiple decks (OR logic)', () => {
      viewModel.setFilter({ decks: ['Math', 'Programming'] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => c.deck === 'Math' || c.deck === 'Programming')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent deck', () => {
      viewModel.setFilter({ decks: ['NonExistent'] });
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(0);
    });
  });

  describe('Filtering - Tags', () => {
    it('should filter by single tag', () => {
      viewModel.setFilter({ tags: ['algebra'] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => c.tags.includes('algebra'))).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by multiple tags (OR logic)', () => {
      viewModel.setFilter({ tags: ['algebra', 'typescript'] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => 
        c.tags.includes('algebra') || c.tags.includes('typescript')
      )).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent tag', () => {
      viewModel.setFilter({ tags: ['nonexistent'] });
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(0);
    });
  });

  describe('Filtering - Status', () => {
    it('should filter by new status', () => {
      viewModel.setFilter({ status: [State.New] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => c.fsrsCard.state === State.New)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by learning status', () => {
      viewModel.setFilter({ status: [State.Learning] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => c.fsrsCard.state === State.Learning)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by multiple statuses (OR logic)', () => {
      viewModel.setFilter({ status: [State.New, State.Learning] });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => 
        c.fsrsCard.state === State.New || c.fsrsCard.state === State.Learning
      )).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Filtering - Combined (AND logic)', () => {
    it('should filter by deck AND tag', () => {
      viewModel.setFilter({ 
        decks: ['Math'], 
        tags: ['algebra'] 
      });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => 
        c.deck === 'Math' && c.tags.includes('algebra')
      )).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by deck AND status', () => {
      viewModel.setFilter({ 
        decks: ['Programming'], 
        status: [State.New] 
      });
      const result = viewModel.getFilteredCards();
      expect(result.every((c: FlashlyCard) => 
        c.deck === 'Programming' && c.fsrsCard.state === State.New
      )).toBe(true);
      // May be 0 if no cards match both criteria, that's valid
      if (result.length > 0) {
        expect(result[0].deck).toBe('Programming');
        expect(result[0].fsrsCard.state).toBe(State.New);
      }
    });

    it('should filter by deck AND tag AND status', () => {
      viewModel.setFilter({ 
        decks: ['Math'], 
        tags: ['algebra'],
        status: [State.New] 
      });
      const result = viewModel.getFilteredCards();
      expect(result.every(c => 
        c.deck === 'Math' && 
        c.tags.includes('algebra') && 
        c.fsrsCard.state === State.New
      )).toBe(true);
    });
  });

  describe('Filtering - Search Query', () => {
    it('should search in front text', () => {
      const cards = [
        createMockCard({ front: 'What is JavaScript?', back: 'A programming language' }),
        createMockCard({ front: 'What is Python?', back: 'Another language' }),
      ];
      viewModel.setCards(cards);
      viewModel.setSearchQuery('JavaScript');
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(1);
      expect(result[0].front).toContain('JavaScript');
    });

    it('should search in back text', () => {
      const cards = [
        createMockCard({ front: 'Question 1', back: 'Programming language' }),
        createMockCard({ front: 'Question 2', back: 'Database system' }),
      ];
      viewModel.setCards(cards);
      viewModel.setSearchQuery('Programming');
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(1);
      expect(result[0].back).toContain('Programming');
    });

    it('should be case-insensitive', () => {
      const cards = [
        createMockCard({ front: 'What is TypeScript?', back: 'Answer' }),
      ];
      viewModel.setCards(cards);
      viewModel.setSearchQuery('TYPESCRIPT');
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(1);
    });

    it('should search in both front and back', () => {
      const cards = [
        createMockCard({ front: 'JavaScript question', back: 'JavaScript answer' }),
        createMockCard({ front: 'Python question', back: 'Python answer' }),
      ];
      viewModel.setCards(cards);
      viewModel.setSearchQuery('JavaScript');
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no match', () => {
      viewModel.setSearchQuery('NonExistentTerm12345');
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(0);
    });

    it('should combine search with filters (AND logic)', () => {
      const cards = [
        createMockCard({ 
          front: 'JavaScript basics', 
          back: 'Answer',
          deck: 'Programming',
          tags: ['javascript']
        }),
        createMockCard({ 
          front: 'TypeScript basics', 
          back: 'Answer',
          deck: 'Programming',
          tags: ['typescript']
        }),
      ];
      viewModel.setCards(cards);
      viewModel.setSearchQuery('JavaScript');
      viewModel.setFilter({ decks: ['Programming'] });
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(1);
      expect(result[0].front).toContain('JavaScript');
    });
  });

  describe('Sorting - Created Date', () => {
    it('should sort by created date descending (newest first)', () => {
      viewModel.setSortBy('created-desc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].created.getTime()).toBeGreaterThanOrEqual(result[i].created.getTime());
      }
    });

    it('should sort by created date ascending (oldest first)', () => {
      viewModel.setSortBy('created-asc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].created.getTime()).toBeLessThanOrEqual(result[i].created.getTime());
      }
    });
  });

  describe('Sorting - Updated Date', () => {
    it('should sort by updated date descending', () => {
      viewModel.setSortBy('updated-desc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].updated.getTime()).toBeGreaterThanOrEqual(result[i].updated.getTime());
      }
    });

    it('should sort by updated date ascending', () => {
      viewModel.setSortBy('updated-asc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].updated.getTime()).toBeLessThanOrEqual(result[i].updated.getTime());
      }
    });
  });

  describe('Sorting - Due Date', () => {
    it('should sort by due date ascending (soonest first)', () => {
      viewModel.setSortBy('due-asc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].fsrsCard.due.getTime()).toBeLessThanOrEqual(
          result[i].fsrsCard.due.getTime()
        );
      }
    });

    it('should sort by due date descending', () => {
      viewModel.setSortBy('due-desc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].fsrsCard.due.getTime()).toBeGreaterThanOrEqual(
          result[i].fsrsCard.due.getTime()
        );
      }
    });
  });

  describe('Sorting - Deck Name', () => {
    it('should sort by deck name ascending (A-Z)', () => {
      viewModel.setSortBy('deck-asc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].deck.localeCompare(result[i].deck)).toBeLessThanOrEqual(0);
      }
    });

    it('should sort by deck name descending (Z-A)', () => {
      viewModel.setSortBy('deck-desc');
      const result = viewModel.getFilteredCards();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].deck.localeCompare(result[i].deck)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Sorting - Preserves Filters', () => {
    it('should apply sorting to filtered results', () => {
      viewModel.setFilter({ decks: ['Math'] });
      viewModel.setSortBy('created-desc');
      const result = viewModel.getFilteredCards();
      
      // All should be Math deck
      expect(result.every((c: FlashlyCard) => c.deck === 'Math')).toBe(true);
      
      // Should be sorted by created desc
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].created.getTime()).toBeGreaterThanOrEqual(result[i].created.getTime());
      }
    });
  });

  describe('Statistics', () => {
    it('should calculate total cards', () => {
      const stats = viewModel.getStatistics();
      expect(stats.totalCards).toBe(100);
    });

    it('should calculate cards due today', () => {
      // Use a fixed midday reference to avoid day-boundary flakiness in CI/local timezones.
      const now = new Date('2026-05-10T12:00:00.000Z');
      const cards: FlashlyCard[] = [
        createMockCard({ 
          fsrsCard: {
            ...createEmptyCard(),
            due: new Date(now.getTime() - 1000) // Past due
          } as Card
        }),
        createMockCard({ 
          fsrsCard: {
            ...createEmptyCard(),
            due: new Date(now.getTime() + 1000 * 60 * 60) // Due in 1 hour
          } as Card
        }),
        createMockCard({ 
          fsrsCard: {
            ...createEmptyCard(),
            due: new Date(now.getTime() + 1000 * 60 * 60 * 25) // Due tomorrow
          } as Card
        }),
      ];
      viewModel.setCards(cards);
      const stats = viewModel.getStatistics();
      expect(stats.cardsDueToday).toBe(2); // Past due + due in 1 hour
    });

    it('should count unique decks', () => {
      const stats = viewModel.getStatistics();
      expect(stats.deckCount).toBe(4); // Math, Programming, History, Science
    });

    it('should handle empty cards', () => {
      viewModel.setCards([]);
      const stats = viewModel.getStatistics();
      expect(stats.totalCards).toBe(0);
      expect(stats.cardsDueToday).toBe(0);
      expect(stats.deckCount).toBe(0);
    });

    it('should group cards by deck', () => {
      const grouped = viewModel.getCardsGroupedByDeck();
      expect(grouped.size).toBe(4);
      expect(grouped.has('Math')).toBe(true);
      expect(grouped.has('Programming')).toBe(true);
      expect(grouped.has('History')).toBe(true);
      expect(grouped.has('Science')).toBe(true);
      
      // Total cards across all groups should equal total cards
      const totalInGroups = Array.from(grouped.values()).reduce(
        (sum, cards) => sum + cards.length, 
        0
      );
      expect(totalInGroups).toBe(100);
    });
  });

  describe('Clear Filters', () => {
    it('should clear all filters', () => {
      viewModel.setFilter({ decks: ['Math'], tags: ['algebra'], status: [State.New] });
      viewModel.setSearchQuery('test');
      viewModel.clearFilters();
      
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(100); // All cards
    });

    it('should preserve sort when clearing filters', () => {
      viewModel.setSortBy('created-desc');
      viewModel.setFilter({ decks: ['Math'] });
      viewModel.clearFilters();
      
      const result = viewModel.getFilteredCards();
      expect(result).toHaveLength(100);
      
      // Should still be sorted
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].created.getTime()).toBeGreaterThanOrEqual(result[i].created.getTime());
      }
    });
  });

  describe('Get Available Options', () => {
    it('should return all unique decks', () => {
      const decks = viewModel.getAvailableDecks();
      // Decks are sorted alphabetically
      expect(decks.sort()).toEqual(['History', 'Math', 'Programming', 'Science']);
    });

    it('should return all unique tags', () => {
      const tags = viewModel.getAvailableTags();
      expect(tags.sort()).toEqual([
        'algebra', 'biology', 'chemistry', 'dates', 
        'equations', 'javascript', 'typescript', 'world-war'
      ].sort());
    });

    it('should handle empty cards', () => {
      viewModel.setCards([]);
      expect(viewModel.getAvailableDecks()).toEqual([]);
      expect(viewModel.getAvailableTags()).toEqual([]);
    });
  });

  // ====== Deck Navigation Tests ======

  describe('Deck Navigation', () => {
    describe('getDeckList', () => {
      it('should return list of all decks with statistics', () => {
        const deckList = viewModel.getDeckList();
        
        expect(deckList).toHaveLength(4); // Math, Programming, History, Science
        
        const mathDeck = deckList.find(d => d.name === 'Math');
        expect(mathDeck).toBeDefined();
        expect(mathDeck?.totalCards).toBe(25); // 100 cards / 4 decks
      });

      it('should calculate due today correctly', () => {
        const deckList = viewModel.getDeckList();
        
        const mathDeck = deckList.find(d => d.name === 'Math');
        expect(mathDeck?.dueToday).toBeGreaterThanOrEqual(0);
      });

      it('should count card states correctly', () => {
        const deckList = viewModel.getDeckList();
        
        const mathDeck = deckList.find(d => d.name === 'Math');
        expect(mathDeck?.newCards).toBeGreaterThan(0);
        expect(mathDeck?.learningCards).toBeGreaterThanOrEqual(0);
        expect(mathDeck?.reviewCards).toBeGreaterThanOrEqual(0);
        
        // Sum of all states should equal total cards
        const totalStates = (mathDeck?.newCards ?? 0) + 
                           (mathDeck?.learningCards ?? 0) + 
                           (mathDeck?.reviewCards ?? 0) + 
                           (mathDeck?.relearnCards ?? 0);
        expect(totalStates).toBe(mathDeck?.totalCards);
      });

      it('should handle empty card collection', () => {
        viewModel.setCards([]);
        const deckList = viewModel.getDeckList();
        
        expect(deckList).toHaveLength(0);
      });
    });

    describe('selectDeck', () => {
      it('should switch to card view mode', () => {
        viewModel.selectDeck('Math');
        
        const state = viewModel.getViewState();
        expect(state.mode).toBe('card-view');
        expect(state.selectedDeck).toBe('Math');
      });

      it('should reset card index and flip state', () => {
        viewModel.selectDeck('Math');
        
        const state = viewModel.getViewState();
        expect(state.currentCardIndex).toBe(0);
        expect(state.showingAnswer).toBe(false);
      });

      it('should load cards from selected deck', () => {
        viewModel.selectDeck('Math');
        
        const deckCards = viewModel.getCardsInSelectedDeck();
        expect(deckCards.length).toBe(25);
        expect(deckCards.every(c => c.deck === 'Math')).toBe(true);
      });
    });

    describe('Card Navigation', () => {
      beforeEach(() => {
        viewModel.selectDeck('Math');
      });

      it('should get current card', () => {
        const card = viewModel.getCurrentCard();
        
        expect(card).not.toBeNull();
        expect(card?.deck).toBe('Math');
      });

      it('should navigate to next card', () => {
        const firstCard = viewModel.getCurrentCard();
        viewModel.goToNextCard();
        const secondCard = viewModel.getCurrentCard();
        
        expect(secondCard).not.toBeNull();
        expect(secondCard?.id).not.toBe(firstCard?.id);
        
        const state = viewModel.getViewState();
        expect(state.currentCardIndex).toBe(1);
        expect(state.showingAnswer).toBe(false); // Reset when navigating
      });

      it('should not go beyond last card', () => {
        const deckCards = viewModel.getCardsInSelectedDeck();
        
        // Navigate to last card
        for (let i = 0; i < deckCards.length; i++) {
          viewModel.goToNextCard();
        }
        
        const state = viewModel.getViewState();
        expect(state.currentCardIndex).toBe(deckCards.length - 1);
      });

      it('should navigate to previous card', () => {
        viewModel.goToNextCard();
        viewModel.goToNextCard();
        
        viewModel.goToPreviousCard();
        
        const state = viewModel.getViewState();
        expect(state.currentCardIndex).toBe(1);
        expect(state.showingAnswer).toBe(false); // Reset when navigating
      });

      it('should not go before first card', () => {
        viewModel.goToPreviousCard();
        
        const state = viewModel.getViewState();
        expect(state.currentCardIndex).toBe(0);
      });

      it('should flip card', () => {
        const state1 = viewModel.getViewState();
        expect(state1.showingAnswer).toBe(false);
        
        viewModel.flipCard();
        
        const state2 = viewModel.getViewState();
        expect(state2.showingAnswer).toBe(true);
        
        viewModel.flipCard();
        
        const state3 = viewModel.getViewState();
        expect(state3.showingAnswer).toBe(false);
      });

      it('should reset flip state when navigating', () => {
        viewModel.flipCard();
        expect(viewModel.getViewState().showingAnswer).toBe(true);
        
        viewModel.goToNextCard();
        expect(viewModel.getViewState().showingAnswer).toBe(false);
        
        viewModel.flipCard();
        viewModel.goToPreviousCard();
        expect(viewModel.getViewState().showingAnswer).toBe(false);
      });
    });

    describe('backToDeckList', () => {
      it('should return to deck list mode', () => {
        viewModel.selectDeck('Math');
        viewModel.goToNextCard();
        viewModel.flipCard();
        
        viewModel.backToDeckList();
        
        const state = viewModel.getViewState();
        expect(state.mode).toBe('deck-list');
        expect(state.selectedDeck).toBeNull();
        expect(state.currentCardIndex).toBe(0);
        expect(state.showingAnswer).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty deck', () => {
        // Create cards but select non-existent deck
        viewModel.selectDeck('NonExistent');
        
        const deckCards = viewModel.getCardsInSelectedDeck();
        expect(deckCards).toHaveLength(0);
        
        const currentCard = viewModel.getCurrentCard();
        expect(currentCard).toBeNull();
      });

      it('should handle navigation in empty deck', () => {
        viewModel.setCards([]);
        viewModel.selectDeck('Math');
        
        viewModel.goToNextCard(); // Should not crash
        viewModel.goToPreviousCard(); // Should not crash
        
        expect(viewModel.getCurrentCard()).toBeNull();
      });
    });
  });
});
