import { MediaExtractor } from '../src/utils/media-extractor';
import { App, TFile } from 'obsidian';

describe('MediaExtractor', () => {
  let app: App;
  let extractor: MediaExtractor;

  beforeEach(() => {
    app = new App();
    extractor = new MediaExtractor(app);

    // Mock metadataCache.getFirstLinkpathDest
    app.metadataCache.getFirstLinkpathDest = jest.fn((path: string, sourcePath: string) => {
      if (path === 'image' || path === 'image.png') {
        const file = new TFile();
        file.path = 'image.png';
        file.extension = 'png';
        return file;
      }
      return null;
    });

    // Mock vault.getAbstractFileByPath
    app.vault.getAbstractFileByPath = jest.fn((path: string) => {
      if (path === 'image.png') {
        const file = new TFile();
        file.path = 'image.png';
        file.extension = 'png';
        return file;
      }
      return null;
    });
  });

  test('should extract media with extension', () => {
    const content = '![[image.png]]';
    const refs = extractor.extractFromMarkdown(content, 'source.md');
    expect(refs).toHaveLength(1);
    expect(refs[0].vaultPath).toBe('image.png');
    expect(refs[0].type).toBe('image');
    // Verify originalPath contains extracted path, not full wikilink syntax
    expect(refs[0].originalPath).toBe('image.png');
    expect(refs[0].originalPath).not.toContain('![');
    expect(refs[0].originalPath).not.toContain(']]');
  });

  test('should extract media without extension', () => {
    const content = '![[image]]';
    const refs = extractor.extractFromMarkdown(content, 'source.md');
    expect(refs).toHaveLength(1); // This is expected to fail currently
    expect(refs[0].vaultPath).toBe('image.png');
    expect(refs[0].type).toBe('image');
  });
});
