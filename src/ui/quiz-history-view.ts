/**
 * Quiz History View
 * Browse and manage completed quizzes
 */

import { App, ItemView, WorkspaceLeaf, Modal, Notice, setIcon } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { Quiz, QuizQuestion } from '../models/quiz';

export const QUIZ_HISTORY_VIEW_TYPE = 'flashly-quiz-history-view';

interface ObsidianApp extends App {
	commands: {
		executeCommandById(commandId: string): void;
	};
}

interface QuizView {
	loadQuiz(quiz: Quiz): void;
}

export class QuizHistoryView extends ItemView {
	plugin: FlashlyPlugin;
	private sortBy: 'date' | 'score' | 'title' = 'date';
	private filterMethod: 'all' | 'traditional' | 'ai' = 'all';
	private filterState: 'all' | 'completed' | 'in-progress' = 'all';
	private renderQueue: Promise<void> = Promise.resolve();

	constructor(leaf: WorkspaceLeaf, plugin: FlashlyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return QUIZ_HISTORY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Quiz history';
	}

	getIcon(): string {
		return 'history';
	}



	onOpen(): void {
		this.queueRender();
	}


	onClose(): void {
		this.containerEl.empty();
	}

	private renderInternal(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass('flashly-quiz-history-view');

		// Header
		const header = container.createDiv({ cls: 'quiz-history-header' });
		header.createEl('h2', { text: 'Quiz history', cls: 'quiz-history-title' });

		const refreshBtn = header.createEl('button', {
			cls: 'quiz-history-refresh-btn',
			attr: { 'aria-label': 'Refresh quiz history' }
		});
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => this.queueRender());

		// Get all quizzes
		const allQuizzes = this.plugin.quizStorage.getAllQuizzes();
		this.plugin.logger.debug('Quiz history - all quizzes:', allQuizzes.length);
		this.plugin.logger.debug('Quiz history - quizzes:', allQuizzes);

		const completedQuizzes = allQuizzes.filter(q => q.completed);
		const inProgressQuizzes = allQuizzes.filter(q => !q.completed);
		this.plugin.logger.debug('Quiz history - completed quizzes:', completedQuizzes.length);
		this.plugin.logger.debug('Quiz history - in-progress quizzes:', inProgressQuizzes.length);

		if (allQuizzes.length === 0) {
			this.renderEmptyState(container);
			return;
		}

		// Filters and sorting
		this.renderControls(container);

		// Filter quizzes by state
		let displayQuizzes = allQuizzes;
		if (this.filterState === 'completed') {
			displayQuizzes = completedQuizzes;
		} else if (this.filterState === 'in-progress') {
			displayQuizzes = inProgressQuizzes;
		}

		// Filter quizzes by method
		if (this.filterMethod !== 'all') {
			displayQuizzes = displayQuizzes.filter(q =>
				this.filterMethod === 'ai'
					? q.generationMethod === 'ai-generated'
					: q.generationMethod === 'traditional'
			);
		}

		// Sort quizzes
		const sortedQuizzes = this.sortQuizzes(displayQuizzes);

		// Statistics summary (only for completed quizzes)
		if (completedQuizzes.length > 0) {
			this.renderSummary(container, completedQuizzes);
		}

		// Quiz list
		this.renderQuizList(container, sortedQuizzes);
	}

	private renderEmptyState(container: HTMLElement): void {
		const emptyState = container.createDiv({ cls: 'quiz-history-empty' });
		const emptyIcon = emptyState.createDiv({ cls: 'quiz-history-empty-icon' });
		setIcon(emptyIcon, 'file-question');
		emptyState.createEl('h3', { text: 'No quiz history', cls: 'quiz-history-empty-title' });
		emptyState.createEl('p', {
			text: 'Complete some quizzes to see your history here.',
			cls: 'quiz-history-empty-message'
		});

		const createBtn = emptyState.createEl('button', {
			text: 'Generate quiz',
			cls: 'quiz-history-empty-btn'
		});

		createBtn.addEventListener('click', () => {
			// Trigger generate quiz command
			(this.app as ObsidianApp).commands.executeCommandById('flashly:generate-quiz');
		});
	}

	private renderControls(container: HTMLElement): void {
		const controls = container.createDiv({ cls: 'quiz-history-controls' });

		// State filter dropdown
		const stateContainer = controls.createDiv({ cls: 'quiz-history-control' });
		stateContainer.createSpan({ text: 'Status: ', cls: 'quiz-history-control-label' });

		const stateSelect = stateContainer.createEl('select', { cls: 'quiz-history-select' });
		const stateOptions = [
			{ value: 'all', label: 'All quizzes' },
			{ value: 'completed', label: 'Completed only' },
			{ value: 'in-progress', label: 'In progress only' }
		];

		stateOptions.forEach(opt => {
			const option = stateSelect.createEl('option', {
				text: opt.label,
				value: opt.value
			});
			if (opt.value === this.filterState) {
				option.selected = true;
			}
		});

		stateSelect.addEventListener('change', (e) => {
			this.filterState = (e.target as HTMLSelectElement).value as 'all' | 'completed' | 'in-progress';
			this.queueRender();
		});

		// Sort dropdown
		const sortContainer = controls.createDiv({ cls: 'quiz-history-control' });
		sortContainer.createSpan({ text: 'Sort by: ', cls: 'quiz-history-control-label' });

		const sortSelect = sortContainer.createEl('select', { cls: 'quiz-history-select' });
		const sortOptions = [
			{ value: 'date', label: 'Date (newest)' },
			{ value: 'score', label: 'Score (highest)' },
			{ value: 'title', label: 'Title (A-Z)' }
		];

		sortOptions.forEach(opt => {
			const option = sortSelect.createEl('option', {
				text: opt.label,
				value: opt.value
			});
			if (opt.value === this.sortBy) {
				option.selected = true;
			}
		});

		sortSelect.addEventListener('change', (e) => {
			this.sortBy = (e.target as HTMLSelectElement).value as 'date' | 'score' | 'title';
			this.queueRender();
		});

		// Filter dropdown
		const filterContainer = controls.createDiv({ cls: 'quiz-history-control' });
		filterContainer.createSpan({ text: 'Method: ', cls: 'quiz-history-control-label' });

		const filterSelect = filterContainer.createEl('select', { cls: 'quiz-history-select' });
		const filterOptions = [
			{ value: 'all', label: 'All methods' },
			{ value: 'traditional', label: 'Traditional only' },
			{ value: 'ai', label: 'AI generated only' }
		];

		filterOptions.forEach(opt => {
			const option = filterSelect.createEl('option', {
				text: opt.label,
				value: opt.value
			});
			if (opt.value === this.filterMethod) {
				option.selected = true;
			}
		});

		filterSelect.addEventListener('change', (e) => {
			this.filterMethod = (e.target as HTMLSelectElement).value as 'all' | 'traditional' | 'ai';
			this.queueRender();
		});
	}

	private renderSummary(container: HTMLElement, quizzes: Quiz[]): void {
		const summary = container.createDiv({ cls: 'quiz-history-summary' });

		const totalQuizzes = quizzes.length;
		const avgScore = quizzes.reduce((sum, q) => sum + (q.score || 0), 0) / totalQuizzes;
		const totalQuestions = quizzes.reduce((sum, q) => sum + q.totalQuestions, 0);
		const aiQuizzes = quizzes.filter(q => q.generationMethod === 'ai-generated').length;

		const summaryCards = [
			{ label: 'Total quizzes', value: totalQuizzes, icon: 'file-text' },
			{ label: 'Average score', value: `${avgScore.toFixed(1)}%`, icon: 'target' },
			{ label: 'Questions answered', value: totalQuestions, icon: 'help-circle' },
			{ label: 'AI generated', value: aiQuizzes, icon: 'sparkles' }
		];

		summaryCards.forEach(card => {
			const cardEl = summary.createDiv({ cls: 'quiz-history-summary-card' });
			const iconEl = cardEl.createDiv({ cls: 'quiz-summary-icon' });
			setIcon(iconEl, card.icon);
			const content = cardEl.createDiv({ cls: 'quiz-summary-content' });
			content.createDiv({ text: String(card.value), cls: 'quiz-summary-value' });
			content.createDiv({ text: card.label, cls: 'quiz-summary-label' });
		});
	}

	private renderQuizList(container: HTMLElement, quizzes: Quiz[]): void {
		const listContainer = container.createDiv({ cls: 'quiz-history-list' });

		quizzes.forEach(quiz => {
			const quizCard = listContainer.createDiv({ cls: 'quiz-history-card' });

			// Add class for in-progress quizzes
			if (!quiz.completed) {
				quizCard.addClass('quiz-card-in-progress');
			}

			// Header section
			const cardHeader = quizCard.createDiv({ cls: 'quiz-card-header' });

			const titleSection = cardHeader.createDiv({ cls: 'quiz-card-title-section' });
			titleSection.createDiv({ text: quiz.title, cls: 'quiz-card-title' });

			const badge = titleSection.createSpan({ cls: 'quiz-card-badge' });
			badge.setText(quiz.generationMethod === 'ai-generated' ? 'AI' : 'Traditional');

			// Add in-progress badge if applicable
			if (!quiz.completed) {
				const progressBadge = titleSection.createSpan({ cls: 'quiz-card-in-progress-badge' });
				progressBadge.setText('In progress');
			}

			// Add learn mode badge if applicable
			if (quiz.config.learnMode) {
				const learnBadge = titleSection.createSpan({ cls: 'quiz-card-learn-mode-badge' });
				learnBadge.setText('Learn mode');
			}

			const scoreEl = cardHeader.createDiv({ cls: 'quiz-card-score' });

			// Show score for completed quizzes, progress for in-progress
			if (quiz.completed) {
				scoreEl.setText(`${quiz.score}%`);

				// Color code the score
				if (quiz.score! >= 90) {
					scoreEl.addClass('quiz-score-excellent');
				} else if (quiz.score! >= 70) {
					scoreEl.addClass('quiz-score-good');
				} else if (quiz.score! >= 50) {
					scoreEl.addClass('quiz-score-fair');
				} else {
					scoreEl.addClass('quiz-score-poor');
				}
			} else {
				// Show progress for in-progress quizzes
				const answeredCount = quiz.questions.filter(q => q.userAnswer !== undefined).length;
				const progressPercent = Math.round((answeredCount / quiz.totalQuestions) * 100);
				scoreEl.setText(`${progressPercent}%`);
				scoreEl.addClass('quiz-progress-indicator');
			}

			// Details section
			const cardDetails = quizCard.createDiv({ cls: 'quiz-card-details' });

			const detailsGrid = cardDetails.createDiv({ cls: 'quiz-card-details-grid' });

			if (quiz.completed) {
				// Completed quiz details
				detailsGrid.createDiv({
					text: `${quiz.correctCount} / ${quiz.totalQuestions} correct`,
					cls: 'quiz-card-detail'
				});

				const completedDate = new Date(quiz.completed);
				detailsGrid.createDiv({
					text: this.formatDate(completedDate),
					cls: 'quiz-card-detail'
				});

				const timeTaken = this.calculateTimeTaken(quiz);
				if (timeTaken) {
					detailsGrid.createDiv({
						text: timeTaken,
						cls: 'quiz-card-detail'
					});
				}

				// Show learn mode stats if available
				if (quiz.learnModeStats) {
					const learnStats = cardDetails.createDiv({ cls: 'quiz-learn-stats' });
					learnStats.createDiv({ text: `First-try correct: ${quiz.learnModeStats.firstPassCorrect}/${quiz.totalQuestions}` });
					learnStats.createDiv({ text: `Total attempts: ${quiz.learnModeStats.totalAttempts}` });
					learnStats.createDiv({ text: `Questions retried: ${quiz.learnModeStats.questionsRequeued}` });
				}
			} else {
				// In-progress quiz details
				const answeredCount = quiz.questions.filter(q => q.userAnswer !== undefined).length;
				detailsGrid.createDiv({
					text: `${answeredCount} / ${quiz.totalQuestions} answered`,
					cls: 'quiz-card-detail'
				});

				const currentPos = (quiz.currentQuestionIndex ?? 0) + 1;
				detailsGrid.createDiv({
					text: `Currently on question ${currentPos}`,
					cls: 'quiz-card-detail'
				});

				if (quiz.lastAccessed) {
					const lastAccessedDate = new Date(quiz.lastAccessed);
					detailsGrid.createDiv({
						text: `Last accessed ${this.formatDate(lastAccessedDate)}`,
						cls: 'quiz-card-detail'
					});
				}
			}

			// Actions section
			const actions = quizCard.createDiv({ cls: 'quiz-card-actions' });

			if (quiz.completed) {
				// Completed quiz actions
				const viewBtn = actions.createEl('button', {
					text: 'View',
					cls: 'quiz-card-btn quiz-card-btn-primary'
				});
				viewBtn.addEventListener('click', () => void this.viewQuiz(quiz));

				const retakeBtn = actions.createEl('button', {
					text: 'Retake',
					cls: 'quiz-card-btn'
				});
				retakeBtn.addEventListener('click', () => void this.retakeQuiz(quiz));

				const exportBtn = actions.createEl('button', {
					text: 'Export',
					cls: 'quiz-card-btn'
				});
				exportBtn.addEventListener('click', () => void this.exportQuiz(quiz));
			} else {
				// In-progress quiz actions
				const resumeBtn = actions.createEl('button', {
					text: 'Resume',
					cls: 'quiz-card-btn quiz-card-btn-primary'
				});
				resumeBtn.addEventListener('click', () => void this.resumeQuiz(quiz));

				const startOverBtn = actions.createEl('button', {
					text: 'Start over',
					cls: 'quiz-card-btn'
				});
				startOverBtn.addEventListener('click', () => void this.startOver(quiz));
			}

			const deleteBtn = actions.createEl('button', {
				text: 'Delete',
				cls: 'quiz-card-btn quiz-card-btn-danger'
			});
			deleteBtn.addEventListener('click', () => this.confirmDelete(quiz));
		});
	}

	private sortQuizzes(quizzes: Quiz[]): Quiz[] {
		const sorted = [...quizzes];

		switch (this.sortBy) {
			case 'date':
				sorted.sort((a, b) => {
					// Use lastAccessed for in-progress, completed for finished
					const aDate = a.completed ? new Date(a.completed) : (a.lastAccessed ? new Date(a.lastAccessed) : new Date(a.created));
					const bDate = b.completed ? new Date(b.completed) : (b.lastAccessed ? new Date(b.lastAccessed) : new Date(b.created));
					return bDate.getTime() - aDate.getTime();
				});
				break;
			case 'score':
				sorted.sort((a, b) => {
					// Put in-progress quizzes at the end when sorting by score
					if (!a.completed && b.completed) return 1;
					if (a.completed && !b.completed) return -1;
					return (b.score || 0) - (a.score || 0);
				});
				break;
			case 'title':
				sorted.sort((a, b) => a.title.localeCompare(b.title));
				break;
		}

		return sorted;
	}

	private formatDate(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;

		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	private calculateTimeTaken(quiz: Quiz): string | null {
		if (!quiz.completed || !quiz.created) return null;

		const diffMs = new Date(quiz.completed).getTime() - new Date(quiz.created).getTime();
		const minutes = Math.floor(diffMs / 60000);
		const seconds = Math.floor((diffMs % 60000) / 1000);

		if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		}
		return `${seconds}s`;
	}

	private async viewQuiz(quiz: Quiz): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: 'flashly-quiz-view',
			active: true
		});

		const view = leaf.view;
		if (view && 'loadQuiz' in view) {
			(view as unknown as QuizView).loadQuiz(quiz);
		}
	}

	private async retakeQuiz(quiz: Quiz): Promise<void> {
		// Create a new quiz with the same configuration
		const newQuiz = {
			...quiz,
			id: `quiz-${Date.now()}`,
			created: new Date(),
			completed: undefined,
			score: undefined,
			correctCount: undefined,
			state: 'in-progress' as const,
			lastAccessed: new Date(),
			currentQuestionIndex: 0,
			questions: quiz.questions.map(q => ({
				...q,
				userAnswer: undefined,
				correct: undefined,
				checked: undefined,
				attemptCount: undefined
			})),
			learnModeStats: quiz.config.learnMode ? {
				totalAttempts: 0,
				questionsRequeued: 0,
				firstPassCorrect: 0
			} : undefined
		};

		await this.plugin.quizStorage.addQuiz(newQuiz);

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: 'flashly-quiz-view',
			active: true
		});

		const view = leaf.view;
		if (view && 'loadQuiz' in view) {
			(view as unknown as QuizView).loadQuiz(newQuiz);
		}

		new Notice('Quiz ready! Good luck!');
	}

	private async resumeQuiz(quiz: Quiz): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: 'flashly-quiz-view',
			active: true
		});

		const view = leaf.view;
		if (view && 'loadQuiz' in view) {
			(view as unknown as QuizView).loadQuiz(quiz);
		}

		new Notice('Resuming quiz...');
	}

	private async startOver(quiz: Quiz): Promise<void> {
		// Reset the quiz to initial state
		quiz.questions.forEach(q => {
			q.userAnswer = undefined;
			q.correct = undefined;
			q.checked = undefined;
			q.attemptCount = undefined;
		});

		quiz.currentQuestionIndex = 0;
		quiz.lastAccessed = new Date();
		quiz.state = 'in-progress';

		// Reset learn mode stats if applicable
		if (quiz.learnModeStats) {
			quiz.learnModeStats.savedQueue = undefined;
			quiz.learnModeStats.savedQueuePosition = undefined;
			quiz.learnModeStats.savedAnsweredQuestions = undefined;
		}

		await this.plugin.quizStorage.updateQuiz(quiz);

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: 'flashly-quiz-view',
			active: true
		});

		const view = leaf.view;
		if (view && 'loadQuiz' in view) {
			(view as unknown as QuizView).loadQuiz(quiz);
		}

		new Notice('Quiz reset. Starting from the beginning...');
	}

	private async exportQuiz(quiz: Quiz): Promise<void> {
		try {
			// Generate markdown content
			const markdown = this.generateQuizMarkdown(quiz);

			// Create file name
			const sanitizedTitle = quiz.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
			const timestamp = new Date(quiz.completed!).toISOString().split('T')[0];
			const fileName = `quiz_${sanitizedTitle}_${timestamp}.md`;

			// Prompt user for file location
			const filePath = await this.promptForFilePath(fileName);
			if (!filePath) return;

			// Write file
			await this.app.vault.create(filePath, markdown);

			new Notice(`Quiz exported to ${filePath}`);
		} catch (error) {
			console.error('Failed to export quiz:', error);
			new Notice(`Failed to export quiz: ${error.message}`);
		}
	}

	private generateQuizMarkdown(quiz: Quiz): string {
		const completedDate = new Date(quiz.completed!).toLocaleString();
		const scorePercent = quiz.score || 0;

		let md = `# ${quiz.title}\n\n`;
		md += `**Completed:** ${completedDate}\n`;
		md += `**Score:** ${scorePercent}% (${quiz.correctCount}/${quiz.totalQuestions} correct)\n`;
		md += `**Generation method:** ${quiz.generationMethod === 'ai-generated' ? 'AI-generated' : 'Traditional'}\n\n`;
		md += `---\n\n`;

		quiz.questions.forEach((question, index) => {
			md += `## Question ${index + 1}\n\n`;
			md += `**Type:** ${this.formatQuestionType(question.type)}\n\n`;
			md += `${question.prompt}\n\n`;

			if (question.options && question.options.length > 0) {
				md += `**Options:**\n`;
				question.options.forEach((option, i) => {
					const isCorrect = question.type === 'multiple-choice' && question.correctAnswer === i;
					const wasSelected = question.userAnswer === i;
					const marker = isCorrect ? '✅' : wasSelected ? '❌' : '';
					md += `${i + 1}. ${option} ${marker}\n`;
				});
				md += `\n`;
			}

			md += `**Your answer:** ${this.formatAnswerForExport(question, question.userAnswer)}\n`;
			md += `**Correct answer:** ${this.formatAnswerForExport(question, question.correctAnswer)}\n`;
			md += `**Result:** ${question.correct ? '✅ Correct' : '❌ Incorrect'}\n`;

			if (question.explanation) {
				md += `\n**Explanation:** ${question.explanation}\n`;
			}

			md += `\n---\n\n`;
		});

		md += `## Summary\n\n`;
		md += `- **Total questions:** ${quiz.totalQuestions}\n`;
		md += `- **Correct answers:** ${quiz.correctCount}\n`;
		md += `- **Incorrect answers:** ${quiz.totalQuestions - (quiz.correctCount || 0)}\n`;
		md += `- **Final score:** ${scorePercent}%\n`;
		md += `\n---\n\n`;
		md += `*Exported from Flashly - spaced repetition flashcards for Obsidian*\n`;

		return md;
	}

	private formatAnswerForExport(question: QuizQuestion, answer: string | number | undefined): string {
		if (answer === undefined || answer === null) {
			return '(no answer)';
		}

		if (question.type === 'multiple-choice' && typeof answer === 'number' && question.options) {
			return `${answer + 1}. ${question.options[answer]}`;
		}

		return String(answer);
	}

	private formatQuestionType(type: string): string {
		switch (type) {
			case 'multiple-choice':
				return 'Multiple choice';
			case 'fill-blank':
				return 'Fill in the blank';
			case 'true-false':
				return 'True/false';
			default:
				return type;
		}
	}

	private async promptForFilePath(defaultName: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new ExportFileModal(this.app, defaultName, (path) => {
				resolve(path);
			});
			modal.open();
		});
	}

	private confirmDelete(quiz: Quiz): void {
		new ConfirmDeleteModal(this.app, quiz, () => {
			void (async () => {
				await this.plugin.quizStorage.deleteQuiz(quiz.id);
				new Notice('Quiz deleted');
				this.queueRender();
			})();
		}).open();
	}

	private queueRender(): void {
		this.renderQueue = this.renderQueue
			.then(() => this.renderInternal())
			.catch((error) => {
				console.error('Flashly: failed to render quiz history view', error);
			});
	}
}

class ExportFileModal extends Modal {
	defaultName: string;
	onConfirm: (path: string | null) => void;

	constructor(app: App, defaultName: string, onConfirm: (path: string | null) => void) {
		super(app);
		this.defaultName = defaultName;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('flashly-export-quiz-modal');

		contentEl.createEl('h2', { text: 'Export quiz' });
		contentEl.createEl('p', {
			text: 'Choose where to save the exported quiz Markdown file.'
		});

		const input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'file path (e.g., quizzes/my-quiz.md)',
			value: this.defaultName
		});
		input.addClass('quiz-export-input');
		input.focus();

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const exportBtn = buttonContainer.createEl('button', {
			text: 'Export',
			cls: 'mod-cta'
		});
		exportBtn.addEventListener('click', () => {
			const path = input.value.trim();
			if (path) {
				this.onConfirm(path);
			}
			this.close();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => {
			this.onConfirm(null);
			this.close();
		});

		// Allow Enter key to confirm
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				exportBtn.click();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ConfirmDeleteModal extends Modal {
	quiz: Quiz;
	onConfirm: () => void;

	constructor(app: App, quiz: Quiz, onConfirm: () => void) {
		super(app);
		this.quiz = quiz;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('flashly-confirm-delete-modal');

		contentEl.createEl('h2', { text: 'Delete quiz?' });
		contentEl.createEl('p', {
			text: `Are you sure you want to delete "${this.quiz.title}"? This action cannot be undone.`
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const deleteBtn = buttonContainer.createEl('button', {
			text: 'Delete',
			cls: 'mod-warning'
		});
		deleteBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
