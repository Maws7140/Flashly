/**
 * Tests for AudioTranscriptionService
 * These focus on internal helpers and caching behavior (network calls are not executed).
 */

import { AudioTranscriptionService, TranscriptionSettings } from '../src/services/audio-transcription-service';

describe('AudioTranscriptionService', () => {
	const makeService = () => {
		const settings: TranscriptionSettings = {
			enabled: true,
			provider: 'openai-whisper',
			openaiWhisper: {
				apiKey: 'test-key',
				model: 'whisper-1'
			},
			cacheEnabled: true
		};

		// Minimal mock app with just enough shape for the service
		const app: any = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
				read: jest.fn().mockResolvedValue(''),
				readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
				adapter: {
					write: jest.fn().mockResolvedValue(undefined),
					mkdir: jest.fn().mockResolvedValue(undefined)
				}
			}
		};

		const logger = {
			debug: jest.fn(),
			log: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		} as any;

		const service = new AudioTranscriptionService(settings, app, logger);
		return { service, app, logger };
	};

	it('should initialize with empty cache and report zero entries', () => {
		const { service } = makeService();
		const stats = service.getCacheStats();

		expect(stats.size).toBe(0);
		expect(stats.entries).toEqual([]);
	});

	it('should update cache stats after caching a transcription', async () => {
		const { service } = makeService();

		// Access private method via any-cast for targeted testing
		await (service as any).cacheTranscription(
			'audio/test.mp3',
			{ text: 'hello world' },
			Date.now()
		);

		const stats = service.getCacheStats();
		expect(stats.size).toBe(1);
		expect(stats.entries).toContain('audio/test.mp3');
	});

	it('should convert ArrayBuffer to base64 correctly', () => {
		const { service } = makeService();
		const data = new TextEncoder().encode('test');
		const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

		const base64 = (service as any).arrayBufferToBase64(buffer);
		// "test" -> base64 "dGVzdA=="
		expect(base64).toBe('dGVzdA==');
	});
});

