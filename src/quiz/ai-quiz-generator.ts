/**
 * AI Quiz Generator
 * Generates quiz questions using AI providers (OpenAI, Anthropic, or custom)
 */

import { FlashlyCard } from '../models/card';
import { QuizQuestion, QuizConfig, AIQuizSettings, AIQuizGenerationResponse, QuizQuestionType } from '../models/quiz';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Logger } from '../utils/logger';
import { extractAudioWikilinks, removeAudioWikilinks } from '../utils/audio-utils';
import { AudioTranscriptionService, TranscriptionSettings } from '../services/audio-transcription-service';

interface ParsedAIQuestion {
	type: QuizQuestionType;
	prompt: string;
	options?: string[];
	correctAnswer: string | number;
	explanation?: string;
}

interface ParsedAIResponse {
	questions: ParsedAIQuestion[];
}

export class AIQuizGenerator {
	private transcriptionService: AudioTranscriptionService | null = null;

	constructor(
		private settings: AIQuizSettings,
		private app: any, // App instance needed for transcription service
		private logger?: Logger
	) {
		// Initialize transcription service if voice AI is enabled
		if (this.settings.voiceAI?.enabled) {
			const transcriptionSettings: TranscriptionSettings = {
				enabled: this.settings.voiceAI.enabled,
				provider: this.settings.voiceAI.provider,
				openaiWhisper: this.settings.voiceAI.openaiWhisper,
				googleSpeech: this.settings.voiceAI.googleSpeech,
				cacheEnabled: this.settings.voiceAI.cacheTranscriptions
			};
			this.transcriptionService = new AudioTranscriptionService(transcriptionSettings, this.app, this.logger);
		}
	}

	/**
	 * Generate quiz questions using AI
	 */
	async generateQuestions(cards: FlashlyCard[], config: QuizConfig): Promise<QuizQuestion[]> {
		if (cards.length === 0) {
			throw new Error('No cards available to generate quiz');
		}

		if (!this.settings.enabled) {
			throw new Error('AI quiz generation is not enabled in settings');
		}

		// Extract audio metadata from cards before processing
		const audioMetadata = this.extractAudioMetadata(cards);

		// Transcribe audio files if voice AI is enabled
		let audioTranscripts: Record<string, { front: string[], back: string[] }> = {};
		if (this.transcriptionService && this.settings.voiceAI?.enabled) {
			this.logger?.log('Transcribing audio files...');
			try {
				audioTranscripts = await this.transcribeCardAudio(cards, audioMetadata);
				this.logger?.log(`Transcribed ${Object.keys(audioTranscripts).length} cards with audio`);
			} catch (error) {
				this.logger?.error('Audio transcription failed, continuing without transcriptions:', error);
				console.error('Audio transcription error:', error);
				// Continue without transcriptions - don't fail the entire quiz generation
				audioTranscripts = {};
			}
		}

		// Prepare card data for AI (with audio placeholders and transcriptions)
		const cardData = cards.map(card => {
			const frontAudio = audioMetadata[card.id]?.front || [];
			const backAudio = audioMetadata[card.id]?.back || [];
			const hasTranscriptions = audioTranscripts[card.id] && 
				(audioTranscripts[card.id].front.length > 0 || audioTranscripts[card.id].back.length > 0);
			
			let frontText = this.replaceAudioWithPlaceholders(card.front, frontAudio, card.id);
			let backText = this.replaceAudioWithPlaceholders(card.back, backAudio, card.id);
			
			// Add transcriptions if available - audio is primary for this card
			if (hasTranscriptions) {
				frontText = this.addTranscriptionContext(frontText, audioTranscripts[card.id].front);
				backText = this.addTranscriptionContext(backText, audioTranscripts[card.id].back);
				this.logger?.log(`Card ${card.id}: Audio transcription available - using as primary content`);
			}
			
		return {
			id: card.id,
			front: frontText,
			back: backText,
			hasAudioTranscription: hasTranscriptions
		};
		});

		// Generate prompt with audio preservation instructions
		const prompt = this.buildPrompt(cardData, config, audioMetadata);

		// Call appropriate AI provider
		let response: AIQuizGenerationResponse;

		switch (this.settings.provider) {
			case 'openai':
				response = await this.callOpenAI(prompt);
				break;
			case 'anthropic':
				response = await this.callAnthropic(prompt);
				break;
			case 'gemini':
				response = await this.callGemini(prompt);
				break;
			case 'openrouter':
				response = await this.callOpenRouter(prompt);
				break;
			case 'custom':
				response = await this.callCustomAPI(prompt);
				break;
			default:
				return this.handleUnknownProvider(this.settings.provider);
		}

		// Restore audio wikilinks in questions and assign sourceCardId
		const questionsWithAudio = this.restoreAudioInQuestions(response.questions, cards, audioMetadata);

		// Remove duplicate questions
		const deduplicatedQuestions = this.removeDuplicateQuestions(questionsWithAudio);

		// Log if duplicates were found
		if (deduplicatedQuestions.length < questionsWithAudio.length) {
			this.logger?.log(`Removed ${questionsWithAudio.length - deduplicatedQuestions.length} duplicate question(s)`);
		}

		return deduplicatedQuestions;
	}

	private handleUnknownProvider(provider: never): never {
		throw new Error(`Unknown AI provider: ${String(provider)}`);
	}

	/**
	 * Extract audio metadata from cards
	 * Returns a map of card ID to audio wikilinks found in front/back
	 */
	private extractAudioMetadata(cards: FlashlyCard[]): Record<string, { front: string[], back: string[] }> {
		const metadata: Record<string, { front: string[], back: string[] }> = {};
		
		for (const card of cards) {
			metadata[card.id] = {
				front: extractAudioWikilinks(card.front),
				back: extractAudioWikilinks(card.back)
			};
		}
		
		return metadata;
	}

	/**
	 * Replace audio wikilinks with placeholders in markdown text
	 * This allows AI to see placeholders and preserve them
	 * Uses card ID and index to create unique placeholders
	 */
	private replaceAudioWithPlaceholders(markdown: string, audioWikilinks: string[], cardId: string): string {
		let result = markdown;
		for (let i = 0; i < audioWikilinks.length; i++) {
			const placeholder = `[AUDIO:${cardId}:${i}]`;
			result = result.replace(audioWikilinks[i], placeholder);
		}
		return result;
	}

	/**
	 * Restore audio wikilinks in AI-generated questions
	 * Also assigns sourceCardId by finding the best matching card
	 */
	private restoreAudioInQuestions(
		questions: QuizQuestion[],
		cards: FlashlyCard[],
		audioMetadata: Record<string, { front: string[], back: string[] }>
	): QuizQuestion[] {
		return questions.map(question => {
			// Extract audio placeholders from the question to find source card
			// Card ID may contain colons (e.g., "test.md:L1"), so we match up to the last colon
			const audioPlaceholderRegex = /\[AUDIO:([^[]+):(\d+)\]/g;
			const placeholderMatches: Array<{ cardId: string, index: number }> = [];
			
			// Extract from prompt
			let match;
			const promptRegex = /\[AUDIO:([^[]+):(\d+)\]/g;
			while ((match = promptRegex.exec(question.prompt)) !== null) {
				placeholderMatches.push({
					cardId: match[1],
					index: parseInt(match[2], 10)
				});
			}
			
			// Extract from options
			if (question.options) {
				for (const option of question.options) {
					const optionRegex = /\[AUDIO:([^[]+):(\d+)\]/g;
					while ((match = optionRegex.exec(option)) !== null) {
						placeholderMatches.push({
							cardId: match[1],
							index: parseInt(match[2], 10)
						});
					}
				}
			}
			
			// Determine source card: use the card with the most audio matches, or find best match
			let sourceCardId: string | undefined;
			if (placeholderMatches.length > 0) {
				// Count matches per card
				const cardMatchCount = new Map<string, number>();
				for (const match of placeholderMatches) {
					const count = cardMatchCount.get(match.cardId) || 0;
					cardMatchCount.set(match.cardId, count + 1);
				}
				
				// Find card with most matches
				let maxCount = 0;
				for (const [cardId, count] of cardMatchCount.entries()) {
					if (count > maxCount) {
						maxCount = count;
						sourceCardId = cardId;
					}
				}
			}
			
			// Fallback: find best matching card by content
			if (!sourceCardId) {
				sourceCardId = this.findSourceCard(question, cards);
			}
			
			// Restore audio placeholders with actual wikilinks
			let restoredPrompt = this.restoreAudioInText(question.prompt, audioMetadata);
			let restoredOptions: string[] | undefined;
			
			if (question.options) {
				restoredOptions = question.options.map(option => this.restoreAudioInText(option, audioMetadata));
			}
			
			return {
				...question,
				prompt: restoredPrompt,
				options: restoredOptions,
				sourceCardId: sourceCardId || cards[0]?.id // Fallback to first card if no match found
			};
		});
	}

	/**
	 * Restore audio placeholders in text with actual audio wikilinks
	 * Placeholder format: [AUDIO:cardId:index] where cardId may contain colons
	 */
	private restoreAudioInText(text: string, audioMetadata: Record<string, { front: string[], back: string[] }>): string {
		// Match [AUDIO:...:number] where ... can contain colons (cardId)
		// We match from [AUDIO: to the last colon followed by digits
		const audioPlaceholderRegex = /\[AUDIO:([^[]+):(\d+)\]/g;
		let result = text;
		
		// Find all matches (need to reset regex for matchAll)
		const matches: Array<RegExpMatchArray> = [];
		let match;
		const regex = /\[AUDIO:([^[]+):(\d+)\]/g;
		while ((match = regex.exec(text)) !== null) {
			matches.push(match);
		}
		
		for (const match of matches) {
			const cardId = match[1];
			const index = parseInt(match[2], 10);
			const placeholder = match[0];
			
			const metadata = audioMetadata[cardId];
			if (metadata) {
				const allAudio = [...metadata.front, ...metadata.back];
				if (index < allAudio.length) {
					const audioWikilink = allAudio[index];
					// Replace using the exact placeholder to avoid regex issues
					result = result.split(placeholder).join(audioWikilink);
				}
			}
		}
		
		return result;
	}

	/**
	 * Transcribe audio files from cards
	 * Returns a map of card ID to transcriptions (front and back)
	 */
	private async transcribeCardAudio(
		cards: FlashlyCard[],
		audioMetadata: Record<string, { front: string[], back: string[] }>
	): Promise<Record<string, { front: string[], back: string[] }>> {
		if (!this.transcriptionService) {
			return {};
		}

		const transcriptions: Record<string, { front: string[], back: string[] }> = {};

		for (const card of cards) {
			const metadata = audioMetadata[card.id];
			if (!metadata || (metadata.front.length === 0 && metadata.back.length === 0)) {
				continue;
			}

			const cardTranscripts: { front: string[], back: string[] } = { front: [], back: [] };

			// Transcribe front audio
			for (const audioWikilink of metadata.front) {
				const audioPath = this.extractAudioPath(audioWikilink);
				if (audioPath) {
					const transcription = await this.transcriptionService.transcribeAudio(
						audioPath,
						card.source.file
					);
					if (transcription) {
						cardTranscripts.front.push(transcription.text);
					}
				}
			}

			// Transcribe back audio
			for (const audioWikilink of metadata.back) {
				const audioPath = this.extractAudioPath(audioWikilink);
				if (audioPath) {
					const transcription = await this.transcriptionService.transcribeAudio(
						audioPath,
						card.source.file
					);
					if (transcription) {
						cardTranscripts.back.push(transcription.text);
					}
				}
			}

			if (cardTranscripts.front.length > 0 || cardTranscripts.back.length > 0) {
				transcriptions[card.id] = cardTranscripts;
			}
		}

		return transcriptions;
	}

	/**
	 * Extract audio path from wikilink
	 * Example: ![[audio.mp3]] -> audio.mp3
	 * Example: ![[audio.mp3|description]] -> audio.mp3
	 */
	private extractAudioPath(wikilink: string): string | null {
		const match = wikilink.match(/!\[\[([^\]]+)\]\]/);
		if (!match) return null;

		const pathContent = match[1];
		// Handle alt text: audio.mp3|description
		const pathParts = pathContent.split('|');
		return pathParts[0].trim();
	}

	/**
	 * Add transcription context to text
	 * Format: "Primary Content (Audio): [transcription]\n\nAdditional Context (Text): [text]"
	 */
	private addTranscriptionContext(text: string, transcriptions: string[]): string {
		if (transcriptions.length === 0) {
			return text;
		}

		const transcriptionText = transcriptions.length === 1
			? transcriptions[0]
			: transcriptions.map((t, i) => `[Audio ${i + 1}]: ${t}`).join('\n');

		// Audio is primary for this card, text provides additional context
		// Remove audio placeholders from text since we have the actual transcription
		const textWithoutPlaceholders = text.replace(/\[AUDIO:[^\]]+\]/g, '').trim();
		
		if (textWithoutPlaceholders) {
			// If there's text, show audio as primary with text as context
			return `**Primary Content (Audio):** "${transcriptionText}"

**Additional Context (Text):** ${textWithoutPlaceholders}`;
		} else {
			// If only audio, show transcription as primary content
			return `**Primary Content (Audio):** "${transcriptionText}"`;
		}
	}

	/**
	 * Find the best matching source card for a question
	 * This is a simple heuristic - matches based on content similarity
	 */
	private findSourceCard(question: QuizQuestion, cards: FlashlyCard[]): string | undefined {
		// Simple heuristic: check if any card's front or back contains words from the prompt
		const promptWords = question.prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
		
		// Score each card based on word matches
		let bestMatch: { cardId: string, score: number } | undefined;
		
		for (const card of cards) {
			const cardText = `${card.front} ${card.back}`.toLowerCase();
			let score = 0;
			
			for (const word of promptWords) {
				if (cardText.includes(word)) {
					score++;
				}
			}
			
			// Also check if prompt contains audio placeholders that match card's audio
			if (question.prompt.includes('[AUDIO:')) {
				// Prefer cards with audio if question has audio placeholders
				const cardAudio = extractAudioWikilinks(`${card.front} ${card.back}`);
				if (cardAudio.length > 0) {
					score += 2; // Bonus for audio-rich cards
				}
			}
			
			if (!bestMatch || score > bestMatch.score) {
				bestMatch = { cardId: card.id, score };
			}
		}
		
		// Only return a match if score is meaningful (at least 1 word match)
		return bestMatch && bestMatch.score > 0 ? bestMatch.cardId : undefined;
	}

	/**
	 * Build prompt for AI
	 */
	private buildPrompt(
		cards: Array<{ id: string; front: string; back: string; hasAudioTranscription?: boolean }>,
		config: QuizConfig,
		audioMetadata: Record<string, { front: string[], back: string[] }>
	): string {
		const questionTypes = [];
		if (config.includeMultipleChoice) questionTypes.push('multiple-choice');
		if (config.includeFillBlank) questionTypes.push('fill-in-the-blank');
		if (config.includeTrueFalse) questionTypes.push('true-false');
		
		// Check if any cards have audio
		const hasAudio = Object.values(audioMetadata).some(m => m.front.length > 0 || m.back.length > 0);
		if (hasAudio) {
			questionTypes.push('audio-prompt');
		}

		let audioInstructions = '';
		if (hasAudio) {
			audioInstructions = `

**Audio Handling:**
- Some flashcards contain audio files with transcriptions shown as "Primary Content (Audio)"
- For cards marked with [Audio Primary], the audio transcription is the primary content and questions should focus on that audio
- For other cards, use the text content normally
- Audio placeholders [AUDIO:cardId:index] should be preserved EXACTLY in your responses where applicable
- For cards with audio, you may generate "audio-prompt" questions that focus on the audio content`;
		}

		return `You are an educational quiz generator. Generate ${config.questionCount} quiz questions from the following flashcards.

**Question Types to Generate:**
${questionTypes.map(t => `- ${t}`).join('\n')}

**Flashcards:**
${cards.map((card, i) => {
			const hasAudioContent = card.hasAudioTranscription || card.front.includes('Primary Content (Audio)') || card.back.includes('Primary Content (Audio)');
			const audioMarker = hasAudioContent ? ' [Audio Primary]' : '';
			return `Card ${i + 1}${audioMarker}:\nQ: ${card.front}\nA: ${card.back}`;
		}).join('\n\n')}

**Instructions:**
1. Generate exactly ${config.questionCount} questions
2. Each question must be based on the CONTENT of specific flashcard(s), not on general topics or deck names
3. Generate questions from the card content shown. You may create multiple questions from a single card, or questions that combine content from multiple cards, but each question must be directly derived from the flashcard content shown
4. Distribute questions evenly across the requested types
5. For multiple-choice questions, provide 4 options with the correct answer
6. For fill-in-the-blank, create a clear prompt with a blank to fill
7. For true-false, create statements that test understanding
8. For audio-prompt questions, the prompt should contain [AUDIO:X] placeholders for listening exercises
9. Make questions clear, unambiguous, and test real understanding
	10. Use varied difficulty levels
	11. IMPORTANT: Each question must be unique - do NOT create duplicate questions with the same or very similar prompts
	12. For LaTeX math, use $...$. Ensure backslashes in LaTeX are double-escaped (e.g. use \\text{...}, \\frac{...})${audioInstructions}

**Response Format (JSON):**
{
  "questions": [
    {
      "type": "multiple-choice",
      "prompt": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Optional explanation"
    },
    {
      "type": "fill-blank",
      "prompt": "Question with _____ to fill",
      "correctAnswer": "answer text",
      "explanation": "Optional explanation"
    },
    {
      "type": "true-false",
      "prompt": "Statement to evaluate",
      "options": ["True", "False"],
      "correctAnswer": "true",
      "explanation": "Optional explanation"
    },
    {
      "type": "audio-prompt",
      "prompt": "[AUDIO:0] Listen and answer",
      "correctAnswer": "answer text",
      "explanation": "Optional explanation"
    }
  ]
}

Respond ONLY with valid JSON in the format above. Do not include any other text.`;
	}

	/**
	 * Clean JSON string from markdown and fix common format issues
	 */
	private cleanJsonString(content: string): string {
		let cleaned = content.trim();

		// 1. Remove markdown code blocks
		const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
		const match = cleaned.match(codeBlockRegex);
		if (match) {
			cleaned = match[1].trim();
		} else {
			// Handle cases with loose markdown or no code blocks
			cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
		}

		// 2. Find JSON object boundaries
		const firstBrace = cleaned.indexOf('{');
		const lastBrace = cleaned.lastIndexOf('}');
		if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
			cleaned = cleaned.substring(firstBrace, lastBrace + 1);
		}

		// 3. Fix invalid escape sequences (common in LLM output)
		
		// Fix \u that is NOT a unicode escape (e.g. \cup for union)
		// We use a negative lookahead to check if \u is NOT followed by 4 hex digits
		cleaned = cleaned.replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");

		// Fix LaTeX commands that became control characters
		// These occur when the AI outputs "\text" (tab) instead of "\\text"
		
		// \t (TAB \x09) clashes: \text, \tau, \theta, \times, \tan, \top, \to, \triangle, \therefore
		cleaned = cleaned.replace(/\x09(ext|au|heta|imes|an|op|o|riangle|herefore)/g, "\\\\t$1");
		
		// \n (LF \x0A) clashes: \nu, \neq, \nabla, \neg
		cleaned = cleaned.replace(/\x0A(u|eq|abla|eg)/g, "\\\\n$1");
		
		// \r (CR \x0D) clashes: \rho, \right, \ref
		cleaned = cleaned.replace(/\x0D(ho|ight|ef)/g, "\\\\r$1");
		
		// \f (FF \x0C) clashes: \frac, \forall, \foot
		cleaned = cleaned.replace(/\x0C(rac|orall|oot)/g, "\\\\f$1");
		
		// \b (BS \x08) clashes: \beta, \begin, \bf, \bar, \binom
		cleaned = cleaned.replace(/\x08(eta|egin|f|ar|inom)/g, "\\\\b$1");

		// Replace backslashes not followed by valid JSON escape chars (" \ / b f n r t u)
		// We use a callback to be explicit and safe
		cleaned = cleaned.replace(/\\(.)/g, (match, char) => {
			if (/^["\\/bfnrtu]$/.test(char)) {
				return match; // Valid escape
			}
			return '\\\\' + char; // Invalid escape, escape the backslash
		});

		// Handle backslash at the very end of the string (not matched by above because no following char)
		if (cleaned.endsWith('\\')) {
			cleaned = cleaned.slice(0, -1) + '\\\\';
		}

		return cleaned;
	}

	/**
	 * Remove duplicate questions based on prompt similarity
	 */
	private removeDuplicateQuestions(questions: QuizQuestion[]): QuizQuestion[] {
		const seen = new Set<string>();
		const unique: QuizQuestion[] = [];

		for (const question of questions) {
			// Normalize prompt for comparison (lowercase, trim, remove extra spaces)
			const normalizedPrompt = question.prompt
				.toLowerCase()
				.trim()
				.replace(/\s+/g, ' ');

			// Check if we've seen this prompt before
			if (!seen.has(normalizedPrompt)) {
				seen.add(normalizedPrompt);
				unique.push(question);
			}
		}

		return unique;
	}

	/**
	 * Call OpenAI API
	 */
	private async callOpenAI(prompt: string): Promise<AIQuizGenerationResponse> {
		if (!this.settings.openai?.apiKey) {
			throw new Error('OpenAI API key not configured');
		}

		const baseUrl = this.settings.openai.baseUrl || 'https://api.openai.com/v1';
		const model = this.settings.openai.model || 'gpt-4';

		try {
			const response = await requestUrl({
				url: `${baseUrl}/chat/completions`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openai.apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model,
					messages: [
						{
							role: 'system',
							content: this.settings.systemPrompt || 'You are a helpful educational assistant that generates quiz questions.'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					temperature: this.settings.temperature,
					max_tokens: this.settings.maxTokens
				})
			});

			const data = response.json;
			const content = data.choices[0].message.content;

			// Clean and parse JSON
			const cleanedContent = this.cleanJsonString(content);

			// Validate JSON structure before parsing
			if (!cleanedContent.startsWith('{') || !cleanedContent.endsWith('}')) {
				console.error('Content does not look like complete JSON after cleaning');
				console.error('Starts with:', cleanedContent.substring(0, 50));
				console.error('Ends with:', cleanedContent.substring(Math.max(0, cleanedContent.length - 50)));
				throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Try to parse JSON response
			let parsed;
			try {
				parsed = JSON.parse(cleanedContent);
			} catch (parseError) {
				console.error('JSON parse error:', parseError);
				console.error('Failed content length:', cleanedContent.length);

				// Log context around error position if available
				const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
				const positionMatch = errorMsg.match(/at position (\d+)/);
				if (positionMatch) {
					const pos = parseInt(positionMatch[1], 10);
					const start = Math.max(0, pos - 100);
					const end = Math.min(cleanedContent.length, pos + 100);
					console.error(`Error context (around pos ${pos}):`, cleanedContent.substring(start, end));
				}

				console.error('Failed content (first 500 chars):', cleanedContent.substring(0, 500));
				
				// Provide more helpful error message
				throw new Error(`Invalid JSON response from OpenAI (${errorMsg}). The response was likely truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Add IDs to questions
			const questions: QuizQuestion[] = parsed.questions.map((q: ParsedAIQuestion) => ({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				type: q.type,
				prompt: q.prompt,
				options: q.options,
				correctAnswer: q.correctAnswer,
				explanation: q.explanation
			}));

			return {
				questions,
				metadata: {
					model: data.model,
					tokensUsed: data.usage?.total_tokens
				}
			};
		} catch (error) {
			console.error('OpenAI API error:', error);
			// Pass through specific error messages
			if (error.message && error.message.includes('Invalid JSON')) {
				throw error;
			}
			throw new Error(`Failed to generate quiz with OpenAI: ${error.message}`);
		}
	}

	/**
	 * Call Anthropic API
	 */
	private async callAnthropic(prompt: string): Promise<AIQuizGenerationResponse> {
		if (!this.settings.anthropic?.apiKey) {
			throw new Error('Anthropic API key not configured');
		}

		const baseUrl = this.settings.anthropic.baseUrl || 'https://api.anthropic.com/v1';
		const model = this.settings.anthropic.model || 'claude-3-5-sonnet-20241022';

		try {
			const response = await requestUrl({
				url: `${baseUrl}/messages`,
				method: 'POST',
				headers: {
					'x-api-key': this.settings.anthropic.apiKey,
					'anthropic-version': '2023-06-01',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model,
					max_tokens: this.settings.maxTokens,
					temperature: this.settings.temperature,
					system: this.settings.systemPrompt || 'You are a helpful educational assistant that generates quiz questions.',
					messages: [
						{
							role: 'user',
							content: prompt
						}
					]
				})
			});

			const data = response.json;
			const content = data.content[0].text;

			// Clean and parse JSON
			const cleanedContent = this.cleanJsonString(content);

			// Validate JSON structure before parsing
			if (!cleanedContent.startsWith('{') || !cleanedContent.endsWith('}')) {
				console.error('Content does not look like complete JSON after cleaning');
				console.error('Starts with:', cleanedContent.substring(0, 50));
				console.error('Ends with:', cleanedContent.substring(Math.max(0, cleanedContent.length - 50)));
				throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Try to parse JSON response
			let parsed;
			try {
				parsed = JSON.parse(cleanedContent);
			} catch (parseError) {
				console.error('JSON parse error:', parseError);
				console.error('Failed content length:', cleanedContent.length);

				// Log context around error position if available
				const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
				const positionMatch = errorMsg.match(/at position (\d+)/);
				if (positionMatch) {
					const pos = parseInt(positionMatch[1], 10);
					const start = Math.max(0, pos - 100);
					const end = Math.min(cleanedContent.length, pos + 100);
					console.error(`Error context (around pos ${pos}):`, cleanedContent.substring(start, end));
				}
				
				// Provide more helpful error message
				throw new Error(`Invalid JSON response from Anthropic (${errorMsg}). The response was likely truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Add IDs to questions
			const questions: QuizQuestion[] = parsed.questions.map((q: ParsedAIQuestion) => ({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				type: q.type,
				prompt: q.prompt,
				options: q.options,
				correctAnswer: q.correctAnswer,
				explanation: q.explanation
			}));

			return {
				questions,
				metadata: {
					model: data.model,
					tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens
				}
			};
		} catch (error) {
			console.error('Anthropic API error:', error);
			// Pass through specific error messages
			if (error.message && error.message.includes('Invalid JSON')) {
				throw error;
			}
			throw new Error(`Failed to generate quiz with Anthropic: ${error.message}`);
		}
	}

	/**
	 * Call Google Gemini API
	 */
	private async callGemini(prompt: string): Promise<AIQuizGenerationResponse> {
		if (!this.settings.gemini?.apiKey) {
			throw new Error('Gemini API key not configured');
		}

		const baseUrl = this.settings.gemini.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
		const model = this.settings.gemini.model || 'gemini-1.5-flash'; // Fallback to stable model

		let response;
		try {
			// Use x-goog-api-key header for authentication (preferred method)
			const url = `${baseUrl}/models/${model}:generateContent`;
			this.logger?.debug('Gemini API URL:', url);
			this.logger?.debug('Using Gemini model:', model);

			response = await requestUrl({
				url,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': this.settings.gemini.apiKey
				},
				body: JSON.stringify({
					contents: [{
						parts: [{
							text: `${this.settings.systemPrompt || 'You are a helpful educational assistant that generates quiz questions.'}\n\n${prompt}`
						}]
					}],
					generationConfig: {
						temperature: this.settings.temperature,
						maxOutputTokens: this.settings.maxTokens,
						responseMimeType: 'application/json'
					}
				})
			});
		} catch (requestError: unknown) {
			const error = requestError as Partial<RequestUrlResponse> & {
				status?: number;
				text?: string;
				json?: unknown;
				message?: string;
			};

			// Handle network errors (no status code) vs HTTP errors
			console.error('Gemini API request failed:', error);
			console.error('Error status:', error.status);
			console.error('Error message:', error.message);
			
			// Network-level failure (no HTTP status)
			if (error.status === undefined || error.status === 0) {
				const errorMessage = error.message || 'Unknown network error';
				const troubleshootingTips = [
					'Check your internet connection',
					'Verify your API key is correct in Settings → Quiz generation',
					'Check if firewall/proxy is blocking the request',
					'Try again in a few moments',
					`Verify the API endpoint is accessible: ${baseUrl}`
				];
				
				throw new Error(
					`Gemini API network error: ${errorMessage}. ` +
					`Possible causes: ${troubleshootingTips.join('; ')}. ` +
					`Make sure your Gemini API key is valid and you have internet access.`
				);
			}
			
			// Try to extract error message from response
			let errorDetails = 'Unknown error';
			try {
				if (error.json) {
					const errorData = error.json as Record<string, unknown> & {
						error?: { message?: string };
						message?: string;
					};
					console.error('Gemini error response:', JSON.stringify(errorData, null, 2));
					
					// Gemini error format: { error: { code, message, status } }
					if (errorData.error?.message) {
						errorDetails = errorData.error.message;
					} else if (errorData.message) {
						errorDetails = errorData.message;
					} else {
						errorDetails = JSON.stringify(errorData);
					}
				} else if (error.text) {
					errorDetails = error.text;
					console.error('Gemini error text:', errorDetails);
				} else if (error.message) {
					errorDetails = error.message;
				}
			} catch (parseError) {
				console.error('Could not parse error response:', parseError);
			}

			// Provide helpful error messages based on status code
			if (error.status === 400) {
				throw new Error(`Gemini API returned 400 Bad Request: ${errorDetails}. Common causes: invalid model name (check that '${model}' exists), invalid parameters, or malformed request.`);
			} else if (error.status === 401 || error.status === 403) {
				throw new Error(`Gemini API authentication failed (${error.status}): ${errorDetails}. Check your API key in Settings → Quiz generation (AI-powered). Make sure it's a valid Gemini API key from https://aistudio.google.com/apikey`);
			} else if (error.status === 429) {
				throw new Error(`Gemini API rate limit exceeded: ${errorDetails}. Please wait and try again.`);
			} else {
				throw new Error(`Gemini API request failed (status ${error.status}): ${errorDetails}`);
			}
		}

		const data = response.json;

		// Log the full response for debugging
		this.logger?.debug('Full Gemini API response:', JSON.stringify(data, null, 2));

		// Check if response has candidates
		if (!data.candidates || data.candidates.length === 0) {
			console.error('No candidates in response:', data);
			
			// Check for blocked response
			if (data.promptFeedback?.blockReason) {
				throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}. Reason: ${data.promptFeedback.safetyRatings?.[0]?.category || 'Unknown'}`);
			}
			
			throw new Error('Gemini returned no response candidates. The request may have been blocked or failed.');
		}

		const candidate = data.candidates[0];
		let content = candidate.content.parts[0].text;
		const finishReason = candidate.finishReason;

		// Log finish reason for debugging
		this.logger?.log('Gemini finishReason:', finishReason);
		this.logger?.log('Response length:', content.length, 'characters');

		// Check if response was truncated or incomplete
		if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
			console.warn(`Gemini response was truncated. Finish reason: ${finishReason}`);
			throw new Error(`Quiz generation incomplete: Response was too long (finish reason: ${finishReason}). Try generating fewer questions or increase max tokens in settings.`);
		}

		if (finishReason !== 'STOP' && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
			console.warn(`Unexpected finish reason: ${finishReason}`);
		}

		// Log the raw response for debugging
		this.logger?.debug('Raw Gemini response (first 500 chars):', content.substring(0, 500) + '...');
		this.logger?.debug('Raw Gemini response (last 200 chars):', '...' + content.substring(Math.max(0, content.length - 200)));

		// Clean and parse JSON
		const cleanedContent = this.cleanJsonString(content);

		// Validate JSON structure before parsing
		if (!cleanedContent.startsWith('{') || !cleanedContent.endsWith('}')) {
			console.error('Content does not look like complete JSON after cleaning');
			console.error('Starts with:', cleanedContent.substring(0, 50));
			console.error('Ends with:', cleanedContent.substring(Math.max(0, cleanedContent.length - 50)));
			throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
		}

		// Try to parse JSON response
		let parsed;
		try {
			parsed = JSON.parse(cleanedContent);
		} catch (parseError) {
			console.error('JSON parse error:', parseError);
			console.error('Failed content length:', cleanedContent.length);
			
			// Log context around error position if available
			const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
			const positionMatch = errorMsg.match(/at position (\d+)/);
			if (positionMatch) {
				const pos = parseInt(positionMatch[1], 10);
				const start = Math.max(0, pos - 100);
				const end = Math.min(cleanedContent.length, pos + 100);
				console.error(`Error context (around pos ${pos}):`, cleanedContent.substring(start, end));
				console.error(`Error char code at pos ${pos}:`, cleanedContent.charCodeAt(pos));
			}

			console.error('Failed content (first 500 chars):', cleanedContent.substring(0, 500));
			console.error('Failed content (last 200 chars):', cleanedContent.substring(Math.max(0, cleanedContent.length - 200)));
			
			// Provide more helpful error message
			throw new Error(`Invalid JSON response from Gemini (${errorMsg}). The response was likely truncated. Try generating fewer questions (current settings requested questions may be too many) or increase max tokens in settings.`);
		}

		// Validate response structure
		if (!parsed.questions || !Array.isArray(parsed.questions)) {
			console.error('Invalid response structure:', parsed);
			throw new Error('Gemini response missing "questions" array');
		}

		// Add IDs to questions
		const questions: QuizQuestion[] = parsed.questions.map((q: ParsedAIQuestion) => ({
			id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
			type: q.type,
			prompt: q.prompt,
			options: q.options,
			correctAnswer: q.correctAnswer,
			explanation: q.explanation
		}));

		return {
			questions,
			metadata: {
				model: model,
				tokensUsed: data.usageMetadata?.totalTokenCount
			}
		};
	}

	/**
	 * Call OpenRouter API
	 */
	private async callOpenRouter(prompt: string): Promise<AIQuizGenerationResponse> {
		if (!this.settings.openrouter?.apiKey) {
			throw new Error('OpenRouter API key not configured');
		}

		const baseUrl = this.settings.openrouter.baseUrl || 'https://openrouter.ai/api/v1';
		const model = this.settings.openrouter.model || 'openai/gpt-3.5-turbo';

		try {
			const response = await requestUrl({
				url: `${baseUrl}/chat/completions`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openrouter.apiKey}`,
					'HTTP-Referer': 'https://github.com/Maws7140/Flashly', // Required by OpenRouter
					'X-Title': 'Flashly Obsidian Plugin', // Required by OpenRouter
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model,
					messages: [
						{
							role: 'system',
							content: this.settings.systemPrompt || 'You are a helpful educational assistant that generates quiz questions.'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					temperature: this.settings.temperature,
					max_tokens: this.settings.maxTokens
				})
			});

			const data = response.json;
			const content = data.choices[0].message.content;

			// Clean and parse JSON
			const cleanedContent = this.cleanJsonString(content);

			// Validate JSON structure before parsing
			if (!cleanedContent.startsWith('{') || !cleanedContent.endsWith('}')) {
				console.error('Content does not look like complete JSON after cleaning');
				console.error('Starts with:', cleanedContent.substring(0, 50));
				console.error('Ends with:', cleanedContent.substring(Math.max(0, cleanedContent.length - 50)));
				throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Try to parse JSON response
			let parsed;
			try {
				parsed = JSON.parse(cleanedContent);
			} catch (parseError) {
				console.error('JSON parse error:', parseError);
				console.error('Failed content length:', cleanedContent.length);

				// Log context around error position if available
				const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
				const positionMatch = errorMsg.match(/at position (\d+)/);
				if (positionMatch) {
					const pos = parseInt(positionMatch[1], 10);
					const start = Math.max(0, pos - 100);
					const end = Math.min(cleanedContent.length, pos + 100);
					console.error(`Error context (around pos ${pos}):`, cleanedContent.substring(start, end));
				}
				
				// Provide more helpful error message
				throw new Error(`Invalid JSON response from OpenRouter (${errorMsg}). The response was likely truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Add IDs to questions
			const questions: QuizQuestion[] = parsed.questions.map((q: ParsedAIQuestion) => ({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				type: q.type,
				prompt: q.prompt,
				options: q.options,
				correctAnswer: q.correctAnswer,
				explanation: q.explanation
			}));

			return {
				questions,
				metadata: {
					model: data.model,
					tokensUsed: data.usage?.total_tokens
				}
			};
		} catch (error) {
			console.error('OpenRouter API error:', error);
			// Pass through specific error messages
			if (error.message && error.message.includes('Invalid JSON')) {
				throw error;
			}
			throw new Error(`Failed to generate quiz with OpenRouter: ${error.message}`);
		}
	}

	/**
	 * Call custom API endpoint
	 */
	private async callCustomAPI(prompt: string): Promise<AIQuizGenerationResponse> {
		if (!this.settings.custom?.apiKey || !this.settings.custom?.baseUrl) {
			throw new Error('Custom API configuration incomplete');
		}

		try {
			const headers: Record<string, string> = {
				'Authorization': `Bearer ${this.settings.custom.apiKey}`,
				'Content-Type': 'application/json',
				...this.settings.custom.headers
			};

			// Build URL - use custom endpoint or default to /chat/completions
			const endpoint = this.settings.custom.endpoint || '/chat/completions';
			const baseUrl = this.settings.custom.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
			const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`;

			const response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: this.settings.custom.model,
					messages: [
						{
							role: 'system',
							content: this.settings.systemPrompt || 'You are a helpful educational assistant that generates quiz questions.'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					temperature: this.settings.temperature,
					max_tokens: this.settings.maxTokens
				})
			});

			const data = response.json;
			const content = data.choices[0].message.content;

			// Clean and parse JSON
			const cleanedContent = this.cleanJsonString(content);

			// Validate JSON structure before parsing
			if (!cleanedContent.startsWith('{') || !cleanedContent.endsWith('}')) {
				console.error('Content does not look like complete JSON after cleaning');
				console.error('Starts with:', cleanedContent.substring(0, 50));
				console.error('Ends with:', cleanedContent.substring(Math.max(0, cleanedContent.length - 50)));
				throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Try to parse JSON response
			let parsed;
			try {
				parsed = JSON.parse(cleanedContent);
			} catch (parseError) {
				console.error('JSON parse error:', parseError);
				console.error('Failed content length:', cleanedContent.length);

				// Log context around error position if available
				const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
				const positionMatch = errorMsg.match(/at position (\d+)/);
				if (positionMatch) {
					const pos = parseInt(positionMatch[1], 10);
					const start = Math.max(0, pos - 100);
					const end = Math.min(cleanedContent.length, pos + 100);
					console.error(`Error context (around pos ${pos}):`, cleanedContent.substring(start, end));
				}
				
				// Provide more helpful error message
				throw new Error(`Invalid JSON response from Custom API (${errorMsg}). The response was likely truncated. Try generating fewer questions or increase max tokens.`);
			}

			// Add IDs to questions
			const questions: QuizQuestion[] = parsed.questions.map((q: ParsedAIQuestion) => ({
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				type: q.type,
				prompt: q.prompt,
				options: q.options,
				correctAnswer: q.correctAnswer,
				explanation: q.explanation
			}));

			return {
				questions,
				metadata: {
					model: this.settings.custom.model
				}
			};
		} catch (error) {
			console.error('Custom API error:', error);
			// Pass through specific error messages
			if (error.message && error.message.includes('Invalid JSON')) {
				throw error;
			}
			throw new Error(`Failed to generate quiz with custom API: ${error.message}`);
		}
	}
}
