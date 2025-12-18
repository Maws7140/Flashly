import { App, TFile, Vault } from 'obsidian';
import { FlashlyCard } from '../models/card';
import { AnkiTransformer, AnkiCard } from './export-transformers/anki-transformer';
import { ExportOptions } from './export-transformers/base-transformer';
import { MediaReference } from '../utils/media-extractor';

/**
 * AnkiConnect Service
 */
export class AnkiConnectService {
  private url: string;
  private transformer: AnkiTransformer;

  constructor(url = 'http://127.0.0.1:8765', private app?: App) {
    this.url = url;
    this.transformer = new AnkiTransformer(app);
  }

  // ... [Connection/Version/Model methods remain the same] ...

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.invoke('version', 6);
      return response !== null;
    } catch (error) {
      return false;
    }
  }

  async getVersion(): Promise<number | null> {
    try {
      return await this.invoke('version', 6);
    } catch (error) {
      console.error('Failed to get Anki version:', error);
      return null;
    }
  }

  async getDeckNames(): Promise<string[]> {
    try {
      return await this.invoke('deckNames', 6);
    } catch (error) {
      console.error('Failed to get deck names:', error);
      return [];
    }
  }

  async getModelNames(): Promise<string[]> {
    try {
      return await this.invoke('modelNames', 6);
    } catch (error) {
      console.error('Failed to get model names:', error);
      return [];
    }
  }

  async getModelFieldNames(modelName: string): Promise<string[]> {
    try {
      return await this.invoke('modelFieldNames', 6, { modelName });
    } catch (error) {
      console.error(`Failed to get field names for model ${modelName}:`, error);
      return [];
    }
  }

  async createDeck(deckName: string): Promise<boolean> {
    try {
      await this.invoke('createDeck', 6, { deck: deckName });
      return true;
    } catch (error) {
      console.error(`Failed to create deck ${deckName}:`, error);
      return false;
    }
  }

  /**
   * Add a single note to Anki
   */
  async addNote(
    deckName: string,
    front: string,
    back: string,
    tags: string[] = []
  ): Promise<number | null> {
    try {
      const noteId = await this.invoke('addNote', 6, {
        note: {
          deckName,
          modelName: 'Basic',
          fields: {
            Front: front,
            Back: back
          },
          tags,
          options: {
            allowDuplicate: false
          }
        }
      });
      return noteId;
    } catch (error) {
      console.error('[AnkiConnect] Failed to add note:', error);
      throw error;
    }
  }

  /**
   * Sync cards from Flashly to Anki
   */
  async syncCards(
    cards: FlashlyCard[],
    options: ExportOptions,
    vault?: Vault
  ): Promise<{
    success: number;
    failed: number;
    skipped: number;
    mediaUploaded: number;
    mediaFailed: number;
    errors: string[];
  }> {
    // 1. Transform cards (This now handles the Regex replacement for <img src> internally)
    const ankiCards = this.transformer.transform(cards, options);
    
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      mediaUploaded: 0,
      mediaFailed: 0,
      errors: [] as string[]
    };

    // 2. Validate Basic Note Type
    const models = await this.getModelNames();
    if (!models.includes('Basic')) {
      throw new Error('Anki note type "Basic" not found.');
    }

    // 3. Create Decks
    const uniqueDecks = new Set(ankiCards.map(card => card.deckName));
    for (const deckName of uniqueDecks) {
      await this.createDeck(deckName);
    }

    // 4. Handle Media (Batch Upload)
    if (options.includeMedia && vault) {
      const allMedia = new Map<string, MediaReference>();
      
      // Deduplicate media across all cards
      for (const card of ankiCards) {
        if (card.media) {
          for (const ref of card.media) {
            allMedia.set(ref.ankiFilename, ref);
          }
        }
      }

      if (allMedia.size > 0) {
        console.log(`[AnkiConnect] Batch uploading ${allMedia.size} images...`);
        const mediaResults = await this.uploadMediaBatch([...allMedia.values()], vault);
        
        results.mediaUploaded = mediaResults.uploaded;
        results.mediaFailed = mediaResults.failed;
        results.errors.push(...mediaResults.errors);
      }
    }

    // 5. Add Notes
    console.log(`[AnkiConnect] Syncing ${ankiCards.length} notes...`);
    for (const card of ankiCards) {
      try {
        const noteId = await this.addNote(
          card.deckName,
          card.fields.Front,
          card.fields.Back,
          card.tags
        );

        if (noteId) {
          results.success++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        if (error.message && error.message.includes('duplicate')) {
          results.skipped++;
        } else {
          results.failed++;
          results.errors.push(`Failed card: "${card.fields.Front.substring(0, 20)}..." - ${error.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Upload multiple media files using AnkiConnect's 'multi' action.
   * This is significantly faster than uploading one by one.
   */
  async uploadMediaBatch(
    references: MediaReference[],
    vault: Vault
  ): Promise<{ uploaded: number; failed: number; errors: string[] }> {
    const results = { uploaded: 0, failed: 0, errors: [] as string[] };
    const actions: any[] = [];
    const processedRefs: string[] = []; // To track which ones we are sending

    // 1. Prepare all payloads locally
    for (const ref of references) {
      try {
        const file = vault.getAbstractFileByPath(ref.vaultPath);
        
        if (!(file instanceof TFile)) {
          results.failed++;
          results.errors.push(`File not found: ${ref.vaultPath}`);
          continue;
        }

        const fileBuffer = await vault.readBinary(file);
        
        // Use Node/Electron Buffer for fast Base64 conversion
        const base64Data = Buffer.from(fileBuffer).toString('base64');

        // Primary filename used by current exporter (<img src="ankiFilename">)
        actions.push({
          action: 'storeMediaFile',
          params: {
            filename: ref.ankiFilename,
            data: base64Data
          }
        });
        processedRefs.push(ref.ankiFilename);

        // Backwards-compat alias: also store under the original path/filename
        // used in older exports (<img src="legacyFilename">), if available.
        if (ref.legacyFilename && ref.legacyFilename !== ref.ankiFilename) {
          actions.push({
            action: 'storeMediaFile',
            params: {
              filename: ref.legacyFilename,
              data: base64Data
            }
          });
          processedRefs.push(ref.legacyFilename);
        }

      } catch (error) {
        results.failed++;
        results.errors.push(`Read error ${ref.vaultPath}: ${error.message}`);
      }
    }

    if (actions.length === 0) return results;

    // 2. Send single Batch Request to Anki
    try {
      const response = await this.invoke('multi', 6, { actions });
      
      // response is an array of results matching the actions array order
      // storeMediaFile returns the filename on success, or null/error
      
      if (Array.isArray(response)) {
        response.forEach((item, index) => {
          if (item && !item.error) {
            results.uploaded++;
          } else {
            results.failed++;
            results.errors.push(`Anki refused: ${processedRefs[index]}`);
          }
        });
      } else {
         // Fallback if response isn't array (unexpected)
         results.uploaded = actions.length;
      }

    } catch (error) {
      console.error('[AnkiConnect] Batch upload failed:', error);
      results.failed += actions.length;
      results.errors.push(`Batch upload failed: ${error.message}`);
    }

    return results;
  }

  /**
   * Invoke an AnkiConnect action
   */
  private async invoke(action: string, version: number, params: any = {}): Promise<any> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version, params })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      return data.result;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('CORS error: AnkiConnect must allow origin "app://obsidian.md".');
      }
      throw error;
    }
  }
}