import { FlashlyCard } from '../models/card';
import { InlineParser, InlineParserSettings } from './inline-parser';
import { HeaderParser, HeaderParserSettings } from './header-parser';
import { TFile, App } from 'obsidian';

/**
 * Combined settings for all parser types
 */
export interface FlashcardParserSettings {
	inline: InlineParserSettings;
	header: HeaderParserSettings;
	mixedFormats: boolean; // Allow both inline and header in same note
}

/**
 * Unified Flashcard Parser
 * Combines inline and header-based parsing strategies
 */
export class FlashcardParser {
	private inlineParser: InlineParser;
	private headerParser: HeaderParser;

	constructor(
		private settings: FlashcardParserSettings,
		private app: App
	) {
		this.inlineParser = new InlineParser(settings.inline, app, settings.header.flashcardTags);
		this.headerParser = new HeaderParser(settings.header, app);
	}

	/**
	 * Parse a single file for flashcards
	 * @param file - File to parse
	 * @returns Array of flashcards found in the file
	 */
	async parseFile(file: TFile): Promise<FlashlyCard[]> {
		const cards: FlashlyCard[] = [];

		// Check if file is tagged for flashcard parsing
		// Only files with configured flashcard tags (e.g., #flashcards) are parsed
		const hasFlashcardTag = this.headerParser.hasFlashcardTag(file);
		
		// Skip files without flashcard tag entirely
		if (!hasFlashcardTag) {
			return [];
		}

		// Parse header-based cards if enabled
		if (this.settings.header.enabled) {
			const headerCards = await this.headerParser.parse(file);
			cards.push(...headerCards);
		}

		// Parse inline cards if enabled
		if (this.settings.inline.enabled) {
			const inlineCards = await this.inlineParser.parseWithFile(file);
			cards.push(...inlineCards);
		}

		// Deduplicate cards with same ID (same source location)
		return this.deduplicate(cards);
	}

	/**
	 * Parse all markdown files in the vault
	 * @returns Array of all flashcards found
	 */
	async parseVault(): Promise<FlashlyCard[]> {
		const files = this.app.vault.getMarkdownFiles();
		const allCards: FlashlyCard[] = [];

		for (const file of files) {
			const cards = await this.parseFile(file);
			allCards.push(...cards);
		}

		return allCards;
	}

	/**
	 * Parse specific files
	 * @param files - Array of files to parse
	 * @returns Array of flashcards found in the files
	 */
	async parseFiles(files: TFile[]): Promise<FlashlyCard[]> {
		const allCards: FlashlyCard[] = [];

		for (const file of files) {
			const cards = await this.parseFile(file);
			allCards.push(...cards);
		}

		return allCards;
	}

	/**
	 * Deduplicate cards by ID (same source location = same card)
	 */
	private deduplicate(cards: FlashlyCard[]): FlashlyCard[] {
		const seen = new Set<string>();
		const unique: FlashlyCard[] = [];

		for (const card of cards) {
			if (!seen.has(card.id)) {
				seen.add(card.id);
				unique.push(card);
			}
		}

		return unique;
	}

	/**
	 * Get statistics about parsing
	 */
	async getParsingStats(file: TFile): Promise<ParsingStats> {
		const cards = await this.parseFile(file);

		const stats: ParsingStats = {
			totalCards: cards.length,
			inlineCards: 0,
			headerCards: 0,
			cardsNeedingFilling: cards.filter(c => c.needsFilling).length,
			uniqueDecks: [...new Set(cards.map(c => c.deck))].length,
		};

		// Count card types based on source line patterns
		// (This is a heuristic; in production you might want to track this during parsing)
		for (const card of cards) {
			// If card has multiple lines in back, likely header-based
			if (card.back.includes('\n')) {
				stats.headerCards++;
			} else {
				stats.inlineCards++;
			}
		}

		return stats;
	}
}

export interface ParsingStats {
	totalCards: number;
	inlineCards: number;
	headerCards: number;
	cardsNeedingFilling: number;
	uniqueDecks: number;
}

/**
 * Create default settings for flashcard parser
 */
export function createDefaultParserSettings(): FlashcardParserSettings {
	return {
		inline: {
			enabled: true,
			enableQA: true,
			enableMultiLine: true,
			enableCloze: true,
			createEmptyCards: true,
		},
		header: {
			enabled: true,
			flashcardTags: ['flashcards'],
			headerLevels: [2, 3, 4, 5, 6],
			deckNamePriority: ['frontmatter', 'title', 'subtags'],
			useSubtags: true,
			answerTerminator: 'next-header',
			createEmptyCards: true,
			enableExclusion: true,
			exclusionComment: 'flashcard:skip',
		},
		mixedFormats: true,
	};
}
