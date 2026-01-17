/**
 * Quiz Data Models
 * Supports both traditional and AI-generated quizzes
 */

export type QuizQuestionType = 'multiple-choice' | 'fill-blank' | 'true-false' | 'audio-prompt';

export type QuizGenerationMethod = 'traditional' | 'ai-generated';

export type QuizState = 'in-progress' | 'completed';

export interface QuizQuestion {
	id: string;                          // Unique question ID
	type: QuizQuestionType;              // Question type
	prompt: string;                      // Question text
	options?: string[];                  // Options for multiple choice (undefined for others)
	correctAnswer: string | number;      // Correct answer (string or index)
	userAnswer?: string | number;        // User's answer
	correct?: boolean;                   // Whether user answered correctly
	sourceCardId?: string;               // Original card ID (for traditional)
	explanation?: string;                // Explanation for the answer (AI can provide this)
	attemptCount?: number;               // Number of times question was attempted (learn mode)
	checked?: boolean;                   // Whether answer has been checked (learn mode)
}

export interface LearnModeStats {
	totalAttempts: number;               // Total question attempts (including retries)
	questionsRequeued: number;           // How many questions were re-added to queue
	firstPassCorrect: number;            // Questions answered correctly on first try
	savedQueue?: number[];               // Saved question queue for resuming
	savedQueuePosition?: number;         // Saved position in queue for resuming
	savedAnsweredQuestions?: number[];   // Saved set of answered question indices
}

export interface Quiz {
	id: string;                          // Unique quiz ID
	title: string;                       // Quiz title
	created: Date;                       // Creation timestamp
	completed?: Date;                    // Completion timestamp
	generationMethod: QuizGenerationMethod; // How quiz was generated
	sourceCards: string[];               // Card IDs used to generate quiz
	questions: QuizQuestion[];           // Quiz questions
	score?: number;                      // Score if completed (0-100)
	correctCount?: number;               // Number of correct answers
	totalQuestions: number;              // Total number of questions
	config: QuizConfig;                  // Configuration used to generate quiz
	learnModeStats?: LearnModeStats;     // Statistics for learn mode quizzes
	state?: QuizState;                   // Current state of the quiz
	lastAccessed?: Date;                 // Last time quiz was accessed
	currentQuestionIndex?: number;       // Current position in quiz (for resuming)
}

export interface QuizConfig {
	questionCount: number;               // Number of questions to generate
	includeMultipleChoice: boolean;      // Include MC questions
	includeFillBlank: boolean;           // Include fill-in-blank questions
	includeTrueFalse: boolean;           // Include true/false questions
	deckFilter?: string[];               // Optional deck filter
	useAI: boolean;                      // Use AI generation
	aiProvider?: AIProvider;             // AI provider if using AI
	learnMode?: boolean;                 // Enable learn mode (immediate feedback & retry)
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'custom';

export interface AIQuizSettings {
	enabled: boolean;                    // Master toggle for AI features
	provider: AIProvider;                // Selected provider
	openai?: {
		apiKey: string;
		model: string;                   // e.g., "gpt-4", "gpt-3.5-turbo"
		baseUrl?: string;                // Optional custom endpoint
	};
	anthropic?: {
		apiKey: string;
		model: string;                   // e.g., "claude-3-5-sonnet-20241022"
		baseUrl?: string;
	};
	gemini?: {
		apiKey: string;
		model: string;                   // e.g., "gemini-1.5-pro", "gemini-1.5-flash"
		baseUrl?: string;
	};
	custom?: {
		apiKey: string;
		model: string;
		baseUrl: string;
		endpoint?: string;               // Optional endpoint path (defaults to /chat/completions)
		headers?: Record<string, string>;
	};
	temperature: number;                 // 0-1, creativity level
	maxTokens: number;                   // Max response tokens
	systemPrompt?: string;               // Custom system prompt
	voiceAI?: {
		enabled: boolean;                // Enable audio transcription
		provider: 'openai-whisper' | 'google-speech'; // Transcription provider
		openaiWhisper?: {
			apiKey: string;              // OpenAI API key (can reuse from openai config)
			model?: string;              // 'whisper-1' (default)
			baseUrl?: string;            // Optional custom endpoint
		};
		googleSpeech?: {
			apiKey: string;              // Google Speech-to-Text API key
			language?: string;           // e.g., 'en-US', 'auto-detect'
		};
		cacheTranscriptions: boolean;    // Cache transcriptions to avoid re-processing
	};
}

export interface QuizGenerationRequest {
	cards: Array<{
		id: string;
		front: string;
		back: string;
		deck: string;
	}>;
	config: QuizConfig;
}

export interface AIQuizGenerationResponse {
	questions: QuizQuestion[];
	metadata?: {
		model: string;
		tokensUsed?: number;
		generationTime?: number;
	};
}

/**
 * Create a new quiz
 */
export function createQuiz(
	title: string,
	questions: QuizQuestion[],
	sourceCards: string[],
	config: QuizConfig,
	generationMethod: QuizGenerationMethod
): Quiz {
	return {
		id: `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
		title,
		created: new Date(),
		generationMethod,
		sourceCards,
		questions,
		totalQuestions: questions.length,
		config,
		state: 'in-progress',
		lastAccessed: new Date(),
		currentQuestionIndex: 0
	};
}

/**
 * Calculate quiz score
 */
export function calculateQuizScore(quiz: Quiz): { score: number; correctCount: number } {
	const correctCount = quiz.questions.filter(q => q.correct === true).length;
	const score = Math.round((correctCount / quiz.totalQuestions) * 100);
	return { score, correctCount };
}

/**
 * Check if question answer is correct
 */
export function checkAnswer(question: QuizQuestion, userAnswer: string | number): boolean {
	if (question.type === 'multiple-choice' && typeof question.correctAnswer === 'number') {
		return userAnswer === question.correctAnswer;
	}

	// For fill-blank and true-false, do case-insensitive comparison
	const correctStr = String(question.correctAnswer).toLowerCase().trim();
	const userStr = String(userAnswer).toLowerCase().trim();

	return correctStr === userStr;
}

/**
 * Default quiz config
 */
export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
	questionCount: 20,
	includeMultipleChoice: true,
	includeFillBlank: true,
	includeTrueFalse: true,
	useAI: false,
	learnMode: false
};

/**
 * Default AI settings
 */
export const DEFAULT_AI_QUIZ_SETTINGS: AIQuizSettings = {
	enabled: false,
	provider: 'openai',
	openai: {
		apiKey: '',
		model: 'gpt-4',
		baseUrl: 'https://api.openai.com/v1'
	},
	anthropic: {
		apiKey: '',
		model: 'claude-3-5-sonnet-20241022',
		baseUrl: 'https://api.anthropic.com/v1'
	},
	gemini: {
		apiKey: '',
		model: 'gemini-1.5-flash', // Recommended: 'gemini-2.5-flash', 'gemini-2.0-flash', or 'gemini-1.5-flash'
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta' // Try 'v1' if you get 404 errors with newer models
	},
	temperature: 0.7,
	maxTokens: 4000,
	systemPrompt: 'You are a helpful assistant that generates educational quiz questions from flashcard content. Generate clear, accurate questions that test understanding of the material.',
	voiceAI: {
		enabled: false,
		provider: 'openai-whisper',
		cacheTranscriptions: true
	}
};
