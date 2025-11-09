/**
 * Logger utility that respects debug settings
 */

import type FlashlyPlugin from '../../main';

export class Logger {
	constructor(private plugin: FlashlyPlugin) {}

	/**
	 * Check if debug logging is enabled
	 */
	private get isDebugEnabled(): boolean {
		return this.plugin.settings.developer.enableDebugLogging;
	}

	/**
	 * Log debug message (only if debug logging is enabled)
	 */
	debug(...args: unknown[]): void {
		if (this.isDebugEnabled) {
			console.debug('[Flashly]', ...args);
		}
	}

	/**
	 * Log info message (only if debug logging is enabled)
	 */
	log(...args: unknown[]): void {
		if (this.isDebugEnabled) {
			console.debug('[Flashly]', ...args);
		}
	}

	/**
	 * Log warning (always shown)
	 */
	warn(...args: unknown[]): void {
		console.warn('[Flashly]', ...args);
	}

	/**
	 * Log error (always shown)
	 */
	error(...args: unknown[]): void {
		console.error('[Flashly]', ...args);
	}
}
