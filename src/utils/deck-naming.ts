import { TFile, CachedMetadata } from 'obsidian';

/**
 * Get deck name using priority: frontmatter → subtags → title
 * This is the single source of truth for deck naming across all parsers.
 */
export function getDeckName(
	file: TFile,
	metadata: CachedMetadata | null,
	priority: ('frontmatter' | 'title' | 'subtags')[],
	useSubtags: boolean,
	flashcardTags: string[]
): string {
	if (!metadata) return file.basename;

	for (const source of priority) {
		let deckName: string | null = null;

		switch (source) {
			case 'frontmatter':
				deckName = metadata.frontmatter?.deck;
				break;

			case 'subtags':
				if (useSubtags) {
					deckName = extractDeckFromSubtags(metadata, flashcardTags);
				}
				break;

			case 'title':
				deckName = file.basename;
				break;
		}

		if (deckName) return normalizeDeckName(deckName);
	}

	return file.basename; // Fallback
}

/**
 * Extract deck name from subtags (e.g., #flashcards/math/algebra → math/algebra)
 */
function extractDeckFromSubtags(
	metadata: CachedMetadata,
	flashcardTags: string[]
): string | null {
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
		for (const fcTag of flashcardTags) {
			if (tag.startsWith(`${fcTag}/`)) {
				return tag.substring(fcTag.length + 1);
			}
		}
	}

	return null;
}

/**
 * Normalize deck name: trim slashes, collapse consecutive slashes, trim spaces
 */
export function normalizeDeckName(deckName: string): string {
	return deckName
		.split('/')
		.map(s => s.trim())
		.filter(s => s.length > 0)
		.join('/');
}

/**
 * Parse deck path into segments (e.g., "Math/Algebra/Quadratics" → ["Math", "Algebra", "Quadratics"])
 */
export function parseDeckPath(deckName: string): string[] {
	return normalizeDeckName(deckName).split('/').filter(s => s.length > 0);
}

/**
 * Check if childDeck is a descendant of parentDeck
 * E.g., isChildDeck("Math/Algebra", "Math") → true
 */
export function isChildDeck(childDeck: string, parentDeck: string): boolean {
	const normalizedChild = normalizeDeckName(childDeck).toLowerCase();
	const normalizedParent = normalizeDeckName(parentDeck).toLowerCase();

	if (normalizedChild === normalizedParent) return false; // Not a child, it's the same deck

	return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * Get parent deck name, or null if top-level
 * E.g., getParentDeck("Math/Algebra/Quadratics") → "Math/Algebra"
 */
export function getParentDeck(deckName: string): string | null {
	const segments = parseDeckPath(deckName);
	if (segments.length <= 1) return null;

	return segments.slice(0, -1).join('/');
}

/**
 * Get depth of deck in hierarchy (0-indexed)
 * E.g., getDepth("Math") → 0, getDepth("Math/Algebra") → 1
 */
export function getDepth(deckName: string): number {
	return parseDeckPath(deckName).length - 1;
}

/**
 * Get all descendant decks (recursive children)
 */
export function getAllDescendants(deckName: string, allDecks: string[]): string[] {
	return allDecks.filter(d => isChildDeck(d, deckName));
}

/**
 * Get direct children only (immediate next level)
 */
export function getDirectChildren(deckName: string, allDecks: string[]): string[] {
	const parentDepth = getDepth(deckName);
	return getAllDescendants(deckName, allDecks).filter(d => getDepth(d) === parentDepth + 1);
}
