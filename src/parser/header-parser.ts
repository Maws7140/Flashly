import { FlashlyCard, createFlashlyCard } from '../models/card';
import { createEmptyCard } from 'ts-fsrs';
import { TFile, CachedMetadata, App } from 'obsidian';

/**
 * Settings for header-based parser
 */
export interface HeaderParserSettings {
	enabled: boolean;
	flashcardTags: string[];
	headerLevels: number[];
	deckNamePriority: ('frontmatter' | 'title' | 'subtags')[];
	useSubtags: boolean;
	answerTerminator: 'next-header' | 'blank-line' | 'hr';
	createEmptyCards: boolean;
	enableExclusion: boolean;
	exclusionComment: string;
}

interface Header {
	level: number;
	text: string;
	lineNumber: number;
}

/**
 * Header-Based Parser for Phase 1
 * Parses notes with #flashcards tag, converting headers to flashcards
 */
export class HeaderParser {
	constructor(
		private settings: HeaderParserSettings,
		private app: App
	) {}

	/**
	 * Check if note has a flashcard tag
	 * This determines whether the file should be parsed at all (for both header and inline formats).
	 * Checks both frontmatter tags and inline tags in the content.
	 * 
	 * @param file - File to check
	 * @returns True if file has any configured flashcard tag (e.g., #flashcards, #cards)
	 */
	hasFlashcardTag(file: TFile): boolean {
		const metadata = this.app.metadataCache.getFileCache(file);
		if (!metadata) return false;

		const allTags: string[] = [];

		// Collect frontmatter tags
		if (metadata.frontmatter?.tags) {
			const fmTags = Array.isArray(metadata.frontmatter.tags)
				? metadata.frontmatter.tags
				: [metadata.frontmatter.tags];
			// Normalize frontmatter tags: convert to string, trim, strip leading '#', filter empty
			allTags.push(...fmTags
				.filter(t => t != null)
				.map(t => String(t).trim().replace(/^#/, ''))
				.filter(t => t.length > 0)
			);
		}

		// Collect inline tags (these include the # prefix, e.g., "#flashcards")
		if (metadata.tags) {
			// Strip the # prefix from inline tags for comparison
			allTags.push(...metadata.tags.map(t => t.tag.replace(/^#/, '')));
		}

		// Check if any tag matches configured flashcard tags
		return allTags.some((tag: string) =>
			this.settings.flashcardTags.some(fcTag =>
				tag === fcTag || tag.startsWith(`${fcTag}/`)
			)
		);
	}

	/**
	 * Get deck name using priority: frontmatter → title → subtags
	 */
	getDeckName(file: TFile, metadata: CachedMetadata): string {
		for (const source of this.settings.deckNamePriority) {
			let deckName: string | null = null;

			switch (source) {
				case 'frontmatter':
					deckName = metadata.frontmatter?.deck;
					break;

				case 'subtags':
					if (this.settings.useSubtags) {
						const allTags: string[] = [];

						// Collect frontmatter tags
						if (metadata.frontmatter?.tags) {
							const fmTags = Array.isArray(metadata.frontmatter.tags)
								? metadata.frontmatter.tags
								: [metadata.frontmatter.tags];
							allTags.push(...(fmTags as string[]));
						}

						// Collect inline tags (strip # prefix)
						if (metadata.tags) {
							allTags.push(...metadata.tags.map(t => t.tag.replace(/^#/, '')));
						}

						// Look for subtags
						for (const tag of allTags) {
							for (const fcTag of this.settings.flashcardTags) {
								if (tag.startsWith(`${fcTag}/`)) {
									deckName = tag.substring(fcTag.length + 1);
									break;
								}
							}
							if (deckName) break;
						}
					}
					break;

				case 'title':
					deckName = file.basename;
					break;
			}

			if (deckName) return deckName;
		}

		// Fallback to note title
		return file.basename;
	}

	/**
	 * Parse note and extract flashcards from headers
	 */
	async parse(file: TFile): Promise<FlashlyCard[]> {
		if (!this.hasFlashcardTag(file)) {
			return [];
		}

		const content = await this.app.vault.read(file);
		const metadata = this.app.metadataCache.getFileCache(file);
		if (!metadata) return [];

		const deckName = this.getDeckName(file, metadata);
		const tags = this.extractTags(metadata);

		const lines = content.split('\n');
		const headers = this.extractHeaders(lines);
		const cards: FlashlyCard[] = [];

		for (let i = 0; i < headers.length; i++) {
			const header = headers[i];

			// Skip if header level not configured
			if (!this.settings.headerLevels.includes(header.level)) {
				continue;
			}

			const nextHeader = headers[i + 1];
			const answerEnd = nextHeader ? nextHeader.lineNumber : lines.length;

			const answer = this.extractAnswer(
				lines,
				header.lineNumber + 1,
				answerEnd
			);

			// Create card even if answer is empty (if configured)
			if (answer.trim() || this.settings.createEmptyCards) {
				const fsrsCard = createEmptyCard(new Date());

				const card = createFlashlyCard(
					header.text,
					answer,
					file.path,
					header.lineNumber + 1,
					fsrsCard,
					deckName,
					tags
				);

				cards.push(card);
			}
		}

		return cards;
	}

	/**
	 * Extract headers from content
	 */
	private extractHeaders(lines: string[]): Header[] {
		const headers: Header[] = [];
		let inCodeBlock = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Track code blocks
			if (line.trim().startsWith('```')) {
				inCodeBlock = !inCodeBlock;
				continue;
			}

			if (inCodeBlock) continue;

			// Check for exclusion comment above header
			if (this.settings.enableExclusion && i > 0) {
				const prevLine = lines[i - 1].trim();
				if (prevLine.includes(`<!-- ${this.settings.exclusionComment} -->`)) {
					continue; // Skip this header
				}
			}

			// Parse ATX-style headers (# Header)
			const match = line.match(/^(#{1,6})\s+(.+)$/);
			if (match) {
				const level = match[1].length;

				// Only include headers at configured levels
				if (this.settings.headerLevels.includes(level)) {
					headers.push({
						level: level,
						text: match[2].trim(),
						lineNumber: i
					});
				}
			}
		}

		return headers;
	}

	/**
	 * Extract answer content between headers
	 */
	private extractAnswer(
		lines: string[],
		startLine: number,
		endLine: number
	): string {
		const answerLines: string[] = [];

		for (let i = startLine; i < endLine; i++) {
			const line = lines[i];

			// Handle different termination rules
			if (this.settings.answerTerminator === 'blank-line') {
				if (line.trim() === '' && answerLines.length > 0) {
					break;
				}
			} else if (this.settings.answerTerminator === 'hr') {
				if (line.trim().match(/^[-*_]{3,}$/)) {
					break;
				}
			}

			answerLines.push(line);
		}

		return answerLines.join('\n').trim();
	}

	/**
	 * Extract tags from metadata
	 */
	private extractTags(metadata: CachedMetadata): string[] {
		const tags: string[] = [];

		// Frontmatter tags
		if (metadata.frontmatter?.tags) {
			const fmTags = Array.isArray(metadata.frontmatter.tags)
				? metadata.frontmatter.tags
				: [metadata.frontmatter.tags];
			tags.push(...(fmTags as string[]));
		}

		// Inline tags (from metadata cache)
		if (metadata.tags) {
			tags.push(...metadata.tags.map(t => t.tag));
		}

		// Deduplicate
		const seen = new Set<string>();
		const unique: string[] = [];
		for (const tag of tags) {
			if (!seen.has(tag)) {
				seen.add(tag);
				unique.push(tag);
			}
		}
		return unique;
	}
}

/**
 * Convenience function to parse a file with default settings
 */
export async function parseHeaderFlashcards(
	file: TFile,
	app: App,
	settings?: Partial<HeaderParserSettings>
): Promise<FlashlyCard[]> {
	const defaultSettings: HeaderParserSettings = {
		enabled: true,
		flashcardTags: ['flashcards'],
		headerLevels: [2, 3, 4, 5, 6],
		deckNamePriority: ['frontmatter', 'title', 'subtags'],
		useSubtags: true,
		answerTerminator: 'next-header',
		createEmptyCards: true,
		enableExclusion: true,
		exclusionComment: 'flashcard:skip',
	};

	const parser = new HeaderParser({ ...defaultSettings, ...settings }, app);
	return parser.parse(file);
}
