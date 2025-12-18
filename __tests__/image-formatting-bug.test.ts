
import { convertMarkdownToHTML } from '../src/utils/markdown-to-html';

describe('Image Formatting Bug', () => {
  it('should not mangle image filenames with underscores', () => {
    const md = '![[Gemini_Generated_Image_piscyk.png]]';
    const html = convertMarkdownToHTML(md);
    expect(html).toContain('<img src="Gemini_Generated_Image_piscyk.png"');
    expect(html).not.toContain('<em>');
  });

  it('should not mangle standard markdown images with underscores', () => {
    const md = '![alt](Gemini_Generated_Image_piscyk.png)';
    const html = convertMarkdownToHTML(md);
    expect(html).toContain('<img src="Gemini_Generated_Image_piscyk.png"');
    expect(html).not.toContain('<em>');
  });

  it('should not mangle links with underscores', () => {
    const md = '[link_with_underscores](http://example.com/path_with_underscores)';
    const html = convertMarkdownToHTML(md);
    expect(html).toContain('href="http://example.com/path_with_underscores"');
    expect(html).not.toContain('<em>');
  });
});
