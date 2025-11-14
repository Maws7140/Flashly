/**
 * Generate Quiz Command
 * Allows users to create quizzes from their flashcards
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { QuizConfig, DEFAULT_QUIZ_CONFIG, createQuiz, Quiz } from '../models/quiz';
import { TraditionalQuizGenerator } from '../quiz/traditional-quiz-generator';
import { AIQuizGenerator } from '../quiz/ai-quiz-generator';

interface QuizView {
	loadQuiz(quiz: Quiz): void;
}

class GenerateQuizModal extends Modal {
	plugin: FlashlyPlugin;
	config: QuizConfig;

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

	async generateQuiz() {
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

			// Apply deck filter if specified
			if (this.config.deckFilter && this.config.deckFilter.length > 0) {
				cards = cards.filter(card =>
					this.config.deckFilter!.some(deck =>
						card.deck.toLowerCase().includes(deck.toLowerCase())
					)
				);
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
			const loadingNotice = new Notice('Generating quiz...', 0);

			// Generate questions
			let questions;
			let generationMethod: 'traditional' | 'ai-generated';

			if (this.config.useAI && this.plugin.settings.quiz.enabled) {
				// Use AI generator
				generationMethod = 'ai-generated';
				const aiGenerator = new AIQuizGenerator(this.plugin.settings.quiz, this.plugin.logger);
				questions = await aiGenerator.generateQuestions(cards, this.config);
				loadingNotice.hide();
				new Notice('Quiz generated with AI! 🤖');
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
			console.error('Failed to generate quiz:', error);
			new Notice(`Failed to generate quiz: ${error.message}`);
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
