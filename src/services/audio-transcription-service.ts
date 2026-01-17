/**
 * Audio Transcription Service
 * Transcribes audio files using various AI providers (OpenAI Whisper, Google Speech-to-Text, etc.)
 */

import { App, TFile, requestUrl, Notice } from 'obsidian';
import { resolveAudioPath } from '../utils/audio-utils';
import type { Logger } from '../utils/logger';

export type TranscriptionProvider = 'openai-whisper' | 'google-speech' | 'anthropic';

export interface TranscriptionSettings {
	enabled: boolean;
	provider: TranscriptionProvider;
	openaiWhisper?: {
		apiKey: string;
		model?: string; // 'whisper-1' is default
		baseUrl?: string;
	};
	googleSpeech?: {
		apiKey: string;
		language?: string; // e.g., 'en-US', 'auto-detect'
	};
	cacheEnabled: boolean;
}

export interface TranscriptionResult {
	text: string;
	language?: string;
	confidence?: number;
	duration?: number; // Audio duration in seconds (if available)
}

interface CachedTranscription {
	text: string;
	language?: string;
	transcribedAt: string;
	fileHash?: string; // For cache invalidation
	fileModifiedTime?: number;
}

export class AudioTranscriptionService {
	private cache: Record<string, CachedTranscription> = {};
	private cachePath: string;

	constructor(
		private settings: TranscriptionSettings,
		private app: App,
		private logger?: Logger
	) {
		// Cache file location in plugin data folder
		this.cachePath = '.obsidian/plugins/flashly/transcriptions.json';
		this.loadCache();
	}

	/**
	 * Transcribe an audio file
	 * Returns transcription text or null if transcription fails
	 */
	async transcribeAudio(
		audioPath: string,
		sourceCardPath: string
	): Promise<TranscriptionResult | null> {
		if (!this.settings.enabled) {
			return null;
		}

		// Check cache first
		if (this.settings.cacheEnabled) {
			const cached = await this.getCachedTranscription(audioPath);
			if (cached) {
				this.logger?.debug(`Using cached transcription for: ${audioPath}`);
				return {
					text: cached.text,
					language: cached.language
				};
			}
		}

		// Resolve audio file
		const resolvedPath = resolveAudioPath(audioPath, sourceCardPath, this.app);
		if (!resolvedPath) {
			this.logger?.warn(`Could not resolve audio path: ${audioPath}`);
			return null;
		}

		const audioFile = this.app.vault.getAbstractFileByPath(resolvedPath);
		if (!(audioFile instanceof TFile)) {
			this.logger?.warn(`Audio file not found: ${resolvedPath}`);
			return null;
		}

		// Check file size (OpenAI has 25MB limit)
		const fileSize = audioFile.stat.size;
		const maxSize = 25 * 1024 * 1024; // 25MB
		if (fileSize > maxSize) {
			this.logger?.warn(`Audio file too large: ${resolvedPath} (${fileSize} bytes, max ${maxSize})`);
			return null;
		}

		// Transcribe based on provider
		let result: TranscriptionResult | null = null;
		try {
			switch (this.settings.provider) {
				case 'openai-whisper':
					result = await this.transcribeWithOpenAI(audioFile);
					break;
				case 'google-speech':
					result = await this.transcribeWithGoogle(audioFile);
					break;
				case 'anthropic':
					// Anthropic doesn't currently support audio transcription
					this.logger?.warn('Anthropic does not support audio transcription yet');
					return null;
				default:
					this.logger?.warn(`Unknown transcription provider: ${this.settings.provider}`);
					return null;
			}

			// Cache the result
			if (result && this.settings.cacheEnabled) {
				await this.cacheTranscription(audioPath, result, audioFile.stat.mtime);
			}

			return result;
		} catch (error) {
			this.logger?.error(`Transcription failed for ${resolvedPath}:`, error);
			console.error('Transcription error:', error);
			return null;
		}
	}

	/**
	 * Transcribe using OpenAI Whisper API
	 */
	private async transcribeWithOpenAI(audioFile: TFile): Promise<TranscriptionResult> {
		if (!this.settings.openaiWhisper?.apiKey) {
			throw new Error('OpenAI API key not configured for transcription');
		}

		let baseUrl = this.settings.openaiWhisper.baseUrl || 'https://api.openai.com/v1';
		// If custom baseUrl doesn't end with /v1, append it (for local servers like whisper.cpp)
		if (baseUrl && !baseUrl.includes('api.openai.com')) {
			// Custom baseUrl (local server)
			baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
			if (!baseUrl.endsWith('/v1')) {
				baseUrl = baseUrl + '/v1';
			}
		}
		const model = this.settings.openaiWhisper.model || 'whisper-1';

		// Read audio file as binary
		const audioData = await this.app.vault.readBinary(audioFile);

		// OpenAI Whisper API requires multipart/form-data
		// We need to create FormData-like structure
		// Since Obsidian's requestUrl might not support FormData directly,
		// we'll use base64 encoding and send as data URI or use a workaround
		
		// Get file extension to determine MIME type
		const ext = audioFile.extension.toLowerCase();
		const mimeTypes: Record<string, string> = {
			'mp3': 'audio/mpeg',
			'wav': 'audio/wav',
			'ogg': 'audio/ogg',
			'm4a': 'audio/mp4',
			'flac': 'audio/flac',
			'aac': 'audio/aac'
		};
		const mimeType = mimeTypes[ext] || 'audio/mpeg';

		// Convert ArrayBuffer to base64 for fallback approach
		const base64Audio = this.arrayBufferToBase64(audioData);
		const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

		// Try using FormData if available (Electron/browser environment)
		if (typeof FormData !== 'undefined') {
			try {
				const formDataObj = new FormData();
				
				// Convert ArrayBuffer to Blob for FormData
				const blob = new Blob([audioData], { type: mimeType });
				formDataObj.append('file', blob, audioFile.name);
				formDataObj.append('model', model);

				// Obsidian's requestUrl might accept FormData
				// Don't set Content-Type - browser/FormData will set it with boundary
				const response = await requestUrl({
					url: `${baseUrl}/audio/transcriptions`,
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${this.settings.openaiWhisper.apiKey}`
						// Don't set Content-Type - FormData will set it with boundary
					},
					body: formDataObj as any // Type assertion needed
				});

				const result = response.json;
				return {
					text: result.text,
					language: result.language
				};
			} catch (formDataError) {
				// FormData approach failed, try manual multipart with base64
				this.logger?.debug('FormData approach failed, trying base64 multipart:', formDataError);
			}
		}

		// Fallback: Manual multipart/form-data with raw binary
		// Create multipart body as ArrayBuffer for raw binary data
		try {
			const encoder = new TextEncoder();
			const decoder = new TextDecoder();
			
			// Build multipart body parts
			const parts: ArrayBuffer[] = [];
			
			// Part 1: File field header
			const fileHeader = encoder.encode(
				`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="file"; filename="${audioFile.name}"\r\n` +
				`Content-Type: ${mimeType}\r\n` +
				`\r\n`
			);
			parts.push(fileHeader);
			
			// Part 2: Audio file data (raw binary)
			parts.push(audioData);
			
			// Part 3: Model field
			const modelField = encoder.encode(
				`\r\n--${boundary}\r\n` +
				`Content-Disposition: form-data; name="model"\r\n` +
				`\r\n` +
				`${model}\r\n` +
				`--${boundary}--\r\n`
			);
			parts.push(modelField);
			
			// Combine all parts into single ArrayBuffer
			const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
			const combined = new Uint8Array(totalLength);
			let offset = 0;
			for (const part of parts) {
				combined.set(new Uint8Array(part), offset);
				offset += part.byteLength;
			}

			const response = await requestUrl({
				url: `${baseUrl}/audio/transcriptions`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openaiWhisper.apiKey}`,
					'Content-Type': `multipart/form-data; boundary=${boundary}`
				},
				body: combined.buffer
			});

			const result = response.json;
			return {
				text: result.text,
				language: result.language
			};
		} catch (error: any) {
			console.error('OpenAI transcription error:', error);
			const errorMessage = error.json?.error?.message || error.message || 'Unknown error';
			throw new Error(`OpenAI transcription failed: ${errorMessage}. Note: OpenAI Whisper requires multipart/form-data. If FormData is not supported, you may need to use a different approach.`);
		}
	}

	/**
	 * Transcribe using Google Speech-to-Text API
	 */
	private async transcribeWithGoogle(audioFile: TFile): Promise<TranscriptionResult> {
		if (!this.settings.googleSpeech?.apiKey) {
			throw new Error('Google Speech-to-Text API key not configured');
		}

		// Read audio file as binary
		const audioData = await this.app.vault.readBinary(audioFile);
		const base64Audio = this.arrayBufferToBase64(audioData);

		// Get file extension for encoding
		const ext = audioFile.extension.toLowerCase();
		const encodingMap: Record<string, string> = {
			'mp3': 'MP3',
			'wav': 'LINEAR16',
			'ogg': 'OGG_OPUS',
			'm4a': 'MP3',
			'flac': 'FLAC',
			'aac': 'MP3'
		};
		const encoding = encodingMap[ext] || 'MP3';

		const language = this.settings.googleSpeech.language || 'en-US';

		try {
			const response = await requestUrl({
				url: `https://speech.googleapis.com/v1/speech:recognize?key=${this.settings.googleSpeech.apiKey}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					config: {
						encoding: encoding,
						sampleRateHertz: 16000, // Default, may need to detect actual rate
						languageCode: language,
						enableAutomaticPunctuation: true
					},
					audio: {
						content: base64Audio
					}
				})
			});

			const result = response.json;
			
			if (result.results && result.results.length > 0) {
				// Concatenate all alternative transcriptions
				const transcripts = result.results
					.map((r: any) => r.alternatives?.[0]?.transcript || '')
					.filter((t: string) => t.length > 0);
				
				return {
					text: transcripts.join(' '),
					language: result.results[0].languageCode || language,
					confidence: result.results[0].alternatives?.[0]?.confidence
				};
			}
			
			throw new Error('No transcription results from Google Speech-to-Text');
		} catch (error) {
			console.error('Google transcription error:', error);
			throw error;
		}
	}


	/**
	 * Convert ArrayBuffer to base64 string
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * Get cached transcription if available
	 */
	private async getCachedTranscription(audioPath: string): Promise<CachedTranscription | null> {
		// Check in-memory cache first
		if (this.cache[audioPath]) {
			const cached = this.cache[audioPath];
			
			// Verify file hasn't changed (if we have modified time)
			if (cached.fileModifiedTime) {
				const file = this.app.vault.getAbstractFileByPath(audioPath);
				if (file instanceof TFile) {
					if (file.stat.mtime > cached.fileModifiedTime) {
						// File changed, invalidate cache
						delete this.cache[audioPath];
						return null;
					}
				}
			}
			
			return cached;
		}

		// Try to load from disk cache
		try {
			const cacheFile = this.app.vault.getAbstractFileByPath(this.cachePath);
			if (cacheFile instanceof TFile) {
				const cacheContent = await this.app.vault.read(cacheFile);
				const diskCache: Record<string, CachedTranscription> = JSON.parse(cacheContent);
				const cached = diskCache[audioPath];
				
				if (cached) {
					// Verify file hasn't changed
					const file = this.app.vault.getAbstractFileByPath(audioPath);
					if (file instanceof TFile && cached.fileModifiedTime) {
						if (file.stat.mtime <= cached.fileModifiedTime) {
							// Still valid, add to memory cache
							this.cache[audioPath] = cached;
							return cached;
						}
					} else {
						// No modified time check, assume valid
						this.cache[audioPath] = cached;
						return cached;
					}
				}
			}
		} catch (error) {
			// Cache file doesn't exist or is invalid, ignore
			this.logger?.debug('Could not load transcription cache:', error);
		}

		return null;
	}

	/**
	 * Cache transcription result
	 */
	private async cacheTranscription(
		audioPath: string,
		result: TranscriptionResult,
		fileModifiedTime?: number
	): Promise<void> {
		const cached: CachedTranscription = {
			text: result.text,
			language: result.language,
			transcribedAt: new Date().toISOString(),
			fileModifiedTime
		};

		// Update in-memory cache
		this.cache[audioPath] = cached;

		// Save to disk cache
		try {
			// Load existing cache
			let diskCache: Record<string, CachedTranscription> = {};
			const cacheFile = this.app.vault.getAbstractFileByPath(this.cachePath);
			if (cacheFile instanceof TFile) {
				try {
					const cacheContent = await this.app.vault.read(cacheFile);
					diskCache = JSON.parse(cacheContent);
				} catch {
					// File exists but is invalid, start fresh
					diskCache = {};
				}
			}

			// Update cache
			diskCache[audioPath] = cached;

			// Save back to disk
			await this.app.vault.adapter.write(this.cachePath, JSON.stringify(diskCache, null, 2));
		} catch (error) {
			// Failed to save cache, log but don't fail
			this.logger?.warn('Failed to save transcription cache:', error);
		}
	}

	/**
	 * Load cache from disk
	 */
	private async loadCache(): Promise<void> {
		try {
			const cacheFile = this.app.vault.getAbstractFileByPath(this.cachePath);
			if (cacheFile instanceof TFile) {
				const cacheContent = await this.app.vault.read(cacheFile);
				this.cache = JSON.parse(cacheContent);
			}
		} catch {
			// Cache file doesn't exist, start with empty cache
			this.cache = {};
		}
	}

	/**
	 * Clear transcription cache
	 */
	async clearCache(): Promise<void> {
		this.cache = {};
		try {
			const cacheFile = this.app.vault.getAbstractFileByPath(this.cachePath);
			if (cacheFile instanceof TFile) {
				await this.app.vault.delete(cacheFile);
			}
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; entries: string[] } {
		return {
			size: Object.keys(this.cache).length,
			entries: Object.keys(this.cache)
		};
	}
}
