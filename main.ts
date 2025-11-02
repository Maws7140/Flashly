import { Plugin } from 'obsidian';
import { FlashlySettings, DEFAULT_SETTINGS } from './src/settings';
import { FlashlySettingTab } from './src/ui/settings-tab';
import { StorageService } from './src/services/storage-service';
import { FlashcardParser } from './src/parser/flashcard-parser';
import { ScanCommand } from './src/commands/scan-command';
import { FlashcardBrowserView, FLASHCARD_BROWSER_VIEW_TYPE } from './src/ui/flashcard-browser-view';
import { StatisticsView, STATISTICS_VIEW_TYPE } from './src/ui/statistics-view';
import { QuizView, QUIZ_VIEW_TYPE } from './src/ui/quiz-view';
import { QuizHistoryView, QUIZ_HISTORY_VIEW_TYPE } from './src/ui/quiz-history-view';
import { ReviewQueueService } from './src/services/review-queue';
import { QuizStorageService } from './src/services/quiz-storage';
import { StartReviewCommand } from './src/commands/start-review';
import { RefreshDecksCommand } from './src/commands/refresh-decks-command';
import { GenerateQuizCommand } from './src/commands/generate-quiz-command';
import { ExportService } from './src/services/export-service';
import { ExportCommand } from './src/commands/export-command';

export default class FlashlyPlugin extends Plugin {
	settings: FlashlySettings;
	storage: StorageService;
	quizStorage: QuizStorageService;
	parser: FlashcardParser;
	scanCommand: ScanCommand;
	reviewQueue: ReviewQueueService;
	startReviewCommand: StartReviewCommand;
	refreshDecksCommand: RefreshDecksCommand;
	generateQuizCommand: GenerateQuizCommand;
	exportService: ExportService;
	exportCommand: ExportCommand;
	statusBarItem: HTMLElement;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Initialize services
		this.storage = new StorageService(this);
		await this.storage.load();

		this.quizStorage = new QuizStorageService(this);
		await this.quizStorage.load();

		this.parser = new FlashcardParser(this.settings.parser, this.app);
		this.reviewQueue = new ReviewQueueService(this.storage);

		// Initialize export service
		this.exportService = new ExportService(this.app, this.storage, () => this.settings);

		// Register flashcard browser view
		this.registerView(
			FLASHCARD_BROWSER_VIEW_TYPE,
			(leaf) => new FlashcardBrowserView(leaf, this)
		);

		// Register statistics view
		this.registerView(
			STATISTICS_VIEW_TYPE,
			(leaf) => new StatisticsView(leaf, this)
		);

		// Register quiz view
		this.registerView(
			QUIZ_VIEW_TYPE,
			(leaf) => new QuizView(leaf, this)
		);

		// Register quiz history view
		this.registerView(
			QUIZ_HISTORY_VIEW_TYPE,
			(leaf) => new QuizHistoryView(leaf, this)
		);

		// Initialize commands
		this.scanCommand = new ScanCommand(this.app, this.storage, this.parser);
		this.addCommand({
			id: this.scanCommand.getId(),
			name: this.scanCommand.getName(),
			callback: this.scanCommand.getCallback()
		});

		this.startReviewCommand = new StartReviewCommand(this.app, this.storage, this.reviewQueue, () => this.settings);
		this.addCommand({
			id: this.startReviewCommand.getId(),
			name: this.startReviewCommand.getName(),
			callback: this.startReviewCommand.getCallback()
		});

		this.refreshDecksCommand = new RefreshDecksCommand(this.app, this.storage, () => this.settings);
		this.addCommand({
			id: this.refreshDecksCommand.getId(),
			name: this.refreshDecksCommand.getName(),
			callback: this.refreshDecksCommand.getCallback()
		});

		this.generateQuizCommand = new GenerateQuizCommand(this.app, this);
		this.addCommand({
			id: this.generateQuizCommand.getId(),
			name: this.generateQuizCommand.getName(),
			callback: this.generateQuizCommand.getCallback()
		});

		// Add export command
		this.exportCommand = new ExportCommand(this.app, this.exportService);
		this.addCommand({
			id: this.exportCommand.getId(),
			name: this.exportCommand.getName(),
			callback: this.exportCommand.getCallback()
		});

		// Add command to open flashcard browser
		this.addCommand({
			id: 'open-flashcard-browser',
			name: 'Open Flashcard Browser',
			callback: () => this.activateBrowserView()
		});

		// Add command to open statistics view
		this.addCommand({
			id: 'open-statistics',
			name: 'View Statistics',
			callback: () => this.activateStatisticsView()
		});

		// Add command to open quiz history
		this.addCommand({
			id: 'open-quiz-history',
			name: 'View Quiz History',
			callback: () => this.activateQuizHistoryView()
		});

		// Add ribbon icon for flashcard browser
		this.addRibbonIcon('layers', 'Flashcard Browser', () => {
			this.activateBrowserView();
		});

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar();

		// Update status bar every 60 seconds
		this.registerInterval(
			window.setInterval(() => this.updateStatusBar(), 60000)
		);

		// Add settings tab
		this.addSettingTab(new FlashlySettingTab(this.app, this));
	}

	async activateBrowserView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(FLASHCARD_BROWSER_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new view in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: FLASHCARD_BROWSER_VIEW_TYPE,
					active: true
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async activateStatisticsView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(STATISTICS_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new view in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: STATISTICS_VIEW_TYPE,
					active: true
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async activateQuizHistoryView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(QUIZ_HISTORY_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new view in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: QUIZ_HISTORY_VIEW_TYPE,
					active: true
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		const data = await this.loadData() as Partial<FlashlySettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(data ?? {}),
			parser: {
				...DEFAULT_SETTINGS.parser,
				...(data?.parser ?? {})
			},
			review: {
				...DEFAULT_SETTINGS.review,
				...(data?.review ?? {})
			},
			quiz: {
				...DEFAULT_SETTINGS.quiz,
				...(data?.quiz ?? {})
			},
			export: {
				...DEFAULT_SETTINGS.export,
				...(data?.export ?? {})
			}
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Reinitialize parser with new settings
		this.parser = new FlashcardParser(this.settings.parser, this.app);
	}

	updateStatusBar(): void {
		if (!this.statusBarItem) return;

		const cards = this.storage.getAllCards();
		const dueCount = cards.filter(card => {
			if (!card.fsrsCard || !card.fsrsCard.due) return false;
			return new Date(card.fsrsCard.due) <= new Date();
		}).length;

		const totalCards = cards.length;

		if (dueCount > 0) {
			this.statusBarItem.setText(`📝 ${dueCount} due (${totalCards} total)`);
			this.statusBarItem.addClass('flashly-status-bar-due');
		} else {
			this.statusBarItem.setText(`📝 ${totalCards} cards`);
			this.statusBarItem.removeClass('flashly-status-bar-due');
		}

		// Make it clickable to open browser
		this.statusBarItem.onclick = () => {
			this.activateBrowserView();
		};
	}
}

