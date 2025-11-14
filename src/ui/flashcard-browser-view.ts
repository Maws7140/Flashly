import { ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownRenderer, Component, Modal, App, TFile } from 'obsidian';
import { BrowserViewModel, BrowserViewMode, DeckInfo, SortOption } from '../viewmodels/browser-viewmodel';
import { FlashlyCard } from '../models/card';
import type FlashlyPlugin from '../../main';

export const FLASHCARD_BROWSER_VIEW_TYPE = 'flashcard-browser-view';

type DeckSortOption = 'name-asc' | 'name-desc' | 'cards-desc' | 'due-desc' | 'studied-desc';

interface ObsidianApp extends App {
  commands: {
    executeCommandById(commandId: string): void;
  };
}

export class FlashcardBrowserView extends ItemView {
  private viewModel: BrowserViewModel;
  private plugin: FlashlyPlugin;
  private deckSearchQuery = '';
  private deckSortBy: DeckSortOption = 'name-asc';
  private component: Component = new Component();
  private isAnimating = false;
  private animationTimeoutId: number | null = null;
  private deckGridContainer: HTMLElement | null = null;
  private isRendering = false;
  private needsRerender = false;
  private activeLeafRefreshTimeout: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FlashlyPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.viewModel = new BrowserViewModel([], plugin.settings.browser.defaultSort);
  }

  getViewType(): string {
    return FLASHCARD_BROWSER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Flashcard browser';
  }

  getIcon(): string {
    return 'layers';
  }

   
  async onOpen(): Promise<void> {
    // Load component
    this.component.load();

    // Load cards from storage
    this.refreshCards();

    // Initial render
    void this.render();

    // Register keyboard handlers
    this.registerDomEvent(this.containerEl, 'keydown', (evt: KeyboardEvent) => {
      this.handleKeyPress(evt);
    });

    // Refresh when view becomes visible after being hidden
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf && leaf.view instanceof FlashcardBrowserView && leaf.view === this) {
          if (this.activeLeafRefreshTimeout !== null) {
            window.clearTimeout(this.activeLeafRefreshTimeout);
          }
          // Defer refresh so the original click handler can complete
          this.activeLeafRefreshTimeout = window.setTimeout(() => {
            this.activeLeafRefreshTimeout = null;
            this.refreshCards();
          }, 0);
        }
      })
    );

    // Refresh when files are modified (debounced to avoid excessive updates)
    let fileModifyTimeout: NodeJS.Timeout | null = null;
    this.registerEvent(
      this.app.vault.on('modify', () => {
        if (fileModifyTimeout) clearTimeout(fileModifyTimeout);
        fileModifyTimeout = setTimeout(() => {
          this.refreshCards();
        }, 2000); // Wait 2 seconds after last modification
      })
    );

    // Make view focusable
    this.containerEl.setAttribute('tabindex', '-1');
  }

   
  async onClose(): Promise<void> {
    // Clean up animation timeout
    if (this.animationTimeoutId !== null) {
      window.clearTimeout(this.animationTimeoutId);
      this.animationTimeoutId = null;
    }
    if (this.activeLeafRefreshTimeout !== null) {
      window.clearTimeout(this.activeLeafRefreshTimeout);
      this.activeLeafRefreshTimeout = null;
    }
    // Unload component to clean up
    this.component.unload();
  }

  /**
   * Refresh cards from storage
   */
  private refreshCards(): void {
    const cards = this.plugin.storage.getAllCards();
    this.viewModel.setCards(cards);
    void this.render();
  }

  /**
   * Public method to refresh the view (called externally)
   */
  refresh(): void {
    this.refreshCards();
  }

  /**
   * Render the entire view based on current mode
   */
  private async render(): Promise<void> {
    // Prevent concurrent renders
    if (this.isRendering) {
      this.needsRerender = true;
      return;
    }
    
    try {
      this.isRendering = true;
      const container = this.contentEl;
      container.empty();
      container.addClass('flashcard-browser-view');

      const state = this.viewModel.getViewState();

      if (state.mode === BrowserViewMode.DECK_LIST) {
        this.renderDeckListView(container);
      } else {
        await this.renderCardView(container);
      }
    } finally {
      this.isRendering = false;
      
      // Re-render once if needed during async work
      if (this.needsRerender) {
        this.needsRerender = false;
        void this.render();
      }
    }
  }

  // ====== DECK LIST VIEW ======

  /**
   * Render the deck list view
   */
  private renderDeckListView(container: HTMLElement) {
    const deckListContainer = container.createDiv({ cls: 'deck-list-view' });

    // Header with stats
    this.renderDeckListHeader(deckListContainer);

    // Search box
    this.renderDeckSearch(deckListContainer);

    // Deck grid
    this.renderDeckGrid(deckListContainer);
  }

  /**
   * Render deck list header with overall statistics
   */
  private renderDeckListHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'deck-list-header' });

    const titleRow = header.createDiv({ cls: 'deck-list-title-row' });
    
    titleRow.createEl('h2', {
      text: 'Your decks',
      cls: 'deck-list-title',
    });

    const headerActions = titleRow.createDiv({ cls: 'deck-list-header-actions' });

    // Quiz buttons
    const quizBtn = headerActions.createEl('button', {
      cls: 'deck-header-btn',
      attr: { 'aria-label': 'Generate quiz' },
    });
    const quizIcon = quizBtn.createSpan({ cls: 'deck-btn-icon' });
    setIcon(quizIcon, 'help-circle');
    quizBtn.createSpan({ cls: 'deck-btn-text', text: 'Generate quiz' });
    quizBtn.addEventListener('click', () => {
      (this.app as ObsidianApp).commands.executeCommandById('flashly:generate-quiz');
    });

    const historyBtn = headerActions.createEl('button', {
      cls: 'deck-header-btn',
      attr: { 'aria-label': 'View quiz history' },
    });
    const historyIcon = historyBtn.createSpan({ cls: 'deck-btn-icon' });
    setIcon(historyIcon, 'history');
    historyBtn.createSpan({ cls: 'deck-btn-text', text: 'Quiz history' });
    historyBtn.addEventListener('click', () => {
      void (async () => {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
          type: 'flashly-quiz-history-view',
          active: true
        });
      })();
    });

    const statsBtn = headerActions.createEl('button', {
      cls: 'deck-header-btn',
      attr: { 'aria-label': 'View statistics' },
    });
    const statsIcon = statsBtn.createSpan({ cls: 'deck-btn-icon' });
    setIcon(statsIcon, 'bar-chart-2');
    statsBtn.createSpan({ cls: 'deck-btn-text', text: 'Statistics' });
    statsBtn.addEventListener('click', () => {
      void (async () => {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
          type: 'flashly-statistics-view',
          active: true
        });
      })();
    });

    // Scan button
    const scanBtn = headerActions.createEl('button', {
      cls: 'deck-header-btn deck-scan-btn',
      attr: { 'aria-label': 'Scan for flashcards' },
    });
    const scanIcon = scanBtn.createSpan({ cls: 'deck-btn-icon' });
    setIcon(scanIcon, 'search');
    scanBtn.createSpan({ cls: 'deck-btn-text', text: 'Scan vault' });
    scanBtn.addEventListener('click', () => {
      // Execute scan command - it will show its own notices
      (this.app as ObsidianApp).commands.executeCommandById('flashly:scan-vault');
    });

    const stats = this.viewModel.getStatistics();
    const statsText = header.createDiv({ cls: 'deck-list-stats' });
    statsText.createSpan({ text: `${stats.deckCount} decks` });
    statsText.createSpan({ text: ' • ' });
    statsText.createSpan({ text: `${stats.totalCards} total cards` });
    statsText.createSpan({ text: ' • ' });
    statsText.createSpan({ text: `${stats.cardsDueToday} due today` });
  }

  /**
   * Render deck search box
   */
  private renderDeckSearch(container: HTMLElement) {
    const searchRow = container.createDiv({ cls: 'deck-search-row' });
    
    // Search input
    const searchContainer = searchRow.createDiv({ cls: 'deck-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: 'Search decks...',
      cls: 'deck-search-input',
      value: this.deckSearchQuery,
    });

    searchInput.addEventListener('input', (evt: Event) => {
      this.deckSearchQuery = (evt.target as HTMLInputElement).value;
      // Update immediately - only updates the grid, not the search input
      this.updateDeckGrid();
    });

    // Sort dropdown
    const sortContainer = searchRow.createDiv({ cls: 'deck-sort' });
    sortContainer.createSpan({ cls: 'deck-sort-label', text: 'Sort: ' });
    const sortSelect = sortContainer.createEl('select', { cls: 'deck-sort-select' });

    const sortOptions: Array<{ value: DeckSortOption; label: string }> = [
      { value: 'name-asc', label: 'Name (A-Z)' },
      { value: 'name-desc', label: 'Name (Z-A)' },
      { value: 'cards-desc', label: 'Most cards' },
      { value: 'due-desc', label: 'Most due' },
      { value: 'studied-desc', label: 'Recently studied' },
    ];

    for (const opt of sortOptions) {
      const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.deckSortBy) {
        option.selected = true;
      }
    }

    sortSelect.addEventListener('change', (evt: Event) => {
      this.deckSortBy = (evt.target as HTMLSelectElement).value as DeckSortOption;
      this.updateDeckGrid();
    });
  }

  /**
   * Sort decks based on current sort option
   */
  private sortDecks(decks: DeckInfo[]): DeckInfo[] {
    const sorted = [...decks];
    
    switch (this.deckSortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'cards-desc':
        sorted.sort((a, b) => b.totalCards - a.totalCards);
        break;
      case 'due-desc':
        sorted.sort((a, b) => b.dueToday - a.dueToday);
        break;
      case 'studied-desc':
        sorted.sort((a, b) => {
          if (!a.lastStudied && !b.lastStudied) return 0;
          if (!a.lastStudied) return 1;
          if (!b.lastStudied) return -1;
          return b.lastStudied.getTime() - a.lastStudied.getTime();
        });
        break;
    }
    
    return sorted;
  }

  /**
   * Update only the deck grid without re-rendering the entire view.
   * This prevents the search input from losing focus during typing.
   */
  private updateDeckGrid(): void {
    if (!this.deckGridContainer) {
      // Grid container not available, can't update
      return;
    }

    this.populateDeckGrid(this.deckGridContainer);
  }

  /**
   * Render grid of deck cards
   */
  private renderDeckGrid(container: HTMLElement) {
    // Store reference for updates
    this.deckGridContainer = container.createDiv({ cls: 'deck-grid' });
    this.populateDeckGrid(this.deckGridContainer);
  }

  /**
   * Populate the deck grid with filtered and sorted cards
   */
  private populateDeckGrid(grid: HTMLElement): void {
    // Clear existing content
    grid.empty();
    
    const deckList = this.viewModel.getDeckList();

    // Filter by search query
    const filteredDecks = this.deckSearchQuery
      ? deckList.filter((deck) =>
          deck.name.toLowerCase().includes(this.deckSearchQuery.toLowerCase())
        )
      : deckList;

    // Sort decks
    const sortedDecks = this.sortDecks(filteredDecks);

    if (sortedDecks.length === 0) {
      this.renderDeckListEmptyState(grid, deckList.length === 0);
      return;
    }

    for (const deck of sortedDecks) {
      this.renderDeckCard(grid, deck);
    }
  }

  /**
   * Render individual deck card
   */
  private renderDeckCard(container: HTMLElement, deck: DeckInfo) {
    const card = container.createDiv({ cls: 'deck-card' });

    // Header
    const header = card.createDiv({ cls: 'deck-card-header' });
    const deckIconEl = header.createSpan({ cls: 'deck-icon' });
    setIcon(deckIconEl, 'book-open');
    header.createSpan({ cls: 'deck-name', text: deck.name });

    // Statistics
    const stats = card.createDiv({ cls: 'deck-stats' });

    const totalStat = stats.createDiv({ cls: 'deck-stat' });
    totalStat.createDiv({ cls: 'deck-stat-value', text: deck.totalCards.toString() });
    totalStat.createDiv({ cls: 'deck-stat-label', text: 'Total cards' });

    const dueStat = stats.createDiv({ cls: 'deck-stat' });
    dueStat.createDiv({ cls: 'deck-stat-value', text: deck.dueToday.toString() });
    dueStat.createDiv({ cls: 'deck-stat-label', text: 'Due today' });

    // Last studied
    const lastStudied = card.createDiv({ cls: 'deck-last-studied' });
    if (deck.lastStudied) {
      const daysAgo = Math.floor(
        (Date.now() - deck.lastStudied.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysAgo === 0) {
        lastStudied.setText('Studied today');
      } else if (daysAgo === 1) {
        lastStudied.setText('Last studied yesterday');
      } else {
        lastStudied.setText(`Last studied ${daysAgo} days ago`);
      }
    } else {
      lastStudied.setText('Never studied');
    }

    // Study button
    const studyBtn = card.createEl('button', {
      cls: 'deck-study-btn',
            text: 'Study deck',
    });
    studyBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      void this.startDeckReview(deck.name);
    });

    // Make entire card clickable
    card.addEventListener('click', (evt: MouseEvent) => {
      // Don't trigger if clicking the button directly
      if (evt.target instanceof Node && studyBtn.contains(evt.target)) return;
      this.viewModel.selectDeck(deck.name);
      void this.render();
    });
  }

  /**
   * Render empty state for deck list
   */
  private renderDeckListEmptyState(container: HTMLElement, isActuallyEmpty: boolean) {
    const emptyState = container.createDiv({ cls: 'empty-state deck-list-empty-state' });
    const emptyIcon = emptyState.createEl('div', { cls: 'empty-icon' });
    setIcon(emptyIcon, this.deckSearchQuery ? 'search' : 'inbox');
    emptyState.createEl('div', {
      cls: 'empty-title',
      text: 'No decks found',
    });
    emptyState.createEl('div', {
      cls: 'empty-message',
      text: this.deckSearchQuery
        ? 'No decks match your search. Try a different query.'
        : 'Create flashcards in your notes and run "Scan vault for flashcards".',
    });
    
    // If no decks at all (not just filtered), show scan button
    if (isActuallyEmpty) {
      const scanBtn = emptyState.createEl('button', {
        cls: 'mod-cta',
        text: 'Scan vault for flashcards'
      });
      scanBtn.addEventListener('click', () => {
        (this.app as ObsidianApp).commands.executeCommandById('flashly:scan-vault');
      });
    }
  }

  // ====== CARD VIEW ======

  /**
   * Render the card view for browsing a single deck
   */
  private async renderCardView(container: HTMLElement): Promise<void> {
    const cardViewContainer = container.createDiv({ cls: 'card-view' });

    // Header with breadcrumb
    this.renderCardViewHeader(cardViewContainer);

    // Sort controls
    this.renderCardSort(cardViewContainer);

    // Card progress
    this.renderCardProgress(cardViewContainer);

    // Card display
    await this.renderCardDisplay(cardViewContainer);

    // Navigation buttons
    this.renderCardNavigation(cardViewContainer);

    // Actions
    this.renderCardActions(cardViewContainer);
  }

  /**
   * Render card view header with back button
   */
  private renderCardViewHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'card-view-header' });

    // Back button
    const backBtn = header.createEl('button', {
      cls: 'back-to-decks-btn',
      text: '← back to decks',
    });
    backBtn.addEventListener('click', () => {
      this.viewModel.backToDeckList();
      void this.render();
    });

    // Deck name
    const state = this.viewModel.getViewState();
    header.createDiv({
      cls: 'deck-title',
      text: state.selectedDeck ?? '',
    });
  }

  /**
   * Render card sort dropdown
   */
  private renderCardSort(container: HTMLElement) {
    const sortRow = container.createDiv({ cls: 'card-sort-row' });

    const sortContainer = sortRow.createDiv({ cls: 'card-sort' });
    sortContainer.createSpan({ cls: 'card-sort-label', text: 'Sort: ' });
    const sortSelect = sortContainer.createEl('select', { cls: 'card-sort-select' });

    const sortOptions: Array<{ value: SortOption; label: string }> = [
      { value: 'created-desc', label: 'Most recently made' },
      { value: 'created-asc', label: 'Oldest first' },
      { value: 'updated-desc', label: 'Recently updated' },
      { value: 'updated-asc', label: 'Least recently updated' },
      { value: 'due-asc', label: 'Due soonest' },
      { value: 'due-desc', label: 'Due latest' },
      { value: 'deck-asc', label: 'Deck (A-Z)' },
      { value: 'deck-desc', label: 'Deck (Z-A)' },
    ];

    const currentSort = this.viewModel.getSortBy();

    for (const opt of sortOptions) {
      const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === currentSort) {
        option.selected = true;
      }
    }

    sortSelect.addEventListener('change', (evt: Event) => {
      this.viewModel.setSortBy((evt.target as HTMLSelectElement).value as SortOption);
      void this.render();
    });
  }

  /**
   * Render card progress indicator
   */
  private renderCardProgress(container: HTMLElement) {
    const progress = container.createDiv({ cls: 'card-progress' });

    const state = this.viewModel.getViewState();
    const deckCards = this.viewModel.getCardsInSelectedDeck();

    progress.createDiv({
      cls: 'card-counter',
      text: `Card ${state.currentCardIndex + 1} of ${deckCards.length}`,
    });

    // Count due cards in this deck
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const dueCount = deckCards.filter(
      (c) => c.fsrsCard.due.getTime() <= endOfToday.getTime()
    ).length;

    progress.createDiv({
      cls: 'cards-due',
      text: `${dueCount} card${dueCount !== 1 ? 's' : ''} due today`,
    });
  }

  /**
   * Render the card display (front or back)
   */
  private async renderCardDisplay(container: HTMLElement): Promise<void> {
    const display = container.createDiv({ cls: 'card-display' });
    const card = this.viewModel.getCurrentCard();

    if (!card) {
      display.createDiv({
        cls: 'empty-state',
        text: 'No cards in this deck',
      });
      return;
    }

    const state = this.viewModel.getViewState();

    // Card container with flip animation
    const cardContainer = display.createDiv({ cls: 'card-container' });
    const cardInner = cardContainer.createDiv({ cls: 'card-inner' });

    // Add flipped class if showing answer
    if (state.showingAnswer) {
      cardInner.addClass('flipped');
    }

    // Front of card (question)
    const cardFront = cardInner.createDiv({ cls: 'card-face card-front' });
    const frontText = cardFront.createDiv({ cls: 'card-text' });
    await MarkdownRenderer.render(
      this.app,
      card.front,
      frontText,
      card.source.file,
      this.component
    );
    const frontBtn = cardFront.createEl('button', {
      cls: 'flip-btn',
      text: 'Show answer',
    });
    frontBtn.addEventListener('click', () => {
      this.flipWithAnimation();
    });

    // Back of card (answer)
    const cardBack = cardInner.createDiv({ cls: 'card-face card-back' });
    const backText = cardBack.createDiv({ cls: 'card-text' });
    await MarkdownRenderer.render(
      this.app,
      card.back,
      backText,
      card.source.file,
      this.component
    );
    const backBtn = cardBack.createEl('button', {
      cls: 'flip-btn',
      text: 'Show question',
    });
    backBtn.addEventListener('click', () => {
      this.flipWithAnimation();
    });
  }

  /**
   * Render card navigation buttons
   */
  private renderCardNavigation(container: HTMLElement) {
    const nav = container.createDiv({ cls: 'card-navigation' });

    const state = this.viewModel.getViewState();
    const deckCards = this.viewModel.getCardsInSelectedDeck();

    // Previous button
    const prevBtn = nav.createEl('button', {
      cls: 'nav-btn prev-btn',
      text: '← previous',
    });
    prevBtn.disabled = state.currentCardIndex === 0;
    prevBtn.addEventListener('click', () => {
      this.viewModel.goToPreviousCard();
      void this.render();
    });

    // Next button
    const nextBtn = nav.createEl('button', {
      cls: 'nav-btn next-btn',
      text: 'Next →',
    });
    nextBtn.disabled = state.currentCardIndex >= deckCards.length - 1;
    nextBtn.addEventListener('click', () => {
      this.viewModel.goToNextCard();
      void this.render();
    });
  }

  /**
   * Render card action buttons
   */
  private renderCardActions(container: HTMLElement) {
    const actions = container.createDiv({ cls: 'card-actions' });
    const card = this.viewModel.getCurrentCard();

    if (!card) return;

    // Open note button
    const openBtn = actions.createEl('button', {
      cls: 'action-btn open-btn',
      text: 'Open note',
    });
    openBtn.addEventListener('click', () => void this.openCardNote(card));

    // Delete button
    const deleteBtn = actions.createEl('button', {
      cls: 'action-btn delete-btn',
      text: 'Delete',
    });
    deleteBtn.addEventListener('click', () => this.deleteCard(card));
  }

  // ====== HELPER METHODS ======

  /**
   * Open card's source note at the card location
   */
  private async openCardNote(card: FlashlyCard) {
    // Ensure workspace is ready before opening file
    if (!this.app.workspace.layoutReady) {
      await new Promise(resolve => {
        this.app.workspace.onLayoutReady(() => resolve(null));
      });
    }

    let file = this.app.vault.getAbstractFileByPath(card.source.file);
    // Retry logic: try up to 3 times with small delay if file not found
    let attempts = 0;
    while (!file && attempts < 3) {
      await new Promise(res => setTimeout(res, 200));
      file = this.app.vault.getAbstractFileByPath(card.source.file);
      attempts++;
    }

    if (!file) {
      console.error('Flashly: file not found in vault:', card.source.file);
      new Notice(`Could not find file: ${card.source.file}\n\nThe file may have been moved, renamed, or deleted.\nIf you recently changed your vault structure, try rescanning for flashcards.`);
      return;
    }
    if (!(file instanceof TFile)) {
      console.error('Flashly: path is not a file:', card.source.file, 'Type:', file.constructor.name);
      new Notice(`Path is a folder, not a file: ${card.source.file}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    // Navigate to line
    const view = this.app.workspace.getActiveViewOfType(ItemView);
    if (view && 'editor' in view) {
      // Editor property is not typed in ItemView, using type assertion for compatibility
      const editor = (view as { editor?: { setCursor: (pos: { line: number; ch: number }) => void; scrollIntoView: (range: { from: { line: number; ch: number }; to: { line: number; ch: number } }) => void } }).editor;
      if (editor) {
        editor.setCursor({ line: card.source.line - 1, ch: 0 });
        editor.scrollIntoView({ from: { line: card.source.line - 1, ch: 0 }, to: { line: card.source.line - 1, ch: 0 } });
      }
    }
  }

  /**
   * Delete a card with confirmation
   */
  private deleteCard(card: FlashlyCard): void {
    const modal = new ConfirmDeleteCardModal(this.app, card, () => {
      this.plugin.storage.deleteCard(card.id);
      void this.plugin.storage.save();
      new Notice('Card deleted');
      this.refreshCards();
    });
    modal.open();
  }

  private async startDeckReview(deckName: string) {
    const command = this.plugin.startReviewCommand;
    if (!command) {
      new Notice('Review command is not ready yet. Try again in a moment.');
      return;
    }

    try {
      await command.startReview([deckName]);
    } catch (error) {
      console.error('Flashly: failed to start review session for deck', deckName, error);
      new Notice('Failed to start review session. Check console for details.');
    }
  }

  /**
   * Flip card with optimized animation using will-change
   */
  private flipWithAnimation(): void {
    if (this.isAnimating) {
      return; // Prevent multiple simultaneous animations
    }

    const cardInner = this.containerEl.querySelector('.card-inner') ;

    if (!cardInner) {
      // Fallback to full render if the card element is missing
      this.viewModel.flipCard();
      void this.render();
      return;
    }

    this.isAnimating = true;
    cardInner.addClass('animating');

    this.viewModel.flipCard();

    const { showingAnswer } = this.viewModel.getViewState();
    cardInner.toggleClass('flipped', showingAnswer);

    // Clear any existing animation timeout
    if (this.animationTimeoutId !== null) {
      window.clearTimeout(this.animationTimeoutId);
    }

    // Remove animation hint once transition completes
    this.animationTimeoutId = window.setTimeout(() => {
      // Check if element still exists before accessing it
      if (cardInner && cardInner.isConnected) {
        cardInner.removeClass('animating');
      }
      this.isAnimating = false;
      this.animationTimeoutId = null;
    }, 400); // Match CSS transition duration
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyPress(evt: KeyboardEvent) {
    const state = this.viewModel.getViewState();

    // Handle keyboard shortcuts based on current mode
    if (state.mode === BrowserViewMode.DECK_LIST) {
      this.handleDeckListKeyPress(evt);
    } else {
      this.handleCardViewKeyPress(evt);
    }
  }

  /**
   * Handle keyboard shortcuts in deck list mode
   */
  private handleDeckListKeyPress(evt: KeyboardEvent) {
    switch (evt.key) {
      case '/': {
        evt.preventDefault();
        const searchInput = this.containerEl.querySelector('.deck-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
        break;
      }
      case 'Escape': {
        const focusedInput = this.containerEl.querySelector('.deck-search-input:focus');
        if (focusedInput) {
          (focusedInput as HTMLInputElement).blur();
          this.containerEl.focus();
        }
        break;
      }
    }
  }

  /**
   * Handle keyboard shortcuts in card view mode
   */
  private handleCardViewKeyPress(evt: KeyboardEvent) {
    const deckCards = this.viewModel.getCardsInSelectedDeck();
    const state = this.viewModel.getViewState();

    switch (evt.key) {
      case 'ArrowRight':
      case 'n':
        evt.preventDefault();
        if (state.currentCardIndex < deckCards.length - 1) {
          this.viewModel.goToNextCard();
          void this.render();
        }
        break;

      case 'ArrowLeft':
      case 'p':
        evt.preventDefault();
        if (state.currentCardIndex > 0) {
          this.viewModel.goToPreviousCard();
          void this.render();
        }
        break;

      case ' ':
      case 'f':
        evt.preventDefault();
        this.flipWithAnimation();
        break;

      case 'Escape':
        evt.preventDefault();
        this.viewModel.backToDeckList();
        void this.render();
        break;

      case 'Enter': {
        evt.preventDefault();
        const card = this.viewModel.getCurrentCard();
        if (card) {
          void this.openCardNote(card);
        }
        break;
      }

      case 'Delete':
      case 'Backspace': {
        evt.preventDefault();
        const currentCard = this.viewModel.getCurrentCard();
        if (currentCard) {
          this.deleteCard(currentCard);
        }
        break;
      }
    }
  }
}

/**
 * Confirmation modal for deleting cards
 */
class ConfirmDeleteCardModal extends Modal {
  card: FlashlyCard;
  onConfirm: () => void;

  constructor(app: App, card: FlashlyCard, onConfirm: () => void) {
    super(app);
    this.card = card;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('flashly-confirm-delete-modal');

    contentEl.createEl('h2', { text: 'Delete flashcard?' });
    contentEl.createEl('p', {
      text: `Are you sure you want to delete this flashcard? This cannot be undone.`
    });

    const cardPreview = contentEl.createDiv({ cls: 'card-preview' });
    cardPreview.createEl('strong', { text: 'Front: ' });
    cardPreview.createSpan({ text: this.card.front });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const deleteBtn = buttonContainer.createEl('button', {
      text: 'Delete',
      cls: 'mod-warning'
    });
    deleteBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

