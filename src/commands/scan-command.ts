/**
 * Scan Command - Production replacement for Phase 0 PoC
 * Scans vault for flashcards using FlashcardParser and StorageService
 */

import { App, Notice } from 'obsidian';
import { StorageService } from '../services/storage-service';
import { FlashcardParser } from '../parser/flashcard-parser';
import type FlashlyPlugin from '../../main';

export interface ScanStatistics {
  filesScanned: number;
  cardsFound: number;
  cardsAdded: number;
  cardsUpdated: number;
  cardsDeleted: number;
  errors: number;
}

export class ScanCommand {
  constructor(
    private app: App,
    private storage: StorageService,
    private parser: FlashcardParser,
    private plugin?: FlashlyPlugin
  ) {}

  /**
   * Get command ID for registration
   */
  getId(): string {
    return 'scan-vault';
  }

  /**
   * Get command name for display
   */
  getName(): string {
    return 'Scan vault for flashcards';
  }

  /**
   * Get command callback
   */
  getCallback(): () => Promise<void> {
    return async () => {
      await this.execute();
    };
  }

  /**
   * Execute the scan command
   */
  async execute(): Promise<ScanStatistics> {
    const stats: ScanStatistics = {
      filesScanned: 0,
      cardsFound: 0,
      cardsAdded: 0,
      cardsUpdated: 0,
      cardsDeleted: 0,
      errors: 0
    };

    new Notice('Scanning vault for flashcards...');

    try {
      // Get all markdown files
      const files = this.app.vault.getMarkdownFiles();
      
      // Track existing cards to detect deletions
      const existingCardIds = new Set(
        this.storage.getAllCards().map(card => card.id)
      );
      const foundCardIds = new Set<string>();

      // Scan each file
      for (const file of files) {
        try {
          const cards = await this.parser.parseFile(file);

          stats.filesScanned++;
          stats.cardsFound += cards.length;

          // Process each card
          for (const card of cards) {
            foundCardIds.add(card.id);

            const existing = this.storage.getCard(card.id);
            if (existing) {
              // Preserve fsrsCard and created, only update content fields
              this.storage.updateCard(card.id, {
                front: card.front,
                back: card.back,
                deck: card.deck,
                tags: card.tags,
                needsFilling: card.needsFilling,
                source: card.source
                // fsrsCard and created are NOT included - they are preserved
              });
              stats.cardsUpdated++;
            } else {
              // Add new card
              this.storage.addCard(card);
              stats.cardsAdded++;
            }
          }
        } catch (error) {
          stats.errors++;
          console.error(`Error scanning file ${file.path}:`, error);
        }
      }

      // Remove cards from deleted files/content
      for (const existingId of existingCardIds) {
        if (!foundCardIds.has(existingId)) {
          this.storage.deleteCard(existingId);
          stats.cardsDeleted++;
        }
      }

      // Save updated storage
      await this.storage.save();

      // Refresh browser views to show updated cards
      if (this.plugin) {
        this.plugin.refreshBrowserViews();
      }

      // Show completion notice
      const message = this.formatCompletionMessage(stats);
      new Notice(message);

    } catch (error) {
      new Notice('Error scanning vault: ' + (error as Error).message);
      console.error('Scan error:', error);
    }

    return stats;
  }

  /**
   * Format completion message based on statistics
   */
  private formatCompletionMessage(stats: ScanStatistics): string {
    const parts: string[] = [];

    parts.push(`Found ${stats.cardsFound} flashcard${stats.cardsFound !== 1 ? 's' : ''}`);
    
    if (stats.cardsAdded > 0) {
      parts.push(`${stats.cardsAdded} new`);
    }
    
    if (stats.cardsUpdated > 0) {
      parts.push(`${stats.cardsUpdated} updated`);
    }
    
    if (stats.cardsDeleted > 0) {
      parts.push(`${stats.cardsDeleted} deleted`);
    }
    
    if (stats.errors > 0) {
      parts.push(`${stats.errors} error${stats.errors !== 1 ? 's' : ''}`);
    }

    return parts.join(', ');
  }
}
