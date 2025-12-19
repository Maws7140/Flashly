import { FlashlyCard, createFlashlyCard } from '../models/card';
import { createEmptyCard } from 'ts-fsrs';
import { App, TFile } from 'obsidian';
import { DeckNamingConfig, DEFAULT_DECK_NAMING_CONFIG, getDeckName } from '../utils/deck-naming';

/**
 * Settings for inline parser
 */
export interface InlineParserSettings {
	enabled: boolean;                // Master enable/disable
	enableQA: boolean;           // Q::A format
	enableMultiLine: boolean;    // ?? format
	enableCloze: boolean;        // {cloze} format
	createEmptyCards: boolean;   // Create cards with empty backs
}

const DEFAULT_INLINE_DECK_CONFIG: DeckNamingConfig = DEFAULT_DECK_NAMING_CONFIG;

/**
 * Inline Parser for Phase 1
 * Supports: Q::A, ??, and {cloze} formats
 */
export class InlineParser {
	private deckConfig: DeckNamingConfig;

	constructor(
		private settings: InlineParserSettings,
		private app?: App,
		deckConfig?: DeckNamingConfig
	) {
		this.deckConfig = deckConfig ?? DEFAULT_INLINE_DECK_CONFIG;
	}

	/**
	 * Extract deck name from file path
	 * @param sourcePath - File path like "folder/MyNote.md"
	 * @returns Deck name like "MyNote"
	 */
	private extractDeckFromPath(sourcePath: string): string {
		// Handle Windows paths (backslash) and Unix paths (forward slash)
		const normalized = sourcePath.replace(/\\/g, '/');
		const filename = normalized.split('/').pop() || 'Default';
		return filename.replace(/\.md$/, '');
	}

	/**
	 * Parse content from a TFile with metadata support
	 * @param file - TFile to parse
	 * @returns Array of parsed FlashlyCards
	 */
	async parseWithFile(file: TFile): Promise<FlashlyCard[]> {
		if (!this.app) {
			throw new Error('InlineParser.parseWithFile requires app instance in constructor');
		}

		const content = await this.app.vault.read(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		// Get deck name using shared utility
		const deckName = getDeckName(
			file,
			metadata,
			this.deckConfig.deckNamePriority,
			this.deckConfig.useSubtags,
			this.deckConfig.flashcardTags
		);

		return this.parseContent(content, file.path, deckName);
	}

	/**
	 * Parse content for all inline flashcard formats (backward compatible)
	 * @param content - Note content to parse
	 * @param sourcePath - Path to source file
	 * @returns Array of parsed FlashlyCards
	 */
	parse(content: string, sourcePath: string): FlashlyCard[] {
		const deckName = this.extractDeckFromPath(sourcePath);
		return this.parseContent(content, sourcePath, deckName);
	}

	/**
	 * Internal method to parse content with a specific deck name
	 * @param content - Note content to parse
	 * @param sourcePath - Path to source file
	 * @param deckName - Deck name to assign to cards
	 * @returns Array of parsed FlashlyCards
	 */
	private parseContent(content: string, sourcePath: string, deckName: string): FlashlyCard[] {
		const cards: FlashlyCard[] = [];
		const lines = content.split('\n');
		
		// Track code blocks to skip them
		let inCodeBlock = false;
		let i = 0;
		
		while (i < lines.length) {
			const line = lines[i];
			
			// Track code block boundaries
			if (line.trim().startsWith('```')) {
				inCodeBlock = !inCodeBlock;
				i++;
				continue;
			}
			
			// Skip lines in code blocks
			if (inCodeBlock) {
				i++;
				continue;
			}
			
			const trimmedLine = line.trim();
			
			// Skip empty lines
			if (!trimmedLine) {
				i++;
				continue;
			}
			
			// Try Q::A format first
			if (this.settings.enableQA) {
				const qaCard = this.parseQA(line, sourcePath, i + 1, deckName);
				if (qaCard) {
					cards.push(qaCard);
					i++;
					continue;
				}
			}

			// Try ?? format
			if (this.settings.enableMultiLine && i + 1 < lines.length && lines[i + 1].trim() === '??') {
				const result = this.parseMultiLine(lines, i, sourcePath, deckName);
				if (result.card) {
					cards.push(result.card);
					i = result.endIndex;
					continue;
				}
			}

			// Try cloze format
			if (this.settings.enableCloze) {
				const clozeCards = this.parseCloze(line, sourcePath, i + 1, deckName);
				if (clozeCards.length > 0) {
					cards.push(...clozeCards);
				}
			}
			
			i++;
		}
		
		return cards;
	}

	/**
	 * Parse single-line Q::A format
	 * Example: "What is 2+2::4"
	 */
	private parseQA(line: string, sourcePath: string, lineNumber: number, deckName: string): FlashlyCard | null {
		// First check if line contains :: at all
		if (!line.includes('::')) {
			return null;
		}
		
		// Find first non-escaped :: delimiter
		// Split on :: but track if it's escaped
		const parts: string[] = [];
		let current = '';
		let i = 0;
		
		while (i < line.length) {
			if (i < line.length - 1 && line[i] === ':' && line[i + 1] === ':') {
				// Check if escaped
				if (i > 0 && line[i - 1] === '\\') {
					// Escaped, keep the ::
					current = current.slice(0, -1) + '::'; // Remove backslash, add ::
					i += 2;
				} else {
					// Not escaped, this is our delimiter
					parts.push(current);
					current = '';
					i += 2;
					// Rest of line is the answer
					parts.push(line.slice(i));
					break;
				}
			} else {
				current += line[i];
				i++;
			}
		}
		
		// Need exactly 2 parts (front and back)
		if (parts.length !== 2) {
			return null;
		}
		
		const front = parts[0].trim();
		const back = parts[1].trim();
		
		// Skip if question is empty
		if (!front) {
			return null;
		}
		
		// Skip empty answer unless createEmptyCards is enabled
		if (!back && !this.settings.createEmptyCards) {
			return null;
		}
		
		// Create new FSRS card
		const fsrsCard = createEmptyCard(new Date());

		// Create FlashlyCard
		return createFlashlyCard(
			front,
			back,
			sourcePath,
			lineNumber,
			fsrsCard,
			deckName
		);
	}

	/**
	 * Parse multi-line (??) format
	 * Example:
	 * Question here?
	 * ??
	 * Answer here.
	 */
	private parseMultiLine(
		lines: string[],
		startIndex: number,
		sourcePath: string,
		deckName: string
	): { card: FlashlyCard | null; endIndex: number } {
		const question = lines[startIndex].trim();
		const lineNumber = startIndex + 1;
		
		// Skip if question is empty
		if (!question) {
			return { card: null, endIndex: startIndex + 2 };
		}
		
		// Find the answer (everything after ?? until next question or end)
		const answerLines: string[] = [];
		let i = startIndex + 2; // Skip question and ??
		
		// Collect answer lines until we hit a new question marker (??) or end
		while (i < lines.length) {
			const line = lines[i].trim();
			
			// Check if this is the start of a new question (next line is ??)
			if (i + 1 < lines.length && lines[i + 1].trim() === '??') {
				break;
			}
			
			// Check if we hit a Q::A format (start of new card)
			if (line.includes('::') && !line.includes('\\::')) {
				break;
			}
			
			// Check if line contains cloze (indicates new card type)
			if (this.settings.enableCloze && line.match(/\{[^}]+\}/)) {
				break;
			}
			
			// Add non-empty lines to answer
			if (line) {
				answerLines.push(line);
			} else if (answerLines.length > 0) {
				// Keep blank lines within answer for formatting
				answerLines.push('');
			}
			
			i++;
		}
		
		// Join answer lines
		const back = answerLines.join('\n').trim();
		
		// Skip empty answer unless createEmptyCards is enabled
		if (!back && !this.settings.createEmptyCards) {
			return { card: null, endIndex: i };
		}
		
		// Create new FSRS card
		const fsrsCard = createEmptyCard(new Date());

		// Create FlashlyCard
		const card = createFlashlyCard(
			question,
			back,
			sourcePath,
			lineNumber,
			fsrsCard,
			deckName
		);

		return { card, endIndex: i };
	}

	/**
	 * Parse cloze deletion format
	 * Example: "The capital of France is {Paris}."
	 * Creates one card per cloze
	 */
	private parseCloze(text: string, sourcePath: string, lineNumber: number, deckName: string): FlashlyCard[] {
		const cards: FlashlyCard[] = [];
		
		// Find all cloze deletions (handle nested braces)
		const clozeRegex = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
		const matches = Array.from(text.matchAll(clozeRegex));
		
		if (matches.length === 0) {
			return cards;
		}
		
		// Create one card per cloze
		matches.forEach((match, index) => {
			const clozeText = match[1];
			
			// Create front by replacing current cloze with [...] and showing others
			let front = text;
			let replacementCount = 0;
			front = front.replace(clozeRegex, (m, p1) => {
				if (replacementCount === index) {
					replacementCount++;
					return '[...]';
				}
				replacementCount++;
				return p1; // Show other clozes as plain text
			});
			
			// Create FSRS card
			const fsrsCard = createEmptyCard(new Date());

			// Create FlashlyCard
			const card = createFlashlyCard(
				front,
				clozeText,
				sourcePath,
				lineNumber,
				fsrsCard,
				deckName
			);

			cards.push(card);
		});

		return cards;
	}
}

/**
 * Convenience function to parse content with default settings
 */
export function parseInlineFlashcards(
	content: string,
	sourcePath: string,
	settings?: Partial<InlineParserSettings>
): FlashlyCard[] {
	const defaultSettings: InlineParserSettings = {
		enabled: true,
		enableQA: true,
		enableMultiLine: true,
		enableCloze: true,
		createEmptyCards: true,
	};
	
	const parser = new InlineParser({ ...defaultSettings, ...settings });
	return parser.parse(content, sourcePath);
}
