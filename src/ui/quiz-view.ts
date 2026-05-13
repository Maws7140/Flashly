/**
 * Quiz View
 * Interactive quiz interface for taking quizzes
 */

import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Component, Notice, App } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { Quiz, QuizQuestion, checkAnswer, calculateQuizScore, QuizMatchPair, QuizAnswer } from '../models/quiz';
import { FSRSScheduler } from '../scheduler/fsrs-scheduler';
import { SM2Scheduler } from '../scheduler/sm2-scheduler';
import { SchedulerStrategy } from '../scheduler/scheduler-types';
import { Rating } from 'ts-fsrs';
import { convertAudioWikilinks, postProcessAudioElements } from '../utils/audio-utils';

export const QUIZ_VIEW_TYPE = 'flashly-quiz-view';

interface ObsidianApp extends App {
	commands: {
		executeCommandById(commandId: string): void;
	};
}

export class QuizView extends ItemView {
	plugin: FlashlyPlugin;
	currentQuiz: Quiz | null = null;
	currentQuestionIndex = 0;
	private keydownHandler: (evt: KeyboardEvent) => void;
	private component: Component | null = null;
	private debounceTimer: number | null = null;
	private selectedMatchItem: { side: 'left' | 'right'; value: string; sourceCardId?: string } | null = null;
	private matchLayoutCache: Map<string, { left: QuizMatchPair[]; right: QuizMatchPair[] }> = new Map();

	// Learn mode state
	private learnModeEnabled = false;
	private questionQueue: number[] = [];
	private currentQueuePosition = 0;
	private answeredQuestions: Set<number> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: FlashlyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.keydownHandler = this.handleKeydown.bind(this);
	}

	getViewType(): string {
		return QUIZ_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Quiz';
	}

	getIcon(): string {
		return 'help-circle';
	}



	async onOpen(): Promise<void> {
		this.component = new Component();
		this.component.load();
		void this.render();
		document.addEventListener('keydown', this.keydownHandler);
	}


	async onClose(): Promise<void> {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.component) {
			this.component.unload();
			this.component = null;
		}
		document.removeEventListener('keydown', this.keydownHandler);
		this.containerEl.empty();
	}

	/**
	 * Load and start a quiz
	 */
	loadQuiz(quiz: Quiz): void {
		this.currentQuiz = quiz;
		this.learnModeEnabled = quiz.config.learnMode ?? false;

		if (this.learnModeEnabled) {
			// Check if resuming a saved learn mode quiz
			if (quiz.learnModeStats?.savedQueue && quiz.learnModeStats?.savedQueuePosition !== undefined) {
				// Resume from saved state
				this.questionQueue = [...quiz.learnModeStats.savedQueue];
				this.currentQueuePosition = quiz.learnModeStats.savedQueuePosition;
				this.answeredQuestions = new Set(quiz.learnModeStats.savedAnsweredQuestions || []);
			} else {
				// Initialize question queue with all question indices
				this.questionQueue = Array.from({ length: quiz.questions.length }, (_, i) => i);
				this.currentQueuePosition = 0;
				this.answeredQuestions.clear();
			}
		} else {
			// Resume from saved position if available
			this.currentQuestionIndex = quiz.currentQuestionIndex ?? 0;
		}

		this.selectedMatchItem = null;
		this.matchLayoutCache.clear();

		void this.render();
	}

	/**
	 * Auto-save quiz progress
	 */
	private async saveQuizProgress(): Promise<void> {
		if (!this.currentQuiz) return;

		// Don't save if quiz is already completed
		if (this.currentQuiz.completed) return;

		try {
			// Update last accessed timestamp
			this.currentQuiz.lastAccessed = new Date();

			// Update current state
			this.currentQuiz.state = 'in-progress';

			// Save current position
			this.currentQuiz.currentQuestionIndex = this.currentQuestionIndex;

			// Save learn mode state if applicable
			if (this.learnModeEnabled) {
				if (!this.currentQuiz.learnModeStats) {
					this.currentQuiz.learnModeStats = {
						totalAttempts: 0,
						questionsRequeued: 0,
						firstPassCorrect: 0
					};
				}
				this.currentQuiz.learnModeStats.savedQueue = [...this.questionQueue];
				this.currentQuiz.learnModeStats.savedQueuePosition = this.currentQueuePosition;
				this.currentQuiz.learnModeStats.savedAnsweredQuestions = Array.from(this.answeredQuestions);
			}

			// Save to storage
			await this.plugin.quizStorage.updateQuiz(this.currentQuiz);
			this.plugin.logger.debug('Quiz progress saved:', this.currentQuiz.id);
		} catch (error) {
			console.error('Failed to save quiz progress:', error);
			// Don't show notice to avoid disrupting the user experience
		}
	}

	/**
	 * Get current question (supports both normal and learn mode)
	 */
	private getCurrentQuestion(): QuizQuestion | null {
		if (!this.currentQuiz) return null;

		if (this.learnModeEnabled) {
			const qIndex = this.questionQueue[this.currentQueuePosition];
			return this.currentQuiz.questions[qIndex];
		}
		return this.currentQuiz.questions[this.currentQuestionIndex];
	}

	/**
	 * Get current question index (supports both normal and learn mode)
	 */
	private getCurrentQuestionIndex(): number {
		if (this.learnModeEnabled) {
			return this.questionQueue[this.currentQueuePosition];
		}
		return this.currentQuestionIndex;
	}

	private async render(): Promise<void> {
		// Save scroll position before re-rendering
		const scrollY = this.containerEl.scrollTop;

		// Clean up old component and create fresh one for this render
		if (this.component) {
			this.component.unload();
		}
		this.component = new Component();
		this.component.load();

		const container = this.containerEl;
		container.empty();
		container.addClass('flashly-quiz-view');

		if (!this.currentQuiz) {
			this.renderNoQuiz(container);
			// Restore scroll position
			requestAnimationFrame(() => {
				this.containerEl.scrollTop = scrollY;
			});
			return;
		}

		if (this.currentQuiz.completed) {
			this.renderResults(container);
			// Restore scroll position
			requestAnimationFrame(() => {
				this.containerEl.scrollTop = scrollY;
			});
			return;
		}

		await this.renderQuestion(container);

		// Restore scroll position after re-rendering
		requestAnimationFrame(() => {
			this.containerEl.scrollTop = scrollY;
		});
	}

	private renderNoQuiz(container: HTMLElement): void {
		const emptyState = container.createDiv({ cls: 'quiz-empty-state' });
		const emptyIcon = emptyState.createDiv({ cls: 'quiz-empty-icon' });
		setIcon(emptyIcon, 'file-question');
		emptyState.createEl('h3', { text: 'No quiz loaded', cls: 'quiz-empty-title' });
		emptyState.createEl('p', {
			text: 'Use the "generate quiz" command to create a new quiz.',
			cls: 'quiz-empty-message'
		});
	}

	private async renderQuestion(container: HTMLElement): Promise<void> {
		if (!this.currentQuiz) return;

		const question = this.getCurrentQuestion();
		if (!question) return;

		// Header
		const header = container.createDiv({ cls: 'quiz-header' });
		header.createEl('h2', { text: this.currentQuiz.title, cls: 'quiz-title' });

		// Progress
		const progress = container.createDiv({ cls: 'quiz-progress' });

		if (this.learnModeEnabled) {
			// Learn mode progress
			const queueRemaining = this.questionQueue.length - this.currentQueuePosition;
			const totalChecked = this.answeredQuestions.size;
			const totalQuestions = this.currentQuiz.totalQuestions;

			const progressText = progress.createDiv({ cls: 'quiz-progress-text quiz-progress-learn-mode' });
			progressText.setText(`${queueRemaining} remaining in queue | ${totalChecked} of ${totalQuestions} checked`);
		} else {
			// Normal mode progress
			const progressBar = progress.createDiv({ cls: 'quiz-progress-bar' });
			const progressFill = progressBar.createDiv({ cls: 'quiz-progress-fill' });
			const percentage = ((this.currentQuestionIndex + 1) / this.currentQuiz.totalQuestions) * 100;
			progressFill.setCssProps({ '--progress-width': `${percentage}%` });

			const progressText = progress.createDiv({ cls: 'quiz-progress-text' });
			progressText.setText(`Question ${this.currentQuestionIndex + 1} of ${this.currentQuiz.totalQuestions}`);
		}

		// Question content
		const questionContainer = container.createDiv({ cls: 'quiz-question-container' });

		// Question type badge
		const typeBadge = questionContainer.createDiv({ cls: 'quiz-type-badge' });
		typeBadge.setText(this.getQuestionTypeLabel(question.type));
		typeBadge.addClass(`quiz-type-${question.type}`);

		// Question prompt - render markdown
		const promptContainer = questionContainer.createDiv({ cls: 'quiz-question-prompt' });
		const promptContent = promptContainer.createDiv({ cls: 'quiz-prompt-content' });
		if (this.component) {
			// Pre-process audio wikilinks in prompt
			const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
			const promptMarkdown = convertAudioWikilinks(question.prompt, sourcePath, this.app);
			await MarkdownRenderer.render(this.app, promptMarkdown, promptContent, sourcePath, this.component);
			// Post-process to fix audio element paths
			postProcessAudioElements(promptContent, this.app, sourcePath);
		}

		// Answer area
		const answerArea = questionContainer.createDiv({ cls: 'quiz-answer-area' });

		if (question.type === 'multiple-choice' && question.options) {
			await this.renderMultipleChoice(answerArea, question);
		} else if (question.type === 'fill-blank') {
			this.renderFillBlank(answerArea, question);
		} else if (question.type === 'true-false' && question.options) {
			await this.renderTrueFalse(answerArea, question);
		} else if (question.type === 'audio-prompt') {
			this.renderAudioPrompt(answerArea, question);
		} else if (question.type === 'match') {
			await this.renderMatch(answerArea, question);
		}

		// Check if answer area needs scroll indicator
		setTimeout(() => {
			if (answerArea.scrollHeight > answerArea.clientHeight) {
				answerArea.addClass('has-scroll');
			}
		}, 100);

		// Learn mode feedback (if answer has been checked)
		if (this.learnModeEnabled && question.checked) {
			await this.renderLearnModeFeedback(questionContainer, question);
		}

		// Navigation
		const nav = container.createDiv({ cls: 'quiz-navigation' });

		if (this.learnModeEnabled) {
			// Learn mode navigation
			if (!question.checked) {
				// Show "Check Answer" button
				const checkBtn = nav.createEl('button', {
					text: 'Check answer',
					cls: 'quiz-nav-btn quiz-nav-primary'
				});

				checkBtn.addEventListener('click', (e) => {
					e.preventDefault();
					void this.handleCheckAnswer();
				});
			} else {
				// Show "Continue" button
				const continueBtn = nav.createEl('button', {
					text: 'Continue →',
					cls: 'quiz-nav-btn quiz-nav-primary'
				});

				continueBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.handleLearnModeContinue();
				});
			}
		} else {
			// Normal mode navigation
			if (this.currentQuestionIndex > 0) {
				const prevBtn = nav.createEl('button', { text: '← previous', cls: 'quiz-nav-btn' });
				prevBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.currentQuestionIndex--;
					void this.saveQuizProgress();
					void this.render();
				});
			}

			const nextBtn = nav.createEl('button', {
				text: this.currentQuestionIndex < this.currentQuiz.totalQuestions - 1 ? 'Next →' : 'Finish quiz',
				cls: 'quiz-nav-btn quiz-nav-primary'
			});

			nextBtn.addEventListener('click', (e) => {
				e.preventDefault();
				if (!this.currentQuiz) return;

				if (this.currentQuestionIndex < this.currentQuiz.totalQuestions - 1) {
					this.currentQuestionIndex++;
					void this.saveQuizProgress();
					void this.render();
				} else {
					void this.finishQuiz();
				}
			});
		}

		// Keyboard shortcuts hint
		const keyboardHints = container.createDiv({ cls: 'quiz-keyboard-hints' });
		keyboardHints.createEl('span', { text: 'Shortcuts: ', cls: 'quiz-hint-label' });

		const hints = [
			'←/→ navigate',
			'Enter/space next',
			'Esc close'
		];

		if (question.type === 'multiple-choice' || question.type === 'true-false') {
			if (question.type === 'multiple-choice') {
				hints.push('1-4 select');
			} else {
				hints.push('T/F select');
			}
		} else if (question.type === 'match') {
			hints.push('click one term and one definition');
		}

		hints.forEach((hint, index) => {
			if (index > 0) {
				keyboardHints.createSpan({ text: ' • ', cls: 'quiz-hint-separator' });
			}
			keyboardHints.createSpan({ text: hint, cls: 'quiz-hint-item' });
		});
	}

	private async renderMultipleChoice(container: HTMLElement, question: QuizQuestion): Promise<void> {
		if (!question.options) return;

		for (let index = 0; index < question.options.length; index++) {
			const option = question.options[index];
			const optionBtn = container.createEl('button', {
				cls: 'quiz-option-btn'
			});

			const optionContent = optionBtn.createDiv({ cls: 'quiz-option-content' });

			// Render markdown in options
			if (this.component) {
				// Pre-process audio wikilinks in option
				const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
				const optionMarkdown = convertAudioWikilinks(option, sourcePath, this.app);
				await MarkdownRenderer.render(this.app, optionMarkdown, optionContent, sourcePath, this.component);
				// Post-process to fix audio element paths
				postProcessAudioElements(optionContent, this.app, sourcePath);
			}

			if (question.userAnswer === index) {
				optionBtn.addClass('quiz-option-selected');
			}

			optionBtn.addEventListener('click', (e) => {
				e.preventDefault();
				question.userAnswer = index;
				void this.saveQuizProgress();
				void this.render();
			});
		}
	}


	private renderFillBlank(container: HTMLElement, question: QuizQuestion): void {
		const input = container.createEl('input', {
			type: 'text',
			cls: 'quiz-input',
			placeholder: 'Type your answer...'
		});

		if (question.userAnswer !== undefined) {
			input.value = String(question.userAnswer);
		}

		// Debounce input to avoid excessive state updates
		input.addEventListener('input', (e) => {
			const value = (e.target as HTMLInputElement).value;

			// Clear existing timer
			if (this.debounceTimer !== null) {
				window.clearTimeout(this.debounceTimer);
			}

			// Update immediately in question object but don't re-render
			question.userAnswer = value;

			// Debounced save (save after 500ms of no typing)
			this.debounceTimer = window.setTimeout(() => {
				void this.saveQuizProgress();
			}, 500);
		});

		// Auto-focus
		setTimeout(() => input.focus(), 100);
	}

	/**
	 * Render audio-prompt question (user listens to audio, types answer)
	 */
	private renderAudioPrompt(container: HTMLElement, question: QuizQuestion): void {
		// Audio is already rendered in the prompt, so we just need an input field
		const input = container.createEl('input', {
			type: 'text',
			cls: 'quiz-input',
			placeholder: 'Type your answer after listening...'
		});

		if (question.userAnswer !== undefined) {
			input.value = String(question.userAnswer);
		}

		// Debounce input to avoid excessive state updates
		input.addEventListener('input', (e) => {
			const value = (e.target as HTMLInputElement).value;

			// Clear existing timer
			if (this.debounceTimer !== null) {
				window.clearTimeout(this.debounceTimer);
			}

			// Update immediately in question object but don't re-render
			question.userAnswer = value;

			// Debounced save (save after 500ms of no typing)
			this.debounceTimer = window.setTimeout(() => {
				void this.saveQuizProgress();
			}, 500);
		});

		// Auto-focus
		setTimeout(() => input.focus(), 100);
	}

	private async renderTrueFalse(container: HTMLElement, question: QuizQuestion): Promise<void> {
		if (!question.options) return;

		for (const option of question.options) {
			const optionBtn = container.createEl('button', {
				cls: 'quiz-option-btn quiz-option-tf'
			});

			const optionContent = optionBtn.createDiv({ cls: 'quiz-option-content' });

			// Render markdown in options
			if (this.component) {
				// Pre-process audio wikilinks in option
				const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
				const optionMarkdown = convertAudioWikilinks(option, sourcePath, this.app);
				await MarkdownRenderer.render(this.app, optionMarkdown, optionContent, sourcePath, this.component);
				// Post-process to fix audio element paths
				postProcessAudioElements(optionContent, this.app, sourcePath);
			}

			const answerValue = option.toLowerCase();
			if (question.userAnswer === answerValue) {
				optionBtn.addClass('quiz-option-selected');
			}

			optionBtn.addEventListener('click', (e) => {
				e.preventDefault();
				question.userAnswer = answerValue;
				void this.saveQuizProgress();
				void this.render();
			});
		}
	}

	private async renderMatch(container: HTMLElement, question: QuizQuestion): Promise<void> {
		const pairs = this.getMatchPairs(question);
		if (pairs.length === 0) {
			container.createDiv({ text: 'No match pairs available.', cls: 'quiz-warning' });
			return;
		}

		// Ensure layout is initialized (shuffle terms and definitions together)
		if (!this.matchLayoutCache.has(question.id)) {
			const items: { text: string; side: 'left' | 'right'; sourceCardId?: string }[] = [];
			pairs.forEach(p => {
				items.push({ text: p.left, side: 'left', sourceCardId: p.sourceCardId });
				items.push({ text: p.right, side: 'right', sourceCardId: p.sourceCardId });
			});
			
			// Shuffle the items
			for (let i = items.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[items[i], items[j]] = [items[j], items[i]];
			}
			
			// Store in cache (reusing the interface, but with a flat structure)
			this.matchLayoutCache.set(question.id, { left: items as any, right: [] });
		}

		const layoutItems: any[] = (this.matchLayoutCache.get(question.id) as any).left;
		const currentAnswer = Array.isArray(question.userAnswer) ? question.userAnswer : [];
		
		const matchedTexts = new Set<string>();
		currentAnswer.forEach((pair: QuizMatchPair) => {
			matchedTexts.add(pair.left.trim().toLowerCase());
			matchedTexts.add(pair.right.trim().toLowerCase());
		});

		const board = container.createDiv({ cls: 'quiz-match-board' });
		const selectedValue = this.selectedMatchItem?.value.trim().toLowerCase() ?? null;

		for (const item of layoutItems) {
			const isMatched = matchedTexts.has(item.text.trim().toLowerCase());
			if (isMatched) continue; // Don't render matched items

			const itemBtn = board.createEl('button', { cls: 'quiz-match-item' });
			const itemContent = itemBtn.createDiv({ cls: 'quiz-match-item-content' });

			if (this.component) {
				const sourcePath = item.sourceCardId ? this.getSourceCardPath(item.sourceCardId) : '';
				const itemMarkdown = convertAudioWikilinks(item.text, sourcePath, this.app);
				await MarkdownRenderer.render(this.app, itemMarkdown, itemContent, sourcePath, this.component);
				postProcessAudioElements(itemContent, this.app, sourcePath);
			} else {
				itemContent.setText(item.text);
			}

			if (selectedValue === item.text.trim().toLowerCase()) {
				itemBtn.addClass('quiz-match-item-selected');
			}

			itemBtn.addEventListener('click', (e) => {
				e.preventDefault();
				this.handleMatchSelectionRedesigned(question, item.side, item.text, item.sourceCardId, itemBtn);
			});
		}

		// If all items are matched, show completion message or auto-advance
		if (matchedTexts.size === layoutItems.length && layoutItems.length > 0) {
			const emptyMessage = container.createDiv({ cls: 'quiz-match-complete-msg' });
			emptyMessage.setText('All matched! Press continue.');
		}
	}

	private async handleMatchSelectionRedesigned(
		question: QuizQuestion, 
		side: 'left' | 'right', 
		value: string, 
		sourceCardId: string | undefined,
		element: HTMLElement
	): Promise<void> {
		const currentAnswer = Array.isArray(question.userAnswer) ? [...question.userAnswer] : [];
		const normalizedValue = value.trim().toLowerCase();

		// Case 1: First selection
		if (!this.selectedMatchItem) {
			this.selectedMatchItem = { side, value, sourceCardId };
			// Store the element for mismatch animation
			(this as any).selectedElement = element;
			void this.render();
			return;
		}

		// Case 2: Clicking the same item again
		if (this.selectedMatchItem.value.trim().toLowerCase() === normalizedValue) {
			this.selectedMatchItem = null;
			(this as any).selectedElement = null;
			void this.render();
			return;
		}

		// Case 3: Match attempt
		const first = this.selectedMatchItem;
		const second = { side, value, sourceCardId };
		const pairs = this.getMatchPairs(question);
		
		// Check if this is a correct pair
		const isCorrect = pairs.some(p => 
			(p.left.trim().toLowerCase() === first.value.trim().toLowerCase() && p.right.trim().toLowerCase() === second.value.trim().toLowerCase()) ||
			(p.right.trim().toLowerCase() === first.value.trim().toLowerCase() && p.left.trim().toLowerCase() === second.value.trim().toLowerCase())
		) || (first.sourceCardId === second.sourceCardId && first.sourceCardId !== undefined);

		if (isCorrect) {
			// Success! Add to matched pairs
			const left = first.side === 'left' ? first.value : second.value;
			const right = first.side === 'right' ? first.value : second.value;
			
			currentAnswer.push({ left, right, sourceCardId: first.sourceCardId });
			question.userAnswer = currentAnswer;
			
			// Visual feedback: animate success
			element.addClass('quiz-match-item-matched');
			if ((this as any).selectedElement) {
				(this as any).selectedElement.addClass('quiz-match-item-matched');
			}
			
			this.selectedMatchItem = null;
			(this as any).selectedElement = null;
			
			void this.saveQuizProgress();
			// Delay re-render to allow animation to play
			setTimeout(() => void this.render(), 400);
		} else {
			// Fail! Visual feedback: shake and reset
			element.addClass('quiz-match-item-incorrect');
			if ((this as any).selectedElement) {
				(this as any).selectedElement.addClass('quiz-match-item-incorrect');
			}
			
			this.selectedMatchItem = null;
			const prevElement = (this as any).selectedElement;
			(this as any).selectedElement = null;
			
			// Shake animation duration
			setTimeout(() => {
				element.removeClass('quiz-match-item-incorrect');
				if (prevElement) prevElement.removeClass('quiz-match-item-incorrect');
				void this.render();
			}, 400);
		}
	}

	/**
	 * Handle answer check in learn mode
	 */
	private async handleCheckAnswer(): Promise<void> {
		const question = this.getCurrentQuestion();
		const qIndex = this.getCurrentQuestionIndex();

		if (!question) return;

		if (!this.hasProvidedAnswer(question)) {
			new Notice('Please select an answer first');
			return;
		}

		// Check the answer
		question.checked = true;
		const userAnswer = question.userAnswer;
		if (userAnswer === undefined || userAnswer === null) {
			return;
		}
		question.correct = checkAnswer(question, userAnswer);
		question.attemptCount = (question.attemptCount || 0) + 1;

		this.answeredQuestions.add(qIndex);

		// If incorrect, re-queue the question (add to end)
		if (!question.correct) {
			this.questionQueue.push(qIndex);
		}

		// Save progress
		await this.saveQuizProgress();

		// Re-render to show feedback
		await this.render();
	}

	/**
	 * Handle continue in learn mode
	 */
	private handleLearnModeContinue(): void {
		// Move to next question in queue
		this.currentQueuePosition++;

		// Check if queue is complete
		if (this.currentQueuePosition >= this.questionQueue.length) {
			void this.finishLearnModeQuiz();
		} else {
			// Reset state for the next question if it's a retry
			const nextQuestion = this.getCurrentQuestion();
			if (nextQuestion && nextQuestion.checked && !nextQuestion.correct) {
				// This is a re-queued question that was answered incorrectly before
				// Reset it so user can try again
				nextQuestion.checked = false;
				nextQuestion.userAnswer = undefined;
			}

			// Save progress
			void this.saveQuizProgress();

			void this.render();
		}
	}

	/**
	 * Finish learn mode quiz (all questions answered correctly)
	 */
	private async finishLearnModeQuiz(): Promise<void> {
		if (!this.currentQuiz) return;

		// Calculate stats
		const totalQuestions = this.currentQuiz.questions.length;
		const totalAttempts = this.currentQuiz.questions.reduce((sum, q) => sum + (q.attemptCount || 1), 0);
		const questionsRequeued = this.currentQuiz.questions.filter(q => (q.attemptCount || 1) > 1).length;
		const firstPassCorrect = this.currentQuiz.questions.filter(q => (q.attemptCount || 1) === 1).length;

		// Set quiz completion data
		this.currentQuiz.completed = new Date();
		this.currentQuiz.score = 100; // Learn mode always ends at 100%
		this.currentQuiz.correctCount = totalQuestions;
		this.currentQuiz.state = 'completed';

		// Store learn mode stats
		this.currentQuiz.learnModeStats = {
			totalAttempts,
			questionsRequeued,
			firstPassCorrect
		};

		// Save quiz
		try {
			await this.plugin.quizStorage.updateQuiz(this.currentQuiz);
			this.plugin.logger.debug('Learn mode quiz completed:', this.currentQuiz.id);
		} catch (error) {
			console.error('Failed to save learn mode quiz:', error);
			new Notice('Failed to save quiz results');
		}

		// Apply scheduling changes for studied cards so the FSRS/SM2 planner
		// treats this deck as having been studied. We create a scheduler
		// matching user settings and apply a conservative rating based on
		// per-question attempts (first-pass correct -> Good, otherwise Hard).
		try {
			const schedulerType = this.plugin.settings.review.scheduler;
			const scheduler: SchedulerStrategy = schedulerType === 'sm2' ? new SM2Scheduler() : new FSRSScheduler();

			// Collect per-card attempt counts from quiz questions
			const perCardAttempts: Map<string, number> = new Map();
			for (const q of this.currentQuiz.questions) {
				if (q.sourceCardId) {
					perCardAttempts.set(q.sourceCardId, Math.max(1, q.attemptCount || 1));
				}
			}

			let updatedCount = 0;
			for (const [cardId, attempts] of perCardAttempts.entries()) {
				const card = this.plugin.storage.getCard(cardId);
				if (!card) continue;

				const rating = attempts === 1 ? Rating.Good : Rating.Hard;
				try {
					const outcome = scheduler.applyRating(card, rating, new Date());
					this.plugin.storage.updateCard(card.id, { fsrsCard: outcome.updatedCard.fsrsCard });
					updatedCount++;
				} catch (err) {
					this.plugin.logger.debug('Failed to apply scheduler rating for card', cardId, err);
				}
			}

			if (updatedCount > 0) {
				await this.plugin.storage.save();
				if (this.plugin) {
					this.plugin.refreshBrowserViews();
				}
				this.plugin.logger.debug(`Applied scheduling to ${updatedCount} cards from learn-mode quiz`);
			}
		} catch (err) {
			this.plugin.logger.debug('Error while updating scheduling after learn-mode quiz', err);
		}

		// Render results
		await this.render();
	}

	/**
	 * Render feedback for learn mode
	 */
	private async renderLearnModeFeedback(container: HTMLElement, question: QuizQuestion): Promise<void> {
		const feedbackCard = container.createDiv({ cls: 'quiz-learn-feedback' });

		if (question.correct) {
			// Correct answer feedback
			feedbackCard.addClass('quiz-learn-feedback-correct');
			feedbackCard.createEl('h3', {
				text: '✓ correct!',
				cls: 'quiz-learn-feedback-title'
			});
		} else {
			// Incorrect answer feedback
			feedbackCard.addClass('quiz-learn-feedback-incorrect');
			feedbackCard.createEl('h3', {
				text: '✗ incorrect',
				cls: 'quiz-learn-feedback-title'
			});

			// Show user's answer
			const userAnswerDiv = feedbackCard.createDiv({ cls: 'quiz-learn-your-answer' });
			userAnswerDiv.createEl('strong', { text: 'Your answer: ' });
			const userAnswerContent = userAnswerDiv.createDiv({ cls: 'quiz-answer-content' });
			if (this.component) {
				const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
				const userAnswerText = this.formatAnswer(question, question.userAnswer!);
				const userAnswerMarkdown = convertAudioWikilinks(userAnswerText, sourcePath, this.app);
				await MarkdownRenderer.render(this.app, userAnswerMarkdown, userAnswerContent, sourcePath, this.component);
				postProcessAudioElements(userAnswerContent, this.app, sourcePath);
			}

			// Show correct answer
			const correctAnswerDiv = feedbackCard.createDiv({ cls: 'quiz-learn-correct-answer' });
			correctAnswerDiv.createEl('strong', { text: 'Correct answer: ' });
			const correctAnswerContent = correctAnswerDiv.createDiv({ cls: 'quiz-answer-content' });
			if (this.component) {
				const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
				const correctAnswerText = this.formatAnswer(question, question.correctAnswer);
				const correctAnswerMarkdown = convertAudioWikilinks(correctAnswerText, sourcePath, this.app);
				await MarkdownRenderer.render(this.app, correctAnswerMarkdown, correctAnswerContent, sourcePath, this.component);
				postProcessAudioElements(correctAnswerContent, this.app, sourcePath);
			}

			// Show explanation if available
			if (question.explanation) {
				const explanationDiv = feedbackCard.createDiv({ cls: 'quiz-learn-explanation' });
				explanationDiv.createEl('strong', { text: 'Explanation:' });
				const explanationContent = explanationDiv.createDiv({ cls: 'quiz-explanation-content' });
				if (this.component) {
					const sourcePath = question.sourceCardId ? this.getSourceCardPath(question.sourceCardId) : '';
					const explanationMarkdown = convertAudioWikilinks(question.explanation, sourcePath, this.app);
					await MarkdownRenderer.render(this.app, explanationMarkdown, explanationContent, sourcePath, this.component);
					postProcessAudioElements(explanationContent, this.app, sourcePath);
				}
			}

			// Show re-queue notice
			feedbackCard.createDiv({
				text: 'this question will appear again later.',
				cls: 'quiz-learn-requeue-notice'
			});
		}
	}

	/**
	 * Format answer for display
	 */
	private formatAnswer(question: QuizQuestion, answer: QuizAnswer): string {
		if (Array.isArray(answer)) {
			return answer.map(pair => `${pair.left} ↔ ${pair.right}`).join('; ');
		}

		if (question.type === 'multiple-choice' && typeof answer === 'number' && question.options) {
			return question.options[answer] || String(answer);
		}
		return String(answer);
	}

	private async finishQuiz(): Promise<void> {
		if (!this.currentQuiz) return;

		// Grade all questions
		this.currentQuiz.questions.forEach(question => {
			if (question.userAnswer !== undefined) {
				question.correct = checkAnswer(question, question.userAnswer);
			} else {
				question.correct = false;
			}
		});

		// Calculate score
		const { score, correctCount } = calculateQuizScore(this.currentQuiz);
		this.currentQuiz.score = score;
		this.currentQuiz.correctCount = correctCount;
		this.currentQuiz.completed = new Date();
		this.currentQuiz.state = 'completed';

		// Save quiz
		const quizStorage = this.plugin.quizStorage;
		try {
			await quizStorage.updateQuiz(this.currentQuiz);
			this.plugin.logger.debug('Quiz updated successfully:', this.currentQuiz.id, 'Completed:', this.currentQuiz.completed);

			// Verify it was saved
			const savedQuiz = quizStorage.getQuiz(this.currentQuiz.id);
			this.plugin.logger.debug('Quiz retrieved after save:', savedQuiz?.completed);
		} catch (error) {
			console.error('Failed to update quiz:', error);
			new Notice('Failed to save quiz results');
		}

		// Render results
		void this.render();
	}

	private renderResults(container: HTMLElement): void {
		if (!this.currentQuiz) return;

		const resultsContainer = container.createDiv({ cls: 'quiz-results-container' });

		// Score display
		const scoreCard = resultsContainer.createDiv({ cls: 'quiz-score-card' });
		scoreCard.createEl('h2', { text: 'Quiz complete!', cls: 'quiz-results-title' });

		const scoreDisplay = scoreCard.createDiv({ cls: 'quiz-score-display' });
		const scoreValue = scoreDisplay.createDiv({ cls: 'quiz-score-value' });
		scoreValue.setText(`${this.currentQuiz.score}%`);

		const scoreLabel = scoreDisplay.createDiv({ cls: 'quiz-score-label' });
		scoreLabel.setText(`${this.currentQuiz.correctCount} / ${this.currentQuiz.totalQuestions} correct`);

		// Performance message
		const message = scoreCard.createDiv({ cls: 'quiz-performance-message' });
		if (this.currentQuiz.score! >= 90) {
			message.setText('Excellent work!');
		} else if (this.currentQuiz.score! >= 70) {
			message.setText('Good job!');
		} else if (this.currentQuiz.score! >= 50) {
			message.setText('Keep practicing!');
		} else {
			message.setText('Review the material and try again!');
		}

		// Question review
		const reviewSection = resultsContainer.createDiv({ cls: 'quiz-review-section' });
		reviewSection.createEl('h3', { text: 'Review answers', cls: 'quiz-review-title' });

		this.currentQuiz.questions.forEach((question, index) => {
			const questionCard = reviewSection.createDiv({ cls: 'quiz-review-question' });
			questionCard.addClass(question.correct ? 'quiz-review-correct' : 'quiz-review-incorrect');

			const questionHeader = questionCard.createDiv({ cls: 'quiz-review-header' });
			questionHeader.createSpan({ text: `Q${index + 1}: `, cls: 'quiz-review-number' });
			questionHeader.createSpan({ text: question.prompt, cls: 'quiz-review-prompt' });

			const icon = questionHeader.createSpan({ cls: 'quiz-review-icon' });
			icon.setText(question.correct ? '✓' : '✗');

			// Show answer details
			if (!question.correct) {
				const answerDetails = questionCard.createDiv({ cls: 'quiz-answer-details' });

				const yourAnswer = answerDetails.createDiv({ cls: 'quiz-your-answer' });
				yourAnswer.createSpan({ text: 'Your answer: ', cls: 'quiz-answer-label' });
				yourAnswer.createSpan({ text: String(this.getAnswerDisplay(question, question.userAnswer)) });

				const correctAnswer = answerDetails.createDiv({ cls: 'quiz-correct-answer' });
				correctAnswer.createSpan({ text: 'Correct answer: ', cls: 'quiz-answer-label' });
				correctAnswer.createSpan({ text: String(this.getAnswerDisplay(question, question.correctAnswer)) });
			}

			// Show explanation if available
			if (question.explanation) {
				const explanation = questionCard.createDiv({ cls: 'quiz-explanation' });
				explanation.createEl('strong', { text: 'Explanation: ' });
				explanation.createSpan({ text: question.explanation });
			}
		});

		// Actions
		const actions = resultsContainer.createDiv({ cls: 'quiz-results-actions' });

		const newQuizBtn = actions.createEl('button', {
			text: 'New quiz',
			cls: 'quiz-action-btn quiz-btn-primary'
		});
		const newQuizIcon = newQuizBtn.createSpan({ cls: 'quiz-btn-icon' });
		setIcon(newQuizIcon, 'refresh-cw');
		newQuizBtn.prepend(newQuizIcon);
		newQuizBtn.addEventListener('click', (e) => {
			e.preventDefault();
			// Trigger the generate-quiz command
			(this.app as ObsidianApp).commands.executeCommandById('flashly:generate-quiz');
		});

		const closeBtn = actions.createEl('button', {
			text: 'Close',
			cls: 'quiz-action-btn'
		});
		closeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			this.leaf.detach();
		});
	}

	private getAnswerDisplay(question: QuizQuestion, answer: QuizAnswer | undefined): string {
		if (answer === undefined || answer === null) {
			return '(no answer)';
		}

		if (Array.isArray(answer)) {
			return answer.map(pair => `${pair.left} ↔ ${pair.right}`).join('; ');
		}

		if (question.type === 'multiple-choice' && typeof answer === 'number' && question.options) {
			return question.options[answer] || String(answer);
		}

		return String(answer);
	}

	private getQuestionTypeLabel(type: string): string {
		switch (type) {
			case 'multiple-choice':
				return 'Multiple choice';
			case 'fill-blank':
				return 'Fill in the blank';
			case 'true-false':
				return 'True/False';
			case 'audio-prompt':
				return 'Audio question';
			case 'match':
				return 'Matching pairs';
			default:
				return type;
		}
	}

		private getMatchPairs(question: QuizQuestion): QuizMatchPair[] {
			if (!Array.isArray(question.correctAnswer)) {
				return [];
			}

			return question.correctAnswer.filter((pair): pair is QuizMatchPair => {
				return typeof pair.left === 'string' && typeof pair.right === 'string';
			});
		}

		private getMatchLayout(question: QuizQuestion, pairs: QuizMatchPair[]): { left: QuizMatchPair[]; right: QuizMatchPair[] } {
			const cached = this.matchLayoutCache.get(question.id);
			if (cached) {
				return cached;
			}

			const shuffle = (items: QuizMatchPair[]): QuizMatchPair[] => {
				const result = [...items];
				for (let i = result.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[result[i], result[j]] = [result[j], result[i]];
				}
				return result;
			};

			const layout = {
				left: shuffle(pairs),
				right: shuffle(pairs)
			};
			this.matchLayoutCache.set(question.id, layout);
			return layout;
		}

		private handleMatchSelection(question: QuizQuestion, side: 'left' | 'right', value: string, sourceCardId?: string): void {
			const currentAnswer = Array.isArray(question.userAnswer) ? [...question.userAnswer] : [];
			const normalizedValue = value.trim().toLowerCase();

			if (!this.selectedMatchItem) {
				this.selectedMatchItem = { side, value, sourceCardId };
				void this.render();
				return;
			}

			if (this.selectedMatchItem.value.trim().toLowerCase() === normalizedValue) {
				this.selectedMatchItem = null;
				void this.render();
				return;
			}

			if (this.selectedMatchItem.side === side) {
				this.selectedMatchItem = { side, value, sourceCardId };
				void this.render();
				return;
			}

			const left = this.selectedMatchItem.side === 'left' ? this.selectedMatchItem.value : value;
			const right = this.selectedMatchItem.side === 'right' ? this.selectedMatchItem.value : value;
			const pair: QuizMatchPair = {
				left,
				right,
				sourceCardId: this.selectedMatchItem.sourceCardId || sourceCardId
			};

			const alreadyMatched = currentAnswer.some(existing =>
				existing.left.trim().toLowerCase() === pair.left.trim().toLowerCase() ||
				existing.right.trim().toLowerCase() === pair.right.trim().toLowerCase()
			);

			if (!alreadyMatched) {
				currentAnswer.push(pair);
				question.userAnswer = currentAnswer;
				void this.saveQuizProgress();
			}

			this.selectedMatchItem = null;
			void this.render();
		}

		private removeMatchPair(question: QuizQuestion, index: number): void {
			if (!Array.isArray(question.userAnswer)) {
				return;
			}

			const updated = [...question.userAnswer];
			updated.splice(index, 1);
			question.userAnswer = updated;
			this.selectedMatchItem = null;
			void this.saveQuizProgress();
			void this.render();
		}

		private resetMatchPairs(question: QuizQuestion): void {
			question.userAnswer = [];
			this.selectedMatchItem = null;
			void this.saveQuizProgress();
			void this.render();
		}

		private hasProvidedAnswer(question: QuizQuestion): boolean {
			if (Array.isArray(question.userAnswer)) {
				return question.userAnswer.length > 0;
			}

			return question.userAnswer !== undefined && question.userAnswer !== null && question.userAnswer !== '';
		}

	private handleKeydown(evt: KeyboardEvent): void {
		// Don't handle shortcuts if user is typing in an input field
		const target = evt.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			return;
		}

		// Don't handle shortcuts if no quiz is loaded or quiz is completed
		if (!this.currentQuiz || this.currentQuiz.completed) {
			return;
		}

		const question = this.currentQuiz.questions[this.currentQuestionIndex];
		if (!question) return;

		// Escape: Close the quiz view
		if (evt.key === 'Escape') {
			evt.preventDefault();
			this.leaf.detach();
			return;
		}

		// Enter or Space: Navigate to next question or finish
		if (evt.key === 'Enter' || evt.key === ' ') {
			evt.preventDefault();
			if (this.currentQuestionIndex < this.currentQuiz.totalQuestions - 1) {
				this.currentQuestionIndex++;
				void this.saveQuizProgress();
				void this.render();
			} else {
				void this.finishQuiz();
			}
			return;
		}

		// Arrow Left: Previous question
		if (evt.key === 'ArrowLeft') {
			evt.preventDefault();
			if (this.currentQuestionIndex > 0) {
				this.currentQuestionIndex--;
				void this.saveQuizProgress();
				void this.render();
			}
			return;
		}

		// Arrow Right: Next question
		if (evt.key === 'ArrowRight') {
			evt.preventDefault();
			if (this.currentQuestionIndex < this.currentQuiz.totalQuestions - 1) {
				this.currentQuestionIndex++;
				void this.saveQuizProgress();
				void this.render();
			}
			return;
		}

		// Number keys (1-4) for multiple choice and true/false
		if (question.type === 'multiple-choice' && question.options) {
			const num = parseInt(evt.key);
			if (num >= 1 && num <= question.options.length) {
				evt.preventDefault();
				question.userAnswer = num - 1;
				void this.saveQuizProgress();
				void this.render();
				return;
			}
		}

		// T/F keys for true/false questions
		if (question.type === 'true-false') {
			if (evt.key.toLowerCase() === 't') {
				evt.preventDefault();
				question.userAnswer = 'true';
				void this.saveQuizProgress();
				void this.render();
				return;
			}
			if (evt.key.toLowerCase() === 'f') {
				evt.preventDefault();
				question.userAnswer = 'false';
				void this.saveQuizProgress();
				void this.render();
				return;
			}
		}
	}

	/**
	 * Get source card file path from card ID
	 * Used for resolving audio file paths in quiz questions
	 */
	private getSourceCardPath(cardId: string): string {
		const card = this.plugin.storage.getCard(cardId);
		return card ? card.source.file : '';
	}
}
