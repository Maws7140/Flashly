/**
 * Settings configuration for Flashly plugin
 */

import { FlashcardParserSettings } from './parser/flashcard-parser';
import { AIQuizSettings, DEFAULT_AI_QUIZ_SETTINGS } from './models/quiz';
import type { SortOption } from './viewmodels/browser-viewmodel';

export type SchedulerType = 'fsrs' | 'sm2';

export interface ReviewLimits {
	reviewPerDay: number;
	newPerDay: number;
}

export interface ReviewSettings {
	scheduler: SchedulerType;
	limits: ReviewLimits;
	includeLearningCards: boolean;
	excludeEmptyCards: boolean;
	deckFilter: string[];
	enableKeyboardShortcuts: boolean;
}

export interface ExportSettings {
	defaultFormat: 'anki' | 'csv' | 'csv-quizlet' | 'json' | 'markdown';
	defaultLocation: string;
	includeScheduling: boolean;
	includeTags: boolean;
	includeMedia: boolean;
	csvDelimiter: ',' | ';' | '\t';
	csvIncludeBOM: boolean;
	ankiDeckPrefix: string;
	ankiConvertMarkdown: boolean;
	ankiPlainTextMode: boolean;
}

export interface TutorialSettings {
	completed: boolean;
	completedDate?: string;
	version: string;
}

export interface DeveloperSettings {
	enableDebugLogging: boolean;
}

export interface BrowserSettings {
	defaultSort: SortOption;
}

export interface FlashlySettings {
	parser: FlashcardParserSettings;
	review: ReviewSettings;
	quiz: AIQuizSettings;
	export: ExportSettings;
	browser: BrowserSettings;
	tutorial: TutorialSettings;
	developer: DeveloperSettings;
}

export const DEFAULT_SETTINGS: FlashlySettings = {
	parser: {
		inline: {
			enabled: true,
			enableQA: true,
			enableMultiLine: true,
			enableCloze: true,
			createEmptyCards: true
		},
		header: {
			enabled: true,
			flashcardTags: ['flashcards', 'cards'],
			headerLevels: [2, 3, 4, 5, 6],
			deckNamePriority: ['frontmatter', 'title', 'subtags'],
			useSubtags: true,
			answerTerminator: 'next-header',
			createEmptyCards: true,
			enableExclusion: true,
			exclusionComment: '%%NO_FLASHCARD%%'
		},
		mixedFormats: true
	},
	review: {
		scheduler: 'fsrs',
		limits: {
			reviewPerDay: 100,
			newPerDay: 20
		},
		includeLearningCards: true,
		excludeEmptyCards: true,
		deckFilter: [],
		enableKeyboardShortcuts: true
	},
	quiz: DEFAULT_AI_QUIZ_SETTINGS,
	export: {
		defaultFormat: 'csv',
		defaultLocation: '',
		includeScheduling: true,
		includeTags: true,
		includeMedia: false,
		csvDelimiter: ',',
		csvIncludeBOM: true,
		ankiDeckPrefix: 'Flashly',
		ankiConvertMarkdown: true,
		ankiPlainTextMode: false
	},
	browser: {
		defaultSort: 'created-desc'
	},
	tutorial: {
		completed: false,
		version: '1.0.0'
	},
	developer: {
		enableDebugLogging: false
	}
};
