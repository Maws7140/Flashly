/**
 * Generate Quiz Command
 * Allows users to create quizzes from their flashcards
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { QuizConfig, DEFAULT_QUIZ_CONFIG, createQuiz, Quiz } from '../models/quiz';
import { TraditionalQuizGenerator } from '../quiz/traditional-quiz-generator';
import { AIQuizGenerator } from '../quiz/ai-quiz-generator';
import { FlashlyCard } from '../models/card';

interface QuizView {
	loadQuiz(quiz: Quiz): void;
}

class GenerateQuizModal extends Modal {
	plugin: FlashlyPlugin;
	config: QuizConfig;
	private cardSelectionContainer: HTMLElement | null = null;

	constructor(app: App, plugin: FlashlyPlugin) {
		super(app);
		this.plugin = plugin;
		this.config = { ...DEFAULT_QUIZ_CONFIG };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('flashly-generate-quiz-modal');

		contentEl.createEl('h2', { text: 'Generate quiz' });

		// Quiz Title
		new Setting(contentEl)
			.setName('Quiz title')
			.setDesc('Give your quiz a name')
			.addText(text => {
				text.setPlaceholder('My quiz');
				text.inputEl.id = 'quiz-title-input';
			});

		// Number of questions
		new Setting(contentEl)
			.setName('Number of questions')
			.setDesc('How many questions to generate')
			.addText(text => {
				text.inputEl.type = 'number';
				text.setValue(String(this.config.questionCount));
				text.onChange(value => {
					const parsed = parseInt(value);
					this.config.questionCount = isNaN(parsed) ? 20 : Math.max(1, parsed);
				});
			});

		// Question types
		contentEl.createEl('h3', { text: 'Question types' });

		new Setting(contentEl)
			.setName('Multiple choice')
			.setDesc('Include multiple choice questions')
			.addToggle(toggle => {
				toggle.setValue(this.config.includeMultipleChoice);
				toggle.onChange(value => {
					this.config.includeMultipleChoice = value;
				});
			});

		new Setting(contentEl)
			.setName('Fill in the blank')
			.setDesc('Include fill-in-the-blank questions')
			.addToggle(toggle => {
				toggle.setValue(this.config.includeFillBlank);
				toggle.onChange(value => {
					this.config.includeFillBlank = value;
				});
			});

		new Setting(contentEl)
			.setName('True/false')
			.setDesc('Include true/false questions')
			.addToggle(toggle => {
				toggle.setValue(this.config.includeTrueFalse);
				toggle.onChange(value => {
					this.config.includeTrueFalse = value;
				});
			});

		// Learn Mode
		new Setting(contentEl)
			.setName('Learn mode')
			.setDesc('Get immediate feedback and retry incorrect answers until you master all questions')
			.addToggle(toggle => {
				toggle.setValue(this.config.learnMode ?? false);
				toggle.onChange(value => {
					this.config.learnMode = value;
				});
			});

		// Deck filter
		new Setting(contentEl)
			.setName('Filter by decks')
			.setDesc('Select which decks to include (leave all unchecked for all decks)');

		// Get all available decks
		const allCards = this.plugin.storage.getAllCards();
		const deckSet = new Set<string>();
		allCards.forEach(card => {
			if (card.deck) {
				deckSet.add(card.deck);
			}
		});
		const availableDecks = Array.from(deckSet).sort();

		// Create deck selection container
		const deckContainer = contentEl.createDiv({ cls: 'quiz-deck-selection' });

		if (availableDecks.length === 0) {
			deckContainer.createDiv({
				text: 'No decks found. Create some flashcards first!',
				cls: 'quiz-warning'
			});
		} else {
			const selectedDecks = new Set<string>();

			// Add search input
			const searchContainer = deckContainer.createDiv({ cls: 'quiz-deck-search-container' });
			const searchInput = searchContainer.createEl('input', {
				type: 'text',
				placeholder: 'Search decks...',
				cls: 'quiz-deck-search-input'
			});

			// Add "Select all" / "Deselect all" buttons
			const controlsDiv = deckContainer.createDiv({ cls: 'quiz-deck-controls' });

			const selectAllBtn = controlsDiv.createEl('button', {
				text: 'Select all',
				cls: 'quiz-deck-control-btn'
			});

			const deselectAllBtn = controlsDiv.createEl('button', {
				text: 'Deselect all',
				cls: 'quiz-deck-control-btn'
			});

			// Create scrollable deck list
			const deckList = deckContainer.createDiv({ cls: 'quiz-deck-list' });

			// Store deck items for filtering
			const deckItems: Array<{ element: HTMLElement, name: string, checkbox: HTMLInputElement }> = [];

			availableDecks.forEach(deck => {
				const deckItem = deckList.createDiv({ cls: 'quiz-deck-item' });

				const checkbox = deckItem.createEl('input', {
					type: 'checkbox'
				});
				checkbox.id = `deck-${deck}`;

				const label = deckItem.createEl('label', {
					text: deck,
					attr: { for: `deck-${deck}` }
				});
				label.addClass('quiz-deck-label');

				// Count cards in this deck
				const cardCount = allCards.filter(c => c.deck === deck).length;
				deckItem.createSpan({
					text: ` (${cardCount} card${cardCount !== 1 ? 's' : ''})`,
					cls: 'quiz-deck-count'
				});

				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						selectedDecks.add(deck);
					} else {
						selectedDecks.delete(deck);
					}
					this.config.deckFilter = Array.from(selectedDecks);
					// Update card selection if AI is enabled
					if (this.config.useAI && this.cardSelectionContainer) {
						this.renderCardSelection();
					}
				});

				// Store reference for filtering
				deckItems.push({ element: deckItem, name: deck, checkbox });
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
				let noResultsMsg = deckList.querySelector('.quiz-deck-no-results') as HTMLElement;

				if (visibleItems.length === 0) {
					if (!noResultsMsg) {
						noResultsMsg = deckList.createDiv({
							text: 'No decks found',
							cls: 'quiz-deck-no-results'
						});
					}
					noResultsMsg.removeClass('hidden');
				} else if (noResultsMsg) {
					noResultsMsg.addClass('hidden');
				}
			});

			// Update Select all button to only affect visible decks
			selectAllBtn.addEventListener('click', (e) => {
				e.preventDefault();
				deckItems.forEach(item => {
					if (!item.element.hasClass('hidden')) {
						selectedDecks.add(item.name);
						item.checkbox.checked = true;
					}
				});
				this.config.deckFilter = Array.from(selectedDecks);
				// Update card selection if AI is enabled
				if (this.config.useAI && this.cardSelectionContainer) {
					this.renderCardSelection();
				}
			});

			// Update Deselect all button to only affect visible decks
			deselectAllBtn.addEventListener('click', (e) => {
				e.preventDefault();
				deckItems.forEach(item => {
					if (!item.element.hasClass('hidden')) {
						selectedDecks.delete(item.name);
						item.checkbox.checked = false;
					}
				});
				this.config.deckFilter = Array.from(selectedDecks);
				// Update card selection if AI is enabled
				if (this.config.useAI && this.cardSelectionContainer) {
					this.renderCardSelection();
				}
			});
		}

		// AI Generation
		if (this.plugin.settings.quiz.enabled) {
			contentEl.createEl('h3', { text: 'AI generation' });

			new Setting(contentEl)
				.setName('Use AI to generate questions')
				.setDesc('Use AI to create creative quiz questions')
				.addToggle(toggle => {
					toggle.setValue(this.config.useAI);
					toggle.onChange(value => {
						this.config.useAI = value;
						if (value) {
							// Show card selection when AI is enabled
							this.renderCardSelection();
						} else {
							// Hide card selection and clear selection when AI is disabled
							if (this.cardSelectionContainer) {
								this.cardSelectionContainer.remove();
								this.cardSelectionContainer = null;
							}
							this.config.selectedCardIds = undefined;
						}
					});
				});

			// Show warning if API key not configured
			if (this.plugin.settings.quiz.provider === 'openai' && !this.plugin.settings.quiz.openai?.apiKey) {
				contentEl.createDiv({
					text: '⚠️ OpenAI API key not configured. Please configure in settings.',
					cls: 'quiz-warning'
				});
			} else if (this.plugin.settings.quiz.provider === 'anthropic' && !this.plugin.settings.quiz.anthropic?.apiKey) {
				contentEl.createDiv({
					text: '⚠️ Anthropic API key not configured. Please configure in settings.',
					cls: 'quiz-warning'
				});
			} else if (this.plugin.settings.quiz.provider === 'gemini' && !this.plugin.settings.quiz.gemini?.apiKey) {
				contentEl.createDiv({
					text: '⚠️ Gemini API key not configured. Please configure in settings.',
					cls: 'quiz-warning'
				});
			} else if (this.plugin.settings.quiz.provider === 'custom' && (!this.plugin.settings.quiz.custom?.apiKey || !this.plugin.settings.quiz.custom?.baseUrl)) {
				contentEl.createDiv({
					text: '⚠️ Custom API not fully configured. Please configure in settings.',
					cls: 'quiz-warning'
				});
			}

			// Show card selection if AI is enabled
			if (this.config.useAI) {
				this.renderCardSelection();
			}
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const generateBtn = buttonContainer.createEl('button', {
			text: 'Generate quiz',
			cls: 'mod-cta'
		});

		generateBtn.addEventListener('click', () => {
			void this.generateQuiz();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel'
		});

		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private renderCardSelection(): void {
		const { contentEl } = this;

		// Remove existing card selection if present
		if (this.cardSelectionContainer) {
			this.cardSelectionContainer.remove();
		}

		// Get available cards
		let availableCards = this.plugin.storage.getAllCards();

		// Apply deck filter if specified
		if (this.config.deckFilter && this.config.deckFilter.length > 0) {
			availableCards = availableCards.filter(card =>
				this.config.deckFilter!.some(deck =>
					card.deck.toLowerCase().includes(deck.toLowerCase())
				)
			);
		}

		if (availableCards.length === 0) {
			const warning = contentEl.createDiv({
				text: 'No cards available. Please scan for flashcards first.',
				cls: 'quiz-warning'
			});
			this.cardSelectionContainer = warning;
			return;
		}

		// Create card selection container
		const cardContainer = contentEl.createDiv({ cls: 'quiz-card-selection' });
		this.cardSelectionContainer = cardContainer;

		cardContainer.createEl('h4', { text: 'Select cards for AI context' });
		cardContainer.createEl('p', {
			text: 'Choose which cards to include in the AI context for quiz generation',
			cls: 'quiz-card-selection-desc'
		});

		// Initialize or update selected cards
		// If selectedCardIds exists, filter to only include available cards
		// Otherwise, select all available cards
		if (!this.config.selectedCardIds || this.config.selectedCardIds.length === 0) {
			this.config.selectedCardIds = availableCards.map(c => c.id);
		} else {
			// Filter selectedCardIds to only include cards that are still available
			const availableCardIds = new Set(availableCards.map(c => c.id));
			this.config.selectedCardIds = this.config.selectedCardIds.filter(id => availableCardIds.has(id));
			// If no cards remain selected, select all available cards
			if (this.config.selectedCardIds.length === 0) {
				this.config.selectedCardIds = availableCards.map(c => c.id);
			}
		}

		const selectedCardIds = new Set<string>(this.config.selectedCardIds || []);

		// Add search input
		const searchContainer = cardContainer.createDiv({ cls: 'quiz-card-search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search cards...',
			cls: 'quiz-card-search-input'
		});

		// Add "Select all" / "Deselect all" buttons
		const controlsDiv = cardContainer.createDiv({ cls: 'quiz-card-controls' });

		const selectAllBtn = controlsDiv.createEl('button', {
			text: 'Select all',
			cls: 'quiz-card-control-btn'
		});

		const deselectAllBtn = controlsDiv.createEl('button', {
			text: 'Deselect all',
			cls: 'quiz-card-control-btn'
		});

		// Create scrollable card list
		const cardList = cardContainer.createDiv({ cls: 'quiz-card-list' });

		// Helper function to truncate text
		const truncateText = (text: string, maxLength: number): string => {
			if (text.length <= maxLength) return text;
			return text.substring(0, maxLength).trim() + '...';
		};

		// Helper function to strip markdown for display
		const stripMarkdown = (text: string): string => {
			return text
				.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links
				.replace(/\*\*([^\*]+)\*\*/g, '$1') // Remove bold
				.replace(/\*([^\*]+)\*/g, '$1') // Remove italic
				.replace(/#{1,6}\s+/g, '') // Remove headers
				.replace(/`([^`]+)`/g, '$1') // Remove inline code
				.trim();
		};

		// Store card items for filtering
		const cardItems: Array<{ element: HTMLElement, card: FlashlyCard, checkbox: HTMLInputElement }> = [];

		availableCards.forEach(card => {
			const cardItem = cardList.createDiv({ cls: 'quiz-card-item' });

			const checkbox = cardItem.createEl('input', {
				type: 'checkbox'
			});
			checkbox.id = `card-${card.id}`;
			checkbox.checked = selectedCardIds.has(card.id);

			const labelContainer = cardItem.createDiv({ cls: 'quiz-card-label-container' });
			const label = labelContainer.createEl('label', {
				attr: { for: `card-${card.id}` }
			});
			label.addClass('quiz-card-label');

			// Display card front text (truncated and markdown-stripped)
			const frontText = stripMarkdown(card.front);
			const displayText = truncateText(frontText, 100);
			label.createSpan({ text: displayText, cls: 'quiz-card-text' });

			// Add deck badge
			const deckBadge = labelContainer.createSpan({
				text: card.deck,
				cls: 'quiz-card-deck'
			});

			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					selectedCardIds.add(card.id);
				} else {
					selectedCardIds.delete(card.id);
				}
				this.config.selectedCardIds = Array.from(selectedCardIds);
			});

			// Store reference for filtering
			cardItems.push({ element: cardItem, card, checkbox });
		});

		// Search functionality
		searchInput.addEventListener('input', () => {
			const searchTerm = searchInput.value.toLowerCase();

			cardItems.forEach(item => {
				const frontText = stripMarkdown(item.card.front).toLowerCase();
				const deckName = item.card.deck.toLowerCase();
				const matches = frontText.includes(searchTerm) || deckName.includes(searchTerm);
				item.element.toggleClass('hidden', !matches);
			});

			// Update no results message
			const visibleItems = cardItems.filter(item => !item.element.hasClass('hidden'));
			let noResultsMsg = cardList.querySelector('.quiz-card-no-results') as HTMLElement;

			if (visibleItems.length === 0) {
				if (!noResultsMsg) {
					noResultsMsg = cardList.createDiv({
						text: 'No cards found',
						cls: 'quiz-card-no-results'
					});
				}
				noResultsMsg.removeClass('hidden');
			} else if (noResultsMsg) {
				noResultsMsg.addClass('hidden');
			}
		});

		// Select all button - only affects visible cards
		selectAllBtn.addEventListener('click', (e) => {
			e.preventDefault();
			cardItems.forEach(item => {
				if (!item.element.hasClass('hidden')) {
					selectedCardIds.add(item.card.id);
					item.checkbox.checked = true;
				}
			});
			this.config.selectedCardIds = Array.from(selectedCardIds);
		});

		// Deselect all button - only affects visible cards
		deselectAllBtn.addEventListener('click', (e) => {
			e.preventDefault();
			cardItems.forEach(item => {
				if (!item.element.hasClass('hidden')) {
					selectedCardIds.delete(item.card.id);
					item.checkbox.checked = false;
				}
			});
			this.config.selectedCardIds = Array.from(selectedCardIds);
		});
	}

	async generateQuiz() {
		// Show loading notice (declare outside try so it's accessible in catch)
		let loadingNotice: Notice | null = null;

		try {
			// Validate at least one question type
			if (!this.config.includeMultipleChoice && !this.config.includeFillBlank && !this.config.includeTrueFalse) {
				new Notice('Please select at least one question type');
				return;
			}

			// Get quiz title
			const titleInput = this.contentEl.querySelector('#quiz-title-input') as HTMLInputElement;
			const title = titleInput?.value || 'Untitled Quiz';

			// Get cards
			let cards = this.plugin.storage.getAllCards();

			// Apply card selection filter if AI is enabled and cards are selected
			if (this.config.useAI && this.config.selectedCardIds && this.config.selectedCardIds.length > 0) {
				cards = cards.filter(card => this.config.selectedCardIds!.includes(card.id));
				
				// Also apply deck filter if specified (intersection)
				if (this.config.deckFilter && this.config.deckFilter.length > 0) {
					cards = cards.filter(card =>
						this.config.deckFilter!.some(deck =>
							card.deck.toLowerCase().includes(deck.toLowerCase())
						)
					);
				}

				// Validate that we have cards after filtering
				if (cards.length === 0) {
					new Notice('No cards match your selection. Please select at least one card for AI quiz generation.');
					return;
				}
			} else if (this.config.useAI && this.config.selectedCardIds && this.config.selectedCardIds.length === 0) {
				// AI is enabled but no cards selected
				new Notice('Please select at least one card for AI quiz generation.');
				return;
			} else {
				// Apply deck filter if specified (for traditional quizzes or when no card selection)
				if (this.config.deckFilter && this.config.deckFilter.length > 0) {
					cards = cards.filter(card =>
						this.config.deckFilter!.some(deck =>
							card.deck.toLowerCase().includes(deck.toLowerCase())
						)
					);
				}
			}

			if (cards.length === 0) {
				new Notice('No cards available. Please scan for flashcards first.');
				return;
			}

			// Only limit question count for traditional quizzes
			// AI quizzes can generate more questions than available cards
			if (!this.config.useAI && cards.length < this.config.questionCount) {
				new Notice(`Only ${cards.length} cards available. Generating ${cards.length} questions instead.`);
				this.config.questionCount = cards.length;
			}

			// Show loading notice
			const useVoiceAI = this.plugin.settings.quiz.voiceAI?.enabled;
			loadingNotice = new Notice(
				useVoiceAI
					? 'Transcribing audio and generating quiz...'
					: 'Generating quiz...',
				0
			);

			// Generate questions
			let questions;
			let generationMethod: 'traditional' | 'ai-generated';

			if (this.config.useAI && this.plugin.settings.quiz.enabled) {
				// Use AI generator
				generationMethod = 'ai-generated';
				const aiGenerator = new AIQuizGenerator(this.plugin.settings.quiz, this.app, this.plugin.logger);
				questions = await aiGenerator.generateQuestions(cards, this.config);
				loadingNotice.hide();
				new Notice(useVoiceAI ? 'Quiz generated with AI (audio-aware)! 🤖' : 'Quiz generated with AI! 🤖');
			} else {
				// Use traditional generator
				generationMethod = 'traditional';
				const traditionalGenerator = new TraditionalQuizGenerator();
				questions = traditionalGenerator.generateQuestions(cards, this.config);
				loadingNotice.hide();
				new Notice('Quiz generated! 📝');
			}

			// Create quiz
			const quiz = createQuiz(
				title,
				questions,
				cards.map(c => c.id),
				this.config,
				generationMethod
			);

			// Save quiz
			await this.plugin.quizStorage.addQuiz(quiz);

			// Open quiz view
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: 'flashly-quiz-view',
				active: true
			});

			// Load the quiz into the view
			const view = leaf.view;
			if (view && 'loadQuiz' in view) {
				(view as unknown as QuizView).loadQuiz(quiz);
			}

			this.close();
		} catch (error) {
			if (loadingNotice) {
				loadingNotice.hide();
			}
			console.error('Failed to generate quiz:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice(`Failed to generate quiz: ${errorMessage}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class GenerateQuizCommand {
	constructor(
		private app: App,
		private plugin: FlashlyPlugin
	) {}

	getId(): string {
		return 'generate-quiz';
	}

	getName(): string {
		return 'Generate quiz';
	}

	getCallback(): () => void {
		return () => {
			new GenerateQuizModal(this.app, this.plugin).open();
		};
	}
}
