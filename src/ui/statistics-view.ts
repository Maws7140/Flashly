import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type FlashlyPlugin from '../../main';
import { FlashlyCard } from '../models/card';
import { Quiz } from '../models/quiz';
import { State } from 'ts-fsrs';

export const STATISTICS_VIEW_TYPE = 'flashly-statistics-view';

interface DeckStats {
	name: string;
	total: number;
	new: number;
	learning: number;
	review: number;
	averageRetention: number;
}

export class StatisticsView extends ItemView {
	plugin: FlashlyPlugin;
	private renderQueue: Promise<void> = Promise.resolve();

	constructor(leaf: WorkspaceLeaf, plugin: FlashlyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return STATISTICS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Flashcard statistics';
	}

	getIcon(): string {
		return 'bar-chart';
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
		container.addClass('flashly-statistics-view');

		// Header
		const header = container.createDiv({ cls: 'stats-header' });
		const titleRow = header.createDiv({ cls: 'stats-title-row' });
		titleRow.createEl('h2', { text: 'Statistics dashboard', cls: 'stats-title' });

	const refreshBtn = titleRow.createEl('button', {
		cls: 'stats-refresh-btn',
		attr: { 'aria-label': 'Refresh statistics' }
	});
	setIcon(refreshBtn, 'refresh-cw');
	refreshBtn.addEventListener('click', () => this.queueRender());		// Get all cards
		const cards = this.plugin.storage.getAllCards();

		// Overview Cards
		this.renderOverviewCards(container, cards);

		// Deck Breakdown
		this.renderDeckBreakdown(container, cards);

		// Review Activity (simplified heatmap)
		this.renderReviewActivity(container, cards);

		// Card Distribution
		this.renderCardDistribution(container, cards);

		// Quiz Statistics
		this.renderQuizStatistics(container);
	}

	private renderOverviewCards(container: HTMLElement, cards: FlashlyCard[]): void {
		const overviewSection = container.createDiv({ cls: 'stats-overview' });

		const totalCards = cards.length;
		const dueCards = cards.filter(c => {
			if (!c.fsrsCard || !c.fsrsCard.due) return false;
			return new Date(c.fsrsCard.due) <= new Date();
		}).length;

		const newCards = cards.filter(c =>
			c.fsrsCard?.state === State.New
		).length;

		const reviewCards = cards.filter(c =>
			c.fsrsCard?.state === State.Review
		).length;

		const overviewCards = [
			{ label: 'Total cards', value: totalCards, icon: 'library', color: 'blue' },
			{ label: 'Due today', value: dueCards, icon: 'clock', color: 'orange' },
			{ label: 'New cards', value: newCards, icon: 'sparkles', color: 'green' },
			{ label: 'Review cards', value: reviewCards, icon: 'repeat', color: 'purple' }
		];

		overviewCards.forEach(card => {
			const cardEl = overviewSection.createDiv({ cls: 'stats-overview-card' });
			cardEl.addClass(`stats-color-${card.color}`);

			const iconEl = cardEl.createDiv({ cls: 'stats-card-icon' });
			setIcon(iconEl, card.icon);

			const contentEl = cardEl.createDiv({ cls: 'stats-card-content' });
			contentEl.createDiv({ text: String(card.value), cls: 'stats-card-value' });
			contentEl.createDiv({ text: card.label, cls: 'stats-card-label' });
		});
	}

	private renderDeckBreakdown(container: HTMLElement, cards: FlashlyCard[]): void {
		const section = container.createDiv({ cls: 'stats-section' });
		section.createEl('h3', { text: 'Deck breakdown', cls: 'stats-section-title' });

		const deckStats = this.calculateDeckStats(cards);

		if (deckStats.length === 0) {
			section.createDiv({
				text: 'No decks found. Start creating flashcards to see statistics!',
				cls: 'stats-empty-message'
			});
			return;
		}

		const deckList = section.createDiv({ cls: 'stats-deck-list' });

		deckStats.forEach(deck => {
			const deckItem = deckList.createDiv({ cls: 'stats-deck-item' });
			deckItem.addClass('stats-deck-item-clickable');

			// Find the first card in this deck to get the source file
			const firstCard = cards.find(c => c.deck === deck.name);
			if (firstCard) {
				deckItem.addEventListener('click', () => {
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(firstCard.source.file);
						if (file) {
							await this.app.workspace.openLinkText(firstCard.source.file, '', false);
						}
					})();
				});
			}

		const deckHeader = deckItem.createDiv({ cls: 'stats-deck-header' });
		const deckIconEl = deckHeader.createSpan({ cls: 'stats-deck-icon' });
		setIcon(deckIconEl, 'folder');
		deckHeader.createSpan({ text: deck.name, cls: 'stats-deck-name' });
			deckHeader.createSpan({ text: String(deck.total), cls: 'stats-deck-total' });

			const deckDetails = deckItem.createDiv({ cls: 'stats-deck-details' });

			const statsGrid = deckDetails.createDiv({ cls: 'stats-grid' });
			this.createStatPill(statsGrid, 'New', deck.new, 'green');
			this.createStatPill(statsGrid, 'Learning', deck.learning, 'orange');
			this.createStatPill(statsGrid, 'Review', deck.review, 'blue');

			// Progress bar
			const progressBar = deckItem.createDiv({ cls: 'stats-progress-bar' });
			const newPercent = (deck.new / deck.total) * 100;
			const learningPercent = (deck.learning / deck.total) * 100;
			const reviewPercent = (deck.review / deck.total) * 100;

			progressBar.createDiv({
				cls: 'stats-progress-segment stats-progress-new',
				attr: { style: `width: ${newPercent}%` }
			});
			progressBar.createDiv({
				cls: 'stats-progress-segment stats-progress-learning',
				attr: { style: `width: ${learningPercent}%` }
			});
			progressBar.createDiv({
				cls: 'stats-progress-segment stats-progress-review',
				attr: { style: `width: ${reviewPercent}%` }
			});
		});
	}

	private renderReviewActivity(container: HTMLElement, cards: FlashlyCard[]): void {
		const section = container.createDiv({ cls: 'stats-section' });
		section.createEl('h3', { text: 'Review activity', cls: 'stats-section-title' });

		// Calculate review activity for the last 30 days
		const today = new Date();
		const thirtyDaysAgo = new Date(today);
		thirtyDaysAgo.setDate(today.getDate() - 30);

		const reviewsByDate = new Map<string, number>();

		// Initialize all dates with 0
		for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
			const dateStr = d.toISOString().split('T')[0];
			reviewsByDate.set(dateStr, 0);
		}

		// Count reviews (using last_review from fsrsCard)
		cards.forEach(card => {
			if (card.fsrsCard?.last_review) {
				const reviewDate = new Date(card.fsrsCard.last_review);
				if (reviewDate >= thirtyDaysAgo && reviewDate <= today) {
					const dateStr = reviewDate.toISOString().split('T')[0];
					reviewsByDate.set(dateStr, (reviewsByDate.get(dateStr) || 0) + 1);
				}
			}
		});

		const activityGrid = section.createDiv({ cls: 'stats-activity-grid' });

		// Create simplified heatmap
		const maxReviews = Math.max(...Array.from(reviewsByDate.values()), 1);

		Array.from(reviewsByDate.entries()).forEach(([date, count]) => {
			const intensity = count === 0 ? 0 : Math.ceil((count / maxReviews) * 4);
			const cell = activityGrid.createDiv({ cls: 'stats-activity-cell' });
			cell.addClass(`stats-activity-intensity-${intensity}`);
			cell.setAttr('title', `${date}: ${count} reviews`);
		});

		const legend = section.createDiv({ cls: 'stats-activity-legend' });
		legend.createSpan({ text: 'Less', cls: 'stats-legend-label' });
		for (let i = 0; i <= 4; i++) {
			const cell = legend.createDiv({ cls: 'stats-activity-cell' });
			cell.addClass(`stats-activity-intensity-${i}`);
		}
		legend.createSpan({ text: 'More', cls: 'stats-legend-label' });
	}

	private renderCardDistribution(container: HTMLElement, cards: FlashlyCard[]): void {
		const section = container.createDiv({ cls: 'stats-section' });
		section.createEl('h3', { text: 'Card distribution', cls: 'stats-section-title' });

		const distribution = {
			new: cards.filter(c => c.fsrsCard?.state === State.New).length,
			learning: cards.filter(c => c.fsrsCard?.state === State.Learning).length,
			review: cards.filter(c => c.fsrsCard?.state === State.Review).length,
			relearning: cards.filter(c => c.fsrsCard?.state === State.Relearning).length,
		};

		const total = cards.length;

		const chartContainer = section.createDiv({ cls: 'stats-distribution-chart' });

		Object.entries(distribution).forEach(([state, count]) => {
			const percentage = total > 0 ? (count / total) * 100 : 0;

			const row = chartContainer.createDiv({ cls: 'stats-distribution-row' });

			const label = row.createDiv({ cls: 'stats-distribution-label' });
			label.createSpan({ text: state.charAt(0).toUpperCase() + state.slice(1) });
			label.createSpan({ text: String(count), cls: 'stats-distribution-count' });

			const barContainer = row.createDiv({ cls: 'stats-distribution-bar-container' });
			const bar = barContainer.createDiv({ cls: 'stats-distribution-bar' });
			bar.addClass(`stats-bar-${state}`);
			bar.setCssProps({ '--bar-width': `${percentage}%` });

			row.createSpan({ text: `${percentage.toFixed(1)}%`, cls: 'stats-distribution-percentage' });
		});
	}

	private calculateDeckStats(cards: FlashlyCard[]): DeckStats[] {
		const deckMap = new Map<string, DeckStats>();

		cards.forEach(card => {
			const deckName = card.deck || 'Default';

			if (!deckMap.has(deckName)) {
				deckMap.set(deckName, {
					name: deckName,
					total: 0,
					new: 0,
					learning: 0,
					review: 0,
					averageRetention: 0
				});
			}

			const stats = deckMap.get(deckName)!;
			stats.total++;

			if (card.fsrsCard?.state === State.New) {
				stats.new++;
			} else if (card.fsrsCard?.state === State.Learning) {
				stats.learning++;
			} else if (card.fsrsCard?.state === State.Review) {
				stats.review++;
			}
		});

		return Array.from(deckMap.values()).sort((a, b) => b.total - a.total);
	}

	private createStatPill(container: HTMLElement, label: string, value: number, color: string): void {
		const pill = container.createDiv({ cls: 'stats-pill' });
		pill.addClass(`stats-pill-${color}`);
		pill.createSpan({ text: label, cls: 'stats-pill-label' });
		pill.createSpan({ text: String(value), cls: 'stats-pill-value' });
	}

	private renderQuizStatistics(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'stats-section' });
		section.createEl('h3', { text: 'Quiz performance', cls: 'stats-section-title' });

		const quizzes = this.plugin.quizStorage.getAllQuizzes();
		const completedQuizzes = quizzes.filter(q => q.completed);

		if (completedQuizzes.length === 0) {
			section.createDiv({
				text: 'No quizzes completed yet. Use "Generate quiz" to create your first quiz!',
				cls: 'stats-empty-message'
			});
			return;
		}

		// Quiz overview cards
		const quizOverview = section.createDiv({ cls: 'stats-quiz-overview' });

		const totalQuizzes = completedQuizzes.length;
		const totalQuestions = completedQuizzes.reduce((sum, q) => sum + q.totalQuestions, 0);
		const averageScore = completedQuizzes.reduce((sum, q) => sum + (q.score || 0), 0) / totalQuizzes;
		const totalCorrect = completedQuizzes.reduce((sum, q) => sum + (q.correctCount || 0), 0);
		const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

		const quizCards = [
			{ label: 'Quizzes Taken', value: totalQuizzes, icon: 'file-text', color: 'blue' },
			{ label: 'Avg Score', value: `${averageScore.toFixed(1)}%`, icon: 'target', color: 'green' },
			{ label: 'Questions Answered', value: totalQuestions, icon: 'help-circle', color: 'purple' },
			{ label: 'Accuracy', value: `${accuracy.toFixed(1)}%`, icon: 'check-circle', color: 'orange' }
		];

		quizCards.forEach(card => {
			const cardEl = quizOverview.createDiv({ cls: 'stats-quiz-card' });
			cardEl.addClass(`stats-color-${card.color}`);

			const iconEl = cardEl.createDiv({ cls: 'stats-card-icon' });
			setIcon(iconEl, card.icon);

			const contentEl = cardEl.createDiv({ cls: 'stats-card-content' });
			contentEl.createDiv({ text: String(card.value), cls: 'stats-card-value' });
			contentEl.createDiv({ text: card.label, cls: 'stats-card-label' });
		});

		// Recent quiz history
		const historySection = section.createDiv({ cls: 'stats-quiz-history' });
		historySection.createEl('h4', { text: 'Recent quizzes', cls: 'stats-subsection-title' });

		const recentQuizzes = completedQuizzes
			.sort((a, b) => new Date(b.completed!).getTime() - new Date(a.completed!).getTime())
			.slice(0, 5);

		const historyList = historySection.createDiv({ cls: 'stats-quiz-history-list' });

		recentQuizzes.forEach(quiz => {
			const quizItem = historyList.createDiv({ cls: 'stats-quiz-item' });

			const quizHeader = quizItem.createDiv({ cls: 'stats-quiz-item-header' });
			quizHeader.createSpan({ text: quiz.title, cls: 'stats-quiz-item-title' });

			const scoreEl = quizHeader.createSpan({ cls: 'stats-quiz-item-score' });
			scoreEl.setText(`${quiz.score}%`);

			// Color code the score
			if (quiz.score! >= 90) {
				scoreEl.addClass('stats-score-excellent');
			} else if (quiz.score! >= 70) {
				scoreEl.addClass('stats-score-good');
			} else if (quiz.score! >= 50) {
				scoreEl.addClass('stats-score-fair');
			} else {
				scoreEl.addClass('stats-score-poor');
			}

			const quizDetails = quizItem.createDiv({ cls: 'stats-quiz-item-details' });

			const detailsLeft = quizDetails.createDiv({ cls: 'stats-quiz-details-left' });
			detailsLeft.createSpan({ text: `${quiz.correctCount} / ${quiz.totalQuestions} correct`, cls: 'stats-quiz-detail' });

			const badge = detailsLeft.createSpan({ cls: 'stats-quiz-badge' });
			badge.setText(quiz.generationMethod === 'ai-generated' ? '🤖 AI' : '📋 Traditional');

			const detailsRight = quizDetails.createDiv({ cls: 'stats-quiz-details-right' });
			const completedDate = new Date(quiz.completed!);
			const timeAgo = this.formatTimeAgo(completedDate);
			detailsRight.createSpan({ text: timeAgo, cls: 'stats-quiz-time' });
		});

		// Quiz type breakdown
		const typeSection = section.createDiv({ cls: 'stats-quiz-types' });
		typeSection.createEl('h4', { text: 'Question type performance', cls: 'stats-subsection-title' });

		const typeStats = this.calculateQuizTypeStats(completedQuizzes);
		const typeGrid = typeSection.createDiv({ cls: 'stats-type-grid' });

		Object.entries(typeStats).forEach(([type, stats]) => {
			const typeCard = typeGrid.createDiv({ cls: 'stats-type-card' });

			typeCard.createDiv({ text: this.formatQuestionType(type), cls: 'stats-type-name' });

			const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
			const accuracyBar = typeCard.createDiv({ cls: 'stats-type-accuracy-bar' });
			const accuracyFill = accuracyBar.createDiv({ cls: 'stats-type-accuracy-fill' });
			accuracyFill.setCssProps({ '--accuracy-width': `${accuracy}%` });

			if (accuracy >= 80) {
				accuracyFill.addClass('stats-accuracy-high');
			} else if (accuracy >= 60) {
				accuracyFill.addClass('stats-accuracy-medium');
			} else {
				accuracyFill.addClass('stats-accuracy-low');
			}

			typeCard.createDiv({ text: `${accuracy.toFixed(0)}% (${stats.correct}/${stats.total})`, cls: 'stats-type-stats' });
		});
	}

	private calculateQuizTypeStats(quizzes: Quiz[]): Record<string, { correct: number; total: number }> {
		const stats: Record<string, { correct: number; total: number }> = {
			'multiple-choice': { correct: 0, total: 0 },
			'fill-blank': { correct: 0, total: 0 },
			'true-false': { correct: 0, total: 0 }
		};

		quizzes.forEach(quiz => {
			quiz.questions.forEach((q) => {
				if (stats[q.type]) {
					stats[q.type].total++;
					if (q.correct) {
						stats[q.type].correct++;
					}
				}
			});
		});

		// Filter out types with no questions
		return Object.fromEntries(
			Object.entries(stats).filter(([_, s]) => s.total > 0)
		);
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

	private formatTimeAgo(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString();
	}

	private queueRender(): void {
		this.renderQueue = this.renderQueue
			.then(() => this.renderInternal())
			.catch((error) => {
				console.error('Flashly: failed to render statistics view', error);
			});
	}
}
