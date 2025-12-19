/**
 * Tests for InlineParser
 * Tests Q::A, multi-line (??), and cloze deletion formats
 */

import { InlineParser, InlineParserSettings } from '../src/parser/inline-parser';
import { createMockApp, createMockTFile, createMockCachedMetadata } from './setup';

describe('InlineParser', () => {
  let parser: InlineParser;
  let settings: InlineParserSettings;

  beforeEach(() => {
    settings = {
      enabled: true,
      enableQA: true,
      enableMultiLine: true,
      enableCloze: true,
      createEmptyCards: true,
    };
    parser = new InlineParser(settings);
  });

  describe('Q::A format', () => {
    it('should parse simple Q::A', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('What is 2+2');
      expect(cards[0].back).toBe('4');
      expect(cards[0].source.line).toBe(1);
    });

    it('should parse multiple Q::A on different lines', () => {
      const content = `What is 2+2::4
What is 3+3::6
What is 4+4::8`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(3);
      expect(cards[0].back).toBe('4');
      expect(cards[1].back).toBe('6');
      expect(cards[2].back).toBe('8');
    });

    it('should handle wikilinks in questions and answers', () => {
      const content = 'What is [[Biology]]::The study of [[Life]]';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('What is [[Biology]]');
      expect(cards[0].back).toBe('The study of [[Life]]');
    });

    it('should handle special characters', () => {
      const content = 'What is "Hello"::A **greeting** phrase';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('What is "Hello"');
      expect(cards[0].back).toBe('A **greeting** phrase');
    });

    it('should skip empty questions or answers', () => {
      // Temporarily disable createEmptyCards for this test
      settings.createEmptyCards = false;
      parser = new InlineParser(settings);
      
      const content = '::empty question\nEmpty answer::';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(0);
    });

    it('should create empty card when enabled', () => {
      const content = 'What needs an answer::';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('What needs an answer');
      expect(cards[0].back).toBe('');
      expect(cards[0].needsFilling).toBe(true);
    });

    it('should not create empty card when disabled', () => {
      settings.createEmptyCards = false;
      parser = new InlineParser(settings);
      
      const content = 'What needs an answer::';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(0);
    });
  });

  describe('Multi-line (??) format', () => {
    it('should parse simple ?? format', () => {
      const content = `Question here?
??
Answer here.`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('Question here?');
      expect(cards[0].back).toBe('Answer here.');
    });

    it('should parse multi-paragraph answers', () => {
      const content = `What is markdown?
??
Markdown is a lightweight markup language.

It uses plain text formatting.`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('What is markdown?');
      expect(cards[0].back).toContain('Markdown is a lightweight markup language');
      expect(cards[0].back).toContain('It uses plain text formatting');
    });

    it('should handle ?? answer terminated by next question', () => {
      const content = `First question?
??
First answer.

Second question?
??
Second answer.`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(2);
      expect(cards[0].front).toBe('First question?');
      expect(cards[0].back).toBe('First answer.');
      expect(cards[1].front).toBe('Second question?');
      expect(cards[1].back).toBe('Second answer.');
    });

    it('should handle empty ?? answer when enabled', () => {
      const content = `Question without answer?
??`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].needsFilling).toBe(true);
    });
  });

  describe('Cloze deletion format', () => {
    it('should parse single cloze', () => {
      const content = 'The capital of France is {Paris}.';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toContain('The capital of France is');
      expect(cards[0].front).toContain('[...]'); // Cloze should be replaced
      expect(cards[0].back).toBe('Paris');
    });

    it('should parse multiple clozes as separate cards', () => {
      const content = 'The capital of {France} is {Paris}.';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(2);
      // First card: cloze "France"
      expect(cards[0].back).toBe('France');
      expect(cards[0].front).toContain('[...]');
      expect(cards[0].front).toContain('Paris'); // Other cloze visible
      
      // Second card: cloze "Paris"
      expect(cards[1].back).toBe('Paris');
      expect(cards[1].front).toContain('[...]');
      expect(cards[1].front).toContain('France'); // Other cloze visible
    });

    it('should handle cloze with complex text', () => {
      const content = 'The formula is {$E = mc^2$}.';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].back).toBe('$E = mc^2$');
    });

    it('should handle nested braces', () => {
      const content = 'JSON uses {{"key": "value"}} notation.';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].back).toBe('{"key": "value"}');
    });

    it('should skip cloze when disabled', () => {
      settings.enableCloze = false;
      parser = new InlineParser(settings);
      
      const content = 'The capital of France is {Paris}.';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(0);
    });
  });

  describe('Mixed formats', () => {
    it('should parse Q::A and ?? in same content', () => {
      const content = `Simple Q::A here

Complex question?
??
Complex answer.

Another Q::A here::answer`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(3);
    });

    it('should parse all three formats together', () => {
      const content = `Q::A format here::answer1

Question2?
??
Answer2.

The {cloze} format.`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should skip empty lines', () => {
      const content = `

Q::A

`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
    });

    it('should handle code blocks', () => {
      const content = `Code example:
\`\`\`
Q::A should not parse in code
\`\`\`
Real Q::A here::answer`;
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      // Q::A format splits on FIRST :: so "Real Q::A here::answer" 
      // becomes front="Real Q" back="A here::answer"
      expect(cards[0].front).toBe('Real Q');
      expect(cards[0].back).toBe('A here::answer');
    });

    it('should preserve markdown formatting', () => {
      const content = '**Bold Q**::*Italic A*';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('**Bold Q**');
      expect(cards[0].back).toBe('*Italic A*');
    });

    it('should handle escaped delimiters', () => {
      const content = 'What is \\::?::A double colon';
      const cards = parser.parse(content, 'test.md');
      
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toContain('::');
    });
  });

  describe('Deck Name Extraction', () => {
    it('should extract deck name from simple path', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'MyNote.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('MyNote');
    });

    it('should extract deck name from Unix path with folders', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'folder/subfolder/Math.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Math');
    });

    it('should extract deck name from Windows path', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'folder\\subfolder\\History.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('History');
    });

    it('should extract deck name from mixed path separators', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'folder/subfolder\\Science.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Science');
    });

    it('should handle path without extension', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, 'folder/MyNote');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('MyNote');
    });

    it('should default to "Default" for empty path', () => {
      const content = 'What is 2+2::4';
      const cards = parser.parse(content, '');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Default');
    });

    it('should assign correct deck name to Q::A cards', () => {
      const content = `What is 2+2::4
What is 3+3::6
What is 5+5::10`;
      const cards = parser.parse(content, 'Math.md');

      expect(cards).toHaveLength(3);
      expect(cards.every((card: { deck: string }) => card.deck === 'Math')).toBe(true);
    });

    it('should assign correct deck name to ?? cards', () => {
      const content = `Question here?
??
Answer here.`;
      const cards = parser.parse(content, 'Literature.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Literature');
    });

    it('should assign correct deck name to cloze cards', () => {
      const content = 'The capital of France is {Paris}.';
      const cards = parser.parse(content, 'WorldCapitals.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('WorldCapitals');
    });

    it('should assign same deck to multiple cloze deletions', () => {
      const content = '{Albert Einstein} developed the theory of {relativity}.';
      const cards = parser.parse(content, 'Physics.md');

      expect(cards).toHaveLength(2);
      expect(cards.every((card: { deck: string }) => card.deck === 'Physics')).toBe(true);
    });

    it('should assign different deck names based on source path', () => {
      const mathCards = parser.parse('What is 2+2::4', 'Math.md');
      const scienceCards = parser.parse('What is photosynthesis::Process by which plants make food', 'Science.md');
      const historyCards = parser.parse('Who was Napoleon::French emperor', 'History.md');

      expect(mathCards[0].deck).toBe('Math');
      expect(scienceCards[0].deck).toBe('Science');
      expect(historyCards[0].deck).toBe('History');
    });

    it('should assign same deck to mixed format types', () => {
      const content = `What is Q::A::This is Q::A format

Multi-line question?
??
Multi-line answer.

The {cloze} format is also supported.`;
      const cards = parser.parse(content, 'MixedFormats.md');

      expect(cards.length).toBeGreaterThanOrEqual(3);
      expect(cards.every((card: { deck: string }) => card.deck === 'MixedFormats')).toBe(true);
    });

    it('should handle absolute Windows paths', () => {
      const content = 'Test question::Test answer';
      const cards = parser.parse(content, 'C:\\Users\\User\\Vault\\MyNote.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('MyNote');
    });

    it('should handle absolute Unix paths', () => {
      const content = 'Test question::Test answer';
      const cards = parser.parse(content, '/home/user/vault/MyNote.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('MyNote');
    });

    it('should handle paths with special characters in folder names', () => {
      const content = 'Test question::Test answer';
      const cards = parser.parse(content, 'My Vault/Sub Folder/My-Note_2024.md');

      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('My-Note_2024');
    });
  });

  describe('Deck naming with metadata', () => {
    const deckConfig = {
      flashcardTags: ['flashcards'],
      deckNamePriority: ['frontmatter', 'subtags', 'title'] as ('frontmatter' | 'title' | 'subtags')[],
      useSubtags: true
    };

    it('uses frontmatter deck when configured', async () => {
      const mockApp = createMockApp();
      const parserWithDecks = new InlineParser(settings, mockApp, deckConfig);
      const file = createMockTFile('Biology.md', 'What is a cell::Basic unit of life');
      const metadata = createMockCachedMetadata({
        frontmatter: {
          deck: 'Custom Deck',
          tags: ['flashcards']
        }
      });

      mockApp.metadataCache.getFileCache = jest.fn(() => metadata);
      mockApp.vault.read = jest.fn(() => Promise.resolve(file._content || ''));

      const cards = await parserWithDecks.parseWithFile(file);
      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Custom Deck');
    });

    it('derives deck from subtags when frontmatter lacks deck', async () => {
      const mockApp = createMockApp();
      const parserWithDecks = new InlineParser(settings, mockApp, deckConfig);
      const file = createMockTFile('Chemistry.md', 'What is H2O::Water');
      const metadata = createMockCachedMetadata({
        frontmatter: {
          tags: ['flashcards/biology']
        }
      });

      mockApp.metadataCache.getFileCache = jest.fn(() => metadata);
      mockApp.vault.read = jest.fn(() => Promise.resolve(file._content || ''));

      const cards = await parserWithDecks.parseWithFile(file);
      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('biology');
    });

    it('falls back to title when subtags are disabled', async () => {
      const mockApp = createMockApp();
      const parserWithDecks = new InlineParser(settings, mockApp, {
        ...deckConfig,
        useSubtags: false
      });
      const file = createMockTFile('Physics.md', 'Law::Force equals mass times acceleration');
      const metadata = createMockCachedMetadata({
        tags: [
          {
            tag: '#flashcards/physics/mechanics',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 25, offset: 25 }
            }
          }
        ]
      });

      mockApp.metadataCache.getFileCache = jest.fn(() => metadata);
      mockApp.vault.read = jest.fn(() => Promise.resolve(file._content || ''));

      const cards = await parserWithDecks.parseWithFile(file);
      expect(cards).toHaveLength(1);
      expect(cards[0].deck).toBe('Physics');
    });
  });
});
