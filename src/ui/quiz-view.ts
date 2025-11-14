/**
 * Quiz View
 * Interactive quiz interface for taking quizzes
 */

import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Component, Notice, App } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { Quiz, QuizQuestion, checkAnswer, calculateQuizScore } from '../models/quiz';

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



	onOpen(): void {
		this.component = new Component();
		this.component.load();
		void this.render();
		document.addEventListener('keydown', this.keydownHandler);
	}


	onClose(): void {
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
			await MarkdownRenderer.render(this.app, question.prompt, promptContent, '', this.component);
		}

		// Answer area
		const answerArea = questionContainer.createDiv({ cls: 'quiz-answer-area' });

		if (question.type === 'multiple-choice' && question.options) {
			await this.renderMultipleChoice(answerArea, question);
		} else if (question.type === 'fill-blank') {
			this.renderFillBlank(answerArea, question);
		} else if (question.type === 'true-false' && question.options) {
			await this.renderTrueFalse(answerArea, question);
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

				checkBtn.addEventListener('click', () => {
					void this.handleCheckAnswer();
				});
			} else {
				// Show "Continue" button
				const continueBtn = nav.createEl('button', {
					text: 'Continue →',
					cls: 'quiz-nav-btn quiz-nav-primary'
				});

				continueBtn.addEventListener('click', () => {
					this.handleLearnModeContinue();
				});
			}
		} else {
			// Normal mode navigation
			if (this.currentQuestionIndex > 0) {
				const prevBtn = nav.createEl('button', { text: '← previous', cls: 'quiz-nav-btn' });
				prevBtn.addEventListener('click', () => {
					this.currentQuestionIndex--;
					void this.saveQuizProgress();
					void this.render();
				});
			}

			const nextBtn = nav.createEl('button', {
				text: this.currentQuestionIndex < this.currentQuiz.totalQuestions - 1 ? 'Next →' : 'Finish quiz',
				cls: 'quiz-nav-btn quiz-nav-primary'
			});

			nextBtn.addEventListener('click', () => {
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
				await MarkdownRenderer.render(this.app, option, optionContent, '', this.component);
			}

			if (question.userAnswer === index) {
				optionBtn.addClass('quiz-option-selected');
			}

			optionBtn.addEventListener('click', () => {
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

	private async renderTrueFalse(container: HTMLElement, question: QuizQuestion): Promise<void> {
		if (!question.options) return;

		for (const option of question.options) {
			const optionBtn = container.createEl('button', {
				cls: 'quiz-option-btn quiz-option-tf'
			});

			const optionContent = optionBtn.createDiv({ cls: 'quiz-option-content' });

			// Render markdown in options
			if (this.component) {
				await MarkdownRenderer.render(this.app, option, optionContent, '', this.component);
			}

			const answerValue = option.toLowerCase();
			if (question.userAnswer === answerValue) {
				optionBtn.addClass('quiz-option-selected');
			}

			optionBtn.addEventListener('click', () => {
				question.userAnswer = answerValue;
				void this.saveQuizProgress();
				void this.render();
			});
		}
	}

	/**
	 * Handle answer check in learn mode
	 */
	private async handleCheckAnswer(): Promise<void> {
		const question = this.getCurrentQuestion();
		const qIndex = this.getCurrentQuestionIndex();

		if (!question) return;

		if (!question.userAnswer && question.userAnswer !== 0) {
			new Notice('Please select an answer first');
			return;
		}

		// Check the answer
		question.checked = true;
		question.correct = checkAnswer(question, question.userAnswer);
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
				const userAnswerText = this.formatAnswer(question, question.userAnswer!);
				await MarkdownRenderer.render(this.app, userAnswerText, userAnswerContent, '', this.component);
			}

			// Show correct answer
			const correctAnswerDiv = feedbackCard.createDiv({ cls: 'quiz-learn-correct-answer' });
			correctAnswerDiv.createEl('strong', { text: 'Correct answer: ' });
			const correctAnswerContent = correctAnswerDiv.createDiv({ cls: 'quiz-answer-content' });
			if (this.component) {
				const correctAnswerText = this.formatAnswer(question, question.correctAnswer);
				await MarkdownRenderer.render(this.app, correctAnswerText, correctAnswerContent, '', this.component);
			}

			// Show explanation if available
			if (question.explanation) {
				const explanationDiv = feedbackCard.createDiv({ cls: 'quiz-learn-explanation' });
				explanationDiv.createEl('strong', { text: 'Explanation:' });
				const explanationContent = explanationDiv.createDiv({ cls: 'quiz-explanation-content' });
				if (this.component) {
					await MarkdownRenderer.render(this.app, question.explanation, explanationContent, '', this.component);
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
	private formatAnswer(question: QuizQuestion, answer: string | number): string {
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
		newQuizBtn.addEventListener('click', () => {
			// Trigger the generate-quiz command
			(this.app as ObsidianApp).commands.executeCommandById('flashly:generate-quiz');
		});

		const closeBtn = actions.createEl('button', {
			text: 'Close',
			cls: 'quiz-action-btn'
		});
		closeBtn.addEventListener('click', () => {
			this.leaf.detach();
		});
	}

	private getAnswerDisplay(question: QuizQuestion, answer: string | number | undefined): string {
		if (answer === undefined || answer === null) {
			return '(no answer)';
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
			default:
				return type;
		}
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
}
