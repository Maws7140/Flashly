/**
 * Jest setup file
 * Runs before all tests to configure the test environment
 */

// Mock DOM APIs that may not be available in Node environment
global.document = {
  createElement: (tagName: string) => ({
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(),
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    innerHTML: '',
    textContent: '',
    style: {},
  }),
} as any;

global.window = {
  setInterval: jest.fn((callback, delay) => {
    return setTimeout(callback, delay);
  }),
  clearInterval: jest.fn(),
} as any;

// Utility functions for tests
export function createMockTFile(path: string, content = ''): any {
  return {
    path,
    basename: path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '',
    extension: path.split('.').pop() || 'md',
    stat: {
      ctime: Date.now(),
      mtime: Date.now(),
      size: content.length,
    },
    _content: content, // Store content for mock read
  };
}

export function createMockCachedMetadata(overrides: any = {}): any {
  return {
    frontmatter: {},
    headings: [],
    tags: [],
    ...overrides,
  };
}

export function createMockApp(): any {
  return {
    vault: {
      getMarkdownFiles: jest.fn(() => []),
      read: jest.fn((file: any) => Promise.resolve(file._content || '')),
      modify: jest.fn(() => Promise.resolve()),
      getAbstractFileByPath: jest.fn(() => null),
    },
    workspace: {
      getActiveFile: jest.fn(() => null),
      getActiveViewOfType: jest.fn(() => null),
      on: jest.fn(() => ({ unsubscribe: jest.fn() })),
    },
    metadataCache: {
      getFileCache: jest.fn(() => null),
      on: jest.fn(() => ({ unsubscribe: jest.fn() })),
    },
  };
}

export function createMockPlugin(): any {
  const plugin = {
    app: createMockApp(),
    manifest: {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    },
    loadData: jest.fn(() => Promise.resolve({})),
    saveData: jest.fn(() => Promise.resolve()),
    addCommand: jest.fn(),
    addRibbonIcon: jest.fn(() => ({
      addClass: jest.fn(),
    })),
    addStatusBarItem: jest.fn(() => ({
      setText: jest.fn(),
    })),
    addSettingTab: jest.fn(),
    registerDomEvent: jest.fn(),
    registerInterval: jest.fn(),
  };
  
  return plugin;
}
