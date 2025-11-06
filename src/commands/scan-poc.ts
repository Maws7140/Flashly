import { App, Notice, MarkdownView, Command } from 'obsidian';
import { parseSimpleFlashcards } from '../parser/simple-parser';

/**
 * Phase 0 PoC: Scan active note for Q::A flashcards
 */
export function registerScanPoCCommand(app: App, addCommand: (command: Command) => Command) {
	addCommand({
		id: 'flashly-scan-poc',
		name: 'Scan Active Note (Phase 0 PoC)',
		callback: async () => {
			// Get active markdown view
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			
			if (!view) {
				new Notice('Please open a markdown note first');
				return;
			}
			
			// Get note content and path
			const file = view.file;
			if (!file) {
				new Notice('No active file');
				return;
			}
			
			const content = await app.vault.read(file);
			
			// Parse flashcards
			const cards = parseSimpleFlashcards(content, file.path);
			
			if (cards.length === 0) {
				new Notice('No flashcards found. Use format: Question::Answer');
				return;
			}
			
			new Notice(`Found ${cards.length} flashcard${cards.length !== 1 ? 's' : ''}!`);

			// PoC: display the first card in a notice to avoid full review dependency
			const firstCard = cards[0];
			new Notice(`First card:\n${firstCard.front} -> ${firstCard.back}`);
			console.debug('Parsed cards:', cards);
		}
	});
}
