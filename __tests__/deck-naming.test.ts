/**
 * Tests for deck naming utilities
 * Tests deck name extraction, hierarchy parsing, and relationship functions
 */

import {
	getDeckName,
	normalizeDeckName,
	parseDeckPath,
	isChildDeck,
	getParentDeck,
	getDepth,
	getAllDescendants,
	getDirectChildren,
} from '../src/utils/deck-naming';
import { createMockTFile, createMockCachedMetadata } from './setup';

describe('Deck Naming Utilities', () => {
	describe('normalizeDeckName', () => {
		it('should trim spaces from segments', () => {
			expect(normalizeDeckName(' Math / Algebra ')).toBe('Math/Algebra');
		});

		it('should remove leading and trailing slashes', () => {
			expect(normalizeDeckName('/Math/Algebra/')).toBe('Math/Algebra');
		});

		it('should collapse consecutive slashes', () => {
			expect(normalizeDeckName('Math//Algebra///Quadratics')).toBe('Math/Algebra/Quadratics');
		});

		it('should handle empty string', () => {
			expect(normalizeDeckName('')).toBe('');
		});

		it('should handle single segment', () => {
			expect(normalizeDeckName('Math')).toBe('Math');
		});

		it('should handle only slashes', () => {
			expect(normalizeDeckName('///')).toBe('');
		});
	});

	describe('parseDeckPath', () => {
		it('should split simple deck name', () => {
			expect(parseDeckPath('Math')).toEqual(['Math']);
		});

		it('should split hierarchical deck name', () => {
			expect(parseDeckPath('Math/Algebra/Quadratics')).toEqual(['Math', 'Algebra', 'Quadratics']);
		});

		it('should normalize before splitting', () => {
			expect(parseDeckPath(' Math / Algebra ')).toEqual(['Math', 'Algebra']);
		});

		it('should handle empty string', () => {
			expect(parseDeckPath('')).toEqual([]);
		});

		it('should filter out empty segments', () => {
			expect(parseDeckPath('Math//Algebra')).toEqual(['Math', 'Algebra']);
		});
	});

	describe('getDeckName', () => {
		const file = createMockTFile('test.md');

		it('should use frontmatter deck when priority includes it first', () => {
			const metadata = createMockCachedMetadata({
				frontmatter: {
					deck: 'Custom Deck',
				},
			});

			const result = getDeckName(file, metadata, ['frontmatter', 'title'], true, ['flashcards']);
			expect(result).toBe('Custom Deck');
		});

		it('should use subtags when frontmatter is not available', () => {
			const metadata = createMockCachedMetadata({
				tags: [
					{
						tag: '#flashcards/math/algebra',
						position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 24, offset: 24 } },
					},
				],
			});

			const result = getDeckName(file, metadata, ['frontmatter', 'subtags', 'title'], true, ['flashcards']);
			expect(result).toBe('math/algebra');
		});

		it('should use title when other sources not available', () => {
			const metadata = createMockCachedMetadata({});

			const result = getDeckName(file, metadata, ['frontmatter', 'subtags', 'title'], true, ['flashcards']);
			expect(result).toBe('test');
		});

		it('should respect priority order', () => {
			const metadata = createMockCachedMetadata({
				frontmatter: {
					deck: 'Frontmatter Deck',
					tags: ['flashcards/subtag/deck'],
				},
			});

			// Frontmatter first
			const result1 = getDeckName(file, metadata, ['frontmatter', 'subtags', 'title'], true, ['flashcards']);
			expect(result1).toBe('Frontmatter Deck');

			// Subtags first
			const result2 = getDeckName(file, metadata, ['subtags', 'frontmatter', 'title'], true, ['flashcards']);
			expect(result2).toBe('subtag/deck');
		});

		it('should extract deck from frontmatter tags array', () => {
			const metadata = createMockCachedMetadata({
				frontmatter: {
					tags: ['flashcards/science/biology', 'other-tag'],
				},
			});

			const result = getDeckName(file, metadata, ['subtags', 'title'], true, ['flashcards']);
			expect(result).toBe('science/biology');
		});

		it('should handle null metadata', () => {
			const result = getDeckName(file, null, ['frontmatter', 'subtags', 'title'], true, ['flashcards']);
			expect(result).toBe('test');
		});

		it('should not use subtags when useSubtags is false', () => {
			const metadata = createMockCachedMetadata({
				tags: [
					{
						tag: '#flashcards/math/algebra',
						position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 24, offset: 24 } },
					},
				],
			});

			const result = getDeckName(file, metadata, ['subtags', 'title'], false, ['flashcards']);
			expect(result).toBe('test'); // Falls back to title
		});

		it('should normalize deck names', () => {
			const metadata = createMockCachedMetadata({
				frontmatter: {
					deck: ' Math / Algebra / ',
				},
			});

			const result = getDeckName(file, metadata, ['frontmatter'], true, ['flashcards']);
			expect(result).toBe('Math/Algebra');
		});

		it('should work with multiple flashcard tags', () => {
			const metadata = createMockCachedMetadata({
				tags: [
					{
						tag: '#cards/spanish/verbs',
						position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 20, offset: 20 } },
					},
				],
			});

			const result = getDeckName(file, metadata, ['subtags', 'title'], true, ['flashcards', 'cards']);
			expect(result).toBe('spanish/verbs');
		});
	});

	describe('isChildDeck', () => {
		it('should return true for direct child', () => {
			expect(isChildDeck('Math/Algebra', 'Math')).toBe(true);
		});

		it('should return true for nested child', () => {
			expect(isChildDeck('Math/Algebra/Quadratics', 'Math')).toBe(true);
			expect(isChildDeck('Math/Algebra/Quadratics', 'Math/Algebra')).toBe(true);
		});

		it('should return false for same deck', () => {
			expect(isChildDeck('Math', 'Math')).toBe(false);
		});

		it('should return false for unrelated decks', () => {
			expect(isChildDeck('Science', 'Math')).toBe(false);
			expect(isChildDeck('Science/Biology', 'Math')).toBe(false);
		});

		it('should return false for parent deck', () => {
			expect(isChildDeck('Math', 'Math/Algebra')).toBe(false);
		});

		it('should be case insensitive', () => {
			expect(isChildDeck('MATH/ALGEBRA', 'math')).toBe(true);
			expect(isChildDeck('math/algebra', 'MATH')).toBe(true);
		});

		it('should handle unnormalized deck names', () => {
			expect(isChildDeck(' Math / Algebra ', 'Math')).toBe(true);
			expect(isChildDeck('Math/Algebra/', '/Math/')).toBe(true);
		});

		it('should not match partial segment names', () => {
			// "Math" should not be a parent of "Mathematics"
			expect(isChildDeck('Mathematics', 'Math')).toBe(false);
		});
	});

	describe('getParentDeck', () => {
		it('should return parent for nested deck', () => {
			expect(getParentDeck('Math/Algebra/Quadratics')).toBe('Math/Algebra');
		});

		it('should return parent for direct child', () => {
			expect(getParentDeck('Math/Algebra')).toBe('Math');
		});

		it('should return null for top-level deck', () => {
			expect(getParentDeck('Math')).toBeNull();
		});

		it('should return null for empty string', () => {
			expect(getParentDeck('')).toBeNull();
		});

		it('should handle unnormalized deck names', () => {
			expect(getParentDeck(' Math / Algebra / ')).toBe('Math');
		});
	});

	describe('getDepth', () => {
		it('should return 0 for top-level deck', () => {
			expect(getDepth('Math')).toBe(0);
		});

		it('should return 1 for direct child', () => {
			expect(getDepth('Math/Algebra')).toBe(1);
		});

		it('should return 2 for nested child', () => {
			expect(getDepth('Math/Algebra/Quadratics')).toBe(2);
		});

		it('should return -1 for empty string', () => {
			expect(getDepth('')).toBe(-1);
		});

		it('should handle unnormalized deck names', () => {
			expect(getDepth(' Math / Algebra ')).toBe(1);
		});
	});

	describe('getAllDescendants', () => {
		const allDecks = [
			'Math',
			'Math/Algebra',
			'Math/Algebra/Quadratics',
			'Math/Algebra/Linear',
			'Math/Geometry',
			'Math/Geometry/Triangles',
			'Science',
			'Science/Biology',
		];

		it('should get all descendants of top-level deck', () => {
			const result = getAllDescendants('Math', allDecks);
			expect(result).toHaveLength(5);
			expect(result).toContain('Math/Algebra');
			expect(result).toContain('Math/Algebra/Quadratics');
			expect(result).toContain('Math/Algebra/Linear');
			expect(result).toContain('Math/Geometry');
			expect(result).toContain('Math/Geometry/Triangles');
		});

		it('should get all descendants of mid-level deck', () => {
			const result = getAllDescendants('Math/Algebra', allDecks);
			expect(result).toHaveLength(2);
			expect(result).toContain('Math/Algebra/Quadratics');
			expect(result).toContain('Math/Algebra/Linear');
		});

		it('should return empty array for leaf deck', () => {
			const result = getAllDescendants('Math/Algebra/Quadratics', allDecks);
			expect(result).toHaveLength(0);
		});

		it('should return empty array for non-existent deck', () => {
			const result = getAllDescendants('History', allDecks);
			expect(result).toHaveLength(0);
		});

		it('should not include the deck itself', () => {
			const result = getAllDescendants('Math', allDecks);
			expect(result).not.toContain('Math');
		});
	});

	describe('getDirectChildren', () => {
		const allDecks = [
			'Math',
			'Math/Algebra',
			'Math/Algebra/Quadratics',
			'Math/Algebra/Linear',
			'Math/Geometry',
			'Math/Geometry/Triangles',
			'Science',
			'Science/Biology',
		];

		it('should get only direct children of top-level deck', () => {
			const result = getDirectChildren('Math', allDecks);
			expect(result).toHaveLength(2);
			expect(result).toContain('Math/Algebra');
			expect(result).toContain('Math/Geometry');
		});

		it('should get only direct children of mid-level deck', () => {
			const result = getDirectChildren('Math/Algebra', allDecks);
			expect(result).toHaveLength(2);
			expect(result).toContain('Math/Algebra/Quadratics');
			expect(result).toContain('Math/Algebra/Linear');
		});

		it('should return empty array for leaf deck', () => {
			const result = getDirectChildren('Math/Algebra/Quadratics', allDecks);
			expect(result).toHaveLength(0);
		});

		it('should return empty array for non-existent deck', () => {
			const result = getDirectChildren('History', allDecks);
			expect(result).toHaveLength(0);
		});

		it('should not include nested descendants', () => {
			const result = getDirectChildren('Math', allDecks);
			expect(result).not.toContain('Math/Algebra/Quadratics');
			expect(result).not.toContain('Math/Geometry/Triangles');
		});

		it('should not include the deck itself', () => {
			const result = getDirectChildren('Math', allDecks);
			expect(result).not.toContain('Math');
		});
	});
});
