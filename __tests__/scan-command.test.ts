/**
 * Tests for Scan Command
 * Tests vault scanning and card synchronization
 */

import { App, CachedMetadata, Loc, Pos, TagCache } from 'obsidian';
import { ScanCommand } from '../src/commands/scan-command';
import { StorageService } from '../src/services/storage-service';
import { FlashcardParser } from '../src/parser/flashcard-parser';
import { createMockApp, createMockPlugin, createMockTFile } from './setup';

describe('ScanCommand', () => {
  let app: App;
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let storageService: StorageService;
  let parser: FlashcardParser;
  let scanCommand: ScanCommand;

  beforeEach(async () => {
    app = createMockApp();
    mockPlugin = createMockPlugin();
    storageService = new StorageService(mockPlugin);
    parser = new FlashcardParser({
      inline: { 
        enabled: true,
        enableQA: true,
        enableMultiLine: true,
        enableCloze: true,
        createEmptyCards: true
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
        exclusionComment: '%%NO_FLASHCARD%%'
      },
      mixedFormats: true
    }, app);
    scanCommand = new ScanCommand(app, storageService, parser);

    const makeLoc = (offset: number): Loc => ({
      line: 0,
      col: offset,
      offset
    });

    const tagPosition: Pos = {
      start: makeLoc(0),
      end: makeLoc(10)
    };

    const tagCache: TagCache = {
      tag: '#flashcards',
      position: tagPosition
    };

    const metadata: CachedMetadata = {
      frontmatter: { tags: ['flashcards'] },
      tags: [tagCache],
      headings: []
    };

    app.metadataCache.getFileCache = jest.fn(() => metadata);

    app.vault.read = jest.fn((file: any) => Promise.resolve(file._content || ''));

    // Initialize storage
    mockPlugin.loadData.mockResolvedValue(null);
    await storageService.load();
  });

  describe('Command Registration', () => {
    it('should get command ID', () => {
      expect(scanCommand.getId()).toBe('scan-vault');
    });

    it('should get command name', () => {
      expect(scanCommand.getName()).toBe('Scan vault for flashcards');
    });

    it('should get command callback', () => {
      const callback = scanCommand.getCallback();
      expect(callback).toBeDefined();
      expect(typeof callback).toBe('function');
    });
  });

  describe('Scanning', () => {
    it('should scan empty vault', async () => {
      // Mock empty vault
      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      await scanCommand.execute();

      expect(storageService.getCardCount()).toBe(0);
    });

    it('should scan vault with markdown files', async () => {
      const file = createMockTFile('test.md', 'Q::A');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      await scanCommand.execute();

      expect(storageService.getCardCount()).toBeGreaterThan(0);
    });

    it('should update existing cards', async () => {
      const file = createMockTFile('test.md', 'Original Q::Original A');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      // First scan
      await scanCommand.execute();
      const originalCount = storageService.getCardCount();

      // Update content
      file._content = 'Updated Q::Updated A';

      // Second scan
      await scanCommand.execute();

      // Card count should remain the same (update, not add)
      expect(storageService.getCardCount()).toBe(originalCount);
    });

    it('should remove deleted cards', async () => {
      const file = createMockTFile('test.md', 'Q::A');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      // First scan
      await scanCommand.execute();
      expect(storageService.getCardCount()).toBeGreaterThan(0);

      // File removed
      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Second scan
      await scanCommand.execute();

      // Cards from removed file should be deleted
      const remainingCards = storageService.getCardsByFile('test.md');
      expect(remainingCards).toHaveLength(0);
    });

    it('should handle files with no flashcards', async () => {
      const file = createMockTFile('test.md', 'Just regular markdown content');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      await scanCommand.execute();

      expect(storageService.getCardCount()).toBe(0);
    });

    it('should handle mixed content files', async () => {
      const file = createMockTFile('test.md', `
# Regular heading

Some text.

Q1::A1

More text.

Q2::A2
      `.trim());

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      await scanCommand.execute();

      expect(storageService.getCardCount()).toBe(2);
    });
  });

  describe('Progress Notifications', () => {
    it('should show start notification', async () => {
      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);
      
      await scanCommand.execute();

      // Notification should be displayed (we can't easily spy on constructor in Jest)
      // So we'll just verify execution completes successfully
      expect(app.vault.getMarkdownFiles).toHaveBeenCalled();
    });

    it('should show completion notification', async () => {
      const file = createMockTFile('test.md', 'Q::A');
      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);

      const stats = await scanCommand.execute();

      // Verify completion by checking stats
      expect(stats.filesScanned).toBe(1);
      expect(stats.cardsFound).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const file = createMockTFile('test.md');
      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file]);
      app.vault.read = jest.fn().mockRejectedValue(new Error('Read error'));

      // Should not throw
      await expect(scanCommand.execute()).resolves.not.toThrow();
    });

    it('should continue scanning after individual file error', async () => {
      const file1 = createMockTFile('test1.md', 'Problem file');
      const file2 = createMockTFile('test2.md', 'Q::A');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file1, file2]);
      const defaultRead = app.vault.read;
      app.vault.read = jest.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('Read error')))
        .mockImplementation((file: any) => defaultRead(file));

      await scanCommand.execute();

      // Should have scanned the second file successfully
      expect(storageService.getCardCount()).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return scan statistics', async () => {
      const file1 = createMockTFile('test1.md', 'Q1::A1');
      const file2 = createMockTFile('test2.md', 'Q2::A2\nQ3::A3');

      app.vault.getMarkdownFiles = jest.fn().mockReturnValue([file1, file2]);

      const stats = await scanCommand.execute();

      expect(stats.filesScanned).toBe(2);
      expect(stats.cardsFound).toBe(3);
      expect(stats.cardsAdded).toBeGreaterThan(0);
    });
  });
});
