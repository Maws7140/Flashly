import { StorageService } from '../src/services/storage-service';
import { createMockPlugin } from './setup';

describe('Deck metadata (star/archive)', () => {
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let service: StorageService;

  beforeEach(async () => {
    mockPlugin = createMockPlugin();
    mockPlugin.loadData.mockResolvedValue(null);
    service = new StorageService(mockPlugin);
    await service.load();
  });

  it('toggles starred state and persists it', async () => {
    expect(service.isDeckStarred('Alpha')).toBe(false);
    service.toggleDeckStarred('Alpha');
    expect(service.isDeckStarred('Alpha')).toBe(true);

    await service.save();
    const saved = mockPlugin.saveData.mock.calls[0][0];
    expect(saved.decks).toBeDefined();
    expect(saved.decks.Alpha).toBeDefined();
    expect(saved.decks.Alpha.starred).toBe(true);

    // Reload into new instance
    const reloadedPlugin = createMockPlugin();
    reloadedPlugin.loadData.mockResolvedValue(saved);
    const reloaded = new StorageService(reloadedPlugin);
    await reloaded.load();
    expect(reloaded.isDeckStarred('Alpha')).toBe(true);
  });

  it('toggles archived state and persists it', async () => {
    expect(service.isDeckArchived('Beta')).toBe(false);
    service.toggleDeckArchived('Beta');
    expect(service.isDeckArchived('Beta')).toBe(true);

    await service.save();
    const saved = mockPlugin.saveData.mock.calls[0][0];
    expect(saved.decks).toBeDefined();
    expect(saved.decks.Beta).toBeDefined();
    expect(saved.decks.Beta.archived).toBe(true);

    // Reload into new instance
    const reloadedPlugin = createMockPlugin();
    reloadedPlugin.loadData.mockResolvedValue(saved);
    const reloaded = new StorageService(reloadedPlugin);
    await reloaded.load();
    expect(reloaded.isDeckArchived('Beta')).toBe(true);
  });
});
