/**
 * Quiz Storage Service
 * Manages quiz persistence and history
 */

import { Plugin } from 'obsidian';
import { Quiz, QuizQuestion, QuizConfig, QuizGenerationMethod } from '../models/quiz';

interface QuizStorageData {
	quizzes: Record<string, SerializedQuiz>;
	quizHistory: string[]; // Quiz IDs in chronological order
}

interface SerializedQuiz {
	id: string;
	title: string;
	created: string;
	completed?: string;
	generationMethod: string;
	sourceCards: string[];
	questions: QuizQuestion[];
	score?: number;
	correctCount?: number;
	totalQuestions: number;
	config: QuizConfig;
}

export class QuizStorageService {
	private quizzes: Map<string, Quiz> = new Map();
	private quizHistory: string[] = [];

	constructor(private plugin: Plugin) {}

	/**
	 * Load quizzes from storage
	 */
	async load(): Promise<void> {
		const data = await this.plugin.loadData() as Record<string, unknown> | null;

		if (!data || !data.quizStorage) {
			console.debug('Quiz storage: No existing data found, initializing empty storage');
			this.quizzes = new Map();
			this.quizHistory = [];
			return;
		}

		const quizStorage = data.quizStorage as QuizStorageData;

		// Deserialize quizzes
		for (const [id, serialized] of Object.entries(quizStorage.quizzes || {})) {
			this.quizzes.set(id, this.deserializeQuiz(serialized));
		}

		this.quizHistory = quizStorage.quizHistory || [];
		console.debug('Quiz storage loaded:', this.quizzes.size, 'quizzes');
	}

	/**
	 * Save quizzes to storage
	 */
	async save(): Promise<void> {
		try {
			const existingData = await this.plugin.loadData() || {};

			const quizStorage: QuizStorageData = {
				quizzes: {},
				quizHistory: this.quizHistory
			};

			// Serialize quizzes
			for (const [id, quiz] of this.quizzes.entries()) {
				quizStorage.quizzes[id] = this.serializeQuiz(quiz);
			}

			existingData.quizStorage = quizStorage;
			await this.plugin.saveData(existingData);
			console.debug('Quiz storage saved successfully:', this.quizzes.size, 'quizzes');
		} catch (error) {
			console.error('Failed to save quiz storage:', error);
			throw error;
		}
	}

	/**
	 * Add a new quiz
	 */
	async addQuiz(quiz: Quiz): Promise<void> {
		this.quizzes.set(quiz.id, quiz);
		this.quizHistory.unshift(quiz.id); // Add to beginning
		await this.save();
	}

	/**
	 * Update an existing quiz
	 */
	async updateQuiz(quiz: Quiz): Promise<void> {
		if (!this.quizzes.has(quiz.id)) {
			throw new Error(`Quiz ${quiz.id} not found`);
		}
		this.quizzes.set(quiz.id, quiz);
		await this.save();
	}

	/**
	 * Get a quiz by ID
	 */
	getQuiz(id: string): Quiz | undefined {
		return this.quizzes.get(id);
	}

	/**
	 * Get all quizzes
	 */
	getAllQuizzes(): Quiz[] {
		return Array.from(this.quizzes.values());
	}

	/**
	 * Get quiz history (most recent first)
	 */
	getQuizHistory(limit?: number): Quiz[] {
		const historyIds = limit ? this.quizHistory.slice(0, limit) : this.quizHistory;
		return historyIds
			.map(id => this.quizzes.get(id))
			.filter((quiz): quiz is Quiz => quiz !== undefined);
	}

	/**
	 * Delete a quiz
	 */
	async deleteQuiz(id: string): Promise<void> {
		this.quizzes.delete(id);
		this.quizHistory = this.quizHistory.filter(qid => qid !== id);
		await this.save();
	}

	/**
	 * Get quiz statistics
	 */
	getStatistics() {
		const quizzes = this.getAllQuizzes();
		const completed = quizzes.filter(q => q.completed);

		return {
			total: quizzes.length,
			completed: completed.length,
			averageScore: completed.length > 0
				? completed.reduce((sum, q) => sum + (q.score || 0), 0) / completed.length
				: 0,
			totalQuestions: quizzes.reduce((sum, q) => sum + q.totalQuestions, 0)
		};
	}

	private serializeQuiz(quiz: Quiz): SerializedQuiz {
		return {
			id: quiz.id,
			title: quiz.title,
			created: quiz.created.toISOString(),
			completed: quiz.completed?.toISOString(),
			generationMethod: quiz.generationMethod,
			sourceCards: quiz.sourceCards,
			questions: quiz.questions,
			score: quiz.score,
			correctCount: quiz.correctCount,
			totalQuestions: quiz.totalQuestions,
			config: quiz.config
		};
	}

	private deserializeQuiz(serialized: SerializedQuiz): Quiz {
		return {
			id: serialized.id,
			title: serialized.title,
			created: new Date(serialized.created),
			completed: serialized.completed ? new Date(serialized.completed) : undefined,
			generationMethod: serialized.generationMethod as QuizGenerationMethod,
			sourceCards: serialized.sourceCards,
			questions: serialized.questions,
			score: serialized.score,
			correctCount: serialized.correctCount,
			totalQuestions: serialized.totalQuestions,
			config: serialized.config
		};
	}
}
