/**
 * Audio Utilities - Handle audio file processing in flashcards
 * Converts audio wikilinks to HTML audio tags and manages audio playback
 */

import { App, TFile } from 'obsidian';

/**
 * Audio file extensions supported
 */
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

/**
 * Convert Obsidian audio wikilinks to HTML audio tags
 * Example: ![[audio.mp3]] -> <audio src="resolved-path" controls></audio>
 */
export function convertAudioWikilinks(markdown: string, sourcePath: string, app: App): string {
	// Regex to match audio wikilinks: ![[audio.mp3]] or ![[folder/audio.mp3]]
	const audioWikilinkRegex = /!\[\[([^\]]+)\]\]/g;
	
	return markdown.replace(audioWikilinkRegex, (match, path) => {
		// Extract path (handle pipes for alt text: ![[audio.mp3|description]])
		const pathParts = path.split('|');
		const audioPath = pathParts[0].trim();
		
		// Check if it's an audio file by extension
		const ext = audioPath.split('.').pop()?.toLowerCase();
		if (!ext || !AUDIO_EXTENSIONS.includes(ext)) {
			// Not an audio file, return original match
			return match;
		}
		
		// Resolve the audio file path
		const resolvedPath = resolveAudioPath(audioPath, sourcePath, app);
		if (!resolvedPath) {
			// File not found, return original match (will show broken link)
			return match;
		}
		
		// Convert to HTML audio tag with controls
		return `<audio src="${resolvedPath}" controls></audio>`;
	});
}

/**
 * Resolve audio file path to a resource URL compatible with HTML5 audio element
 * Returns the vault path that can be used in audio src attribute
 */
export function resolveAudioPath(path: string, sourcePath: string, app: App): string | null {
	// Remove URL fragments and query params
	path = path.split('#')[0].split('?')[0];
	
	// Handle absolute URLs (skip)
	if (path.startsWith('http://') || path.startsWith('https://')) {
		return path;
	}
	
	// Try to find file using Obsidian's link resolution
	const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
	if (file instanceof TFile) {
		// Return the vault path - Obsidian will handle resource URL conversion
		return file.path;
	}
	
	// Try as direct vault path
	const directFile = app.vault.getAbstractFileByPath(path);
	if (directFile instanceof TFile) {
		return directFile.path;
	}
	
	// Try resolving relative to source file directory
	const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
	const relativePath = normalizePath(`${sourceDir}/${path}`);
	const relativeFile = app.vault.getAbstractFileByPath(relativePath);
	if (relativeFile instanceof TFile) {
		return relativeFile.path;
	}
	
	// File not found
	return null;
}

/**
 * Post-process rendered DOM to fix audio element paths
 * Ensures audio src attributes point to correct resource URLs
 */
export function postProcessAudioElements(container: HTMLElement, app: App, sourcePath: string): void {
	const audioElements = container.querySelectorAll('audio');
	
	audioElements.forEach((audioEl) => {
		const src = audioEl.getAttribute('src');
		if (!src) {
			return;
		}
		
		// If it's already a full URL, skip
		if (src.startsWith('http://') || src.startsWith('https://')) {
			return;
		}
		
		// Resolve the path to a vault file
		const resolvedPath = resolveAudioPath(src, sourcePath, app);
		if (resolvedPath) {
			const file = app.vault.getAbstractFileByPath(resolvedPath);
			if (file instanceof TFile) {
				// Use Obsidian's resource path system
				// Obsidian uses vault.adapter.getResourcePath() for resource URLs
				try {
					const resourcePath = (app.vault.adapter as any).getResourcePath(file.path);
					if (resourcePath) {
						audioEl.setAttribute('src', resourcePath);
					}
				} catch (e) {
					// Fallback: use the file path directly
					// MarkdownRenderer might handle it automatically
					audioEl.setAttribute('src', resolvedPath);
				}
			}
		}
	});
}

/**
 * Extract audio wikilinks from markdown text
 * Returns array of audio wikilink strings found in the text
 * Example: "Text ![[audio.mp3]] more text" -> ["![[audio.mp3]]"]
 */
export function extractAudioWikilinks(markdown: string): string[] {
	const audioWikilinks: string[] = [];
	const audioWikilinkRegex = /!\[\[([^\]]+)\]\]/g;
	
	let match;
	while ((match = audioWikilinkRegex.exec(markdown)) !== null) {
		const fullMatch = match[0]; // Full match including ![[...]]
		const path = match[1]; // Path inside brackets
		
		// Extract path (handle pipes for alt text: ![[audio.mp3|description]])
		const pathParts = path.split('|');
		const audioPath = pathParts[0].trim();
		
		// Check if it's an audio file by extension
		const ext = audioPath.split('.').pop()?.toLowerCase();
		if (ext && AUDIO_EXTENSIONS.includes(ext)) {
			audioWikilinks.push(fullMatch);
		}
	}
	
	return audioWikilinks;
}

/**
 * Remove audio wikilinks from markdown text
 * Returns text with audio wikilinks removed
 */
export function removeAudioWikilinks(markdown: string): string {
	const audioWikilinkRegex = /!\[\[([^\]]+)\]\]/g;
	
	return markdown.replace(audioWikilinkRegex, (match, path) => {
		// Extract path (handle pipes for alt text: ![[audio.mp3|description]])
		const pathParts = path.split('|');
		const audioPath = pathParts[0].trim();
		
		// Check if it's an audio file by extension
		const ext = audioPath.split('.').pop()?.toLowerCase();
		if (ext && AUDIO_EXTENSIONS.includes(ext)) {
			// Remove the audio wikilink
			return '';
		}
		
		// Not an audio file, keep original
		return match;
	}).replace(/\n\s*\n\s*\n/g, '\n\n'); // Clean up extra blank lines
}

/**
 * Normalize path (remove ../ and ./)
 */
function normalizePath(path: string): string {
	const parts = path.split('/');
	const result: string[] = [];
	
	for (const part of parts) {
		if (part === '.' || part === '') {
			continue;
		} else if (part === '..') {
			result.pop();
		} else {
			result.push(part);
		}
	}
	
	return result.join('/');
}
