/**
 * Media Extractor - Extract media references from Markdown/HTML content
 * Handles images, audio, and video in various formats
 */

import { App, TFile, Vault } from 'obsidian';

export interface MediaReference {
	type: 'image' | 'audio' | 'video';
	originalPath: string;      // Original path as it appears in content
	vaultPath: string;         // Resolved path in vault
	ankiFilename: string;      // Sanitized filename for Anki
	legacyFilename?: string;   // Original path/filename used in older Anki exports
	alt?: string;              // Alt text if present
}

export class MediaExtractor {
	constructor(private app: App) {}

	/**
	 * Extract media references from Markdown content
	 * Extracts images (.png, .jpg, .svg) and audio files (.mp3, .wav, .ogg, .m4a, .flac, .aac)
	 */
	extractFromMarkdown(content: string, sourcePath: string): MediaReference[] {
		const references: MediaReference[] = [];

		// Extract Obsidian wikilink images using reference regex: /!\[\[((.|\n)*?)\]\]/g
		const wikilinkRegex = /!\[\[((.|\n)*?)\]\]/g;
		let match;

		while ((match = wikilinkRegex.exec(content)) !== null) {
			const fullMatch = match[0]; // Full match: ![[image.png]]
			const pathContent = match[1]; // Content inside brackets: image.png or folder/image.png|alt

			// Extract path and alt text (if present)
			const pathParts = pathContent.split('|');
			const path = pathParts[0].trim();
			const alt = pathParts[1]?.trim();

			// Check file extension
			const ext = path.split('.').pop()?.toLowerCase();
			if (!ext) {
				continue;
			}

			// Image extensions: .png, .jpg, .svg (reference implementation requirement)
			const imageExts = ['png', 'jpg', 'svg'];
			// Audio extensions: .mp3, .wav, .ogg, .m4a, .flac, .aac
			const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

			// Skip if not a known media extension
			if (!imageExts.includes(ext) && !audioExts.includes(ext)) {
				continue;
			}

			// Use proper path resolution instead of manual path construction
			// This resolves the actual vault path regardless of where the media is stored
			const ref = this.createMediaReference(path, sourcePath, fullMatch, alt);
			if (ref) {
				references.push(ref);
			}
		}

		// Extract standard Markdown images: ![alt](path)
		const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

		while ((match = markdownRegex.exec(content)) !== null) {
			const alt = match[1];
			const path = match[2];
			const ref = this.createMediaReference(path, sourcePath, match[0], alt);
			if (ref) {
				references.push(ref);
			}
		}

		return references;
	}

	/**
	 * Extract media references from HTML content
	 */
	extractFromHTML(html: string, sourcePath: string): MediaReference[] {
		const references: MediaReference[] = [];

		// Extract image tags: <img src="path" alt="text">
		const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/g;
		let match;

		while ((match = imgRegex.exec(html)) !== null) {
			const path = match[1];
			const alt = match[2];
			// Store the path (not the full HTML tag) as originalPath for path matching
			const ref = this.createMediaReference(path, sourcePath, path, alt);
			if (ref) {
				references.push(ref);
			}
		}

		// Extract audio tags: <audio src="path">
		const audioRegex = /<audio[^>]+src=["']([^"']+)["'][^>]*>/g;

		while ((match = audioRegex.exec(html)) !== null) {
			const path = match[1];
			// Store the path (not the full HTML tag) as originalPath for path matching
			const ref = this.createMediaReference(path, sourcePath, path, undefined, 'audio');
			if (ref) {
				references.push(ref);
			}
		}

		// Extract video tags: <video src="path">
		const videoRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/g;

		while ((match = videoRegex.exec(html)) !== null) {
			const path = match[1];
			// Store the path (not the full HTML tag) as originalPath for path matching
			const ref = this.createMediaReference(path, sourcePath, path, undefined, 'video');
			if (ref) {
				references.push(ref);
			}
		}

		return references;
	}

	/**
	 * Create a media reference from a path
	 */
	private createMediaReference(
		path: string,
		sourcePath: string,
		originalPath: string,
		alt?: string,
		typeOverride?: 'image' | 'audio' | 'video'
	): MediaReference | null {
		// Resolve vault path
		const vaultPath = this.resolveVaultPath(path, sourcePath);
		if (!vaultPath) {
			return null;
		}

		// Determine media type from extension (use vault path to ensure extension is present)
		const type = typeOverride || this.getMediaType(vaultPath);
		if (!type) {
			return null;
		}

		// Create sanitized Anki filename
		const ankiFilename = this.sanitizeFilename(this.getFilename(vaultPath));

		return {
			type,
			originalPath,
			legacyFilename: path, // Matches earlier HTML exports: <img src="path">
			vaultPath,
			ankiFilename,
			alt
		};
	}

	/**
	 * Resolve a path to an absolute vault path
	 */
	resolveVaultPath(path: string, sourcePath: string): string | null {
		// Remove URL fragments and query params
		path = path.split('#')[0].split('?')[0];

		// Handle absolute URLs (skip)
		if (path.startsWith('http://') || path.startsWith('https://')) {
			return null;
		}

		// Try to find file using Obsidian's link resolution
		const file = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		if (file) {
			return file.path;
		}

		// Try as direct vault path
		const directFile = this.app.vault.getAbstractFileByPath(path);
		if (directFile instanceof TFile) {
			return directFile.path;
		}

		// Try resolving relative to source file directory
		const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
		const relativePath = this.normalizePath(`${sourceDir}/${path}`);
		const relativeFile = this.app.vault.getAbstractFileByPath(relativePath);
		if (relativeFile instanceof TFile) {
			return relativeFile.path;
		}

		// File not found
		return null;
	}

	/**
	 * Get media type from file extension
	 */
	private getMediaType(path: string): 'image' | 'audio' | 'video' | null {
		const ext = path.split('.').pop()?.toLowerCase();
		if (!ext) {
			return null;
		}

		// Image formats
		const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico'];
		if (imageExts.includes(ext)) {
			return 'image';
		}

		// Audio formats
		const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
		if (audioExts.includes(ext)) {
			return 'audio';
		}

		// Video formats
		const videoExts = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'];
		if (videoExts.includes(ext)) {
			return 'video';
		}

		return null;
	}

	/**
	 * Get filename from path
	 */
	private getFilename(path: string): string {
		return path.split('/').pop() || path;
	}

	/**
	 * Sanitize filename for Anki
	 * - Prefix with underscore to prevent collisions
	 * - Replace special characters with underscores
	 * - Collapse multiple underscores
	 * - Preserves extension (case-sensitive)
	 */
	sanitizeFilename(filename: string): string {
		// Split into name and extension
		const lastDot = filename.lastIndexOf('.');
		let name = filename;
		let ext = '';

		if (lastDot > 0) {
			name = filename.substring(0, lastDot);
			ext = filename.substring(lastDot);
		}

		// Sanitize name - Anki expects alphanumeric, underscores, hyphens, and dots
		// \w matches [a-zA-Z0-9_], so we allow dots and hyphens explicitly
		name = name
			.replace(/[^\w.-]/g, '_')  // Replace special chars with underscore
			.replace(/_{2,}/g, '_')     // Collapse multiple underscores
			.replace(/^_+|_+$/g, '');   // Trim leading/trailing underscores

		// Ensure name is not empty (edge case: filename was just extension)
		if (!name) {
			name = 'file';
		}

		// Prefix with underscore to prevent collisions with Anki's files
		const sanitized = `_${name}${ext}`;
		console.log(`[MediaExtractor] Sanitized filename: "${filename}" -> "${sanitized}"`);
		return sanitized;
	}

	/**
	 * Normalize path (remove ../ and ./)
	 */
	private normalizePath(path: string): string {
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
}
