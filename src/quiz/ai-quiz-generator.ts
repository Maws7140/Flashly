/**
 * AI Quiz Generator
 * Generates quiz questions using AI providers (OpenAI, Anthropic, or custom)
 */

import { FlashlyCard } from '../models/card';
import { QuizQuestion, QuizConfig, AIQuizSettings, AIQuizGenerationResponse, QuizQuestionType } from '../models/quiz';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Logger } from '../utils/logger';

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
	constructor(
		private settings: AIQuizSettings,
		private logger?: Logger
	) {}

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

		// Prepare card data for AI
		const cardData = cards.map(card => ({
			id: card.id,
			front: card.front,
			back: card.back,
			deck: card.deck
		}));

		// Generate prompt
		const prompt = this.buildPrompt(cardData, config);

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
			case 'custom':
				response = await this.callCustomAPI(prompt);
				break;
			default:
				throw new Error(`Unknown AI provider: ${this.settings.provider}`);
		}

		return response.questions;
	}

	/**
	 * Build prompt for AI
	 */
	private buildPrompt(cards: Array<{ id: string; front: string; back: string; deck: string }>, config: QuizConfig): string {
		const questionTypes = [];
		if (config.includeMultipleChoice) questionTypes.push('multiple-choice');
		if (config.includeFillBlank) questionTypes.push('fill-in-the-blank');
		if (config.includeTrueFalse) questionTypes.push('true-false');

		return `You are an educational quiz generator. Generate ${config.questionCount} quiz questions from the following flashcards.

**Question Types to Generate:**
${questionTypes.map(t => `- ${t}`).join('\n')}

**Flashcards:**
${cards.map((card, i) => `${i + 1}. Q: ${card.front}\n   A: ${card.back}`).join('\n\n')}

**Instructions:**
1. Generate exactly ${config.questionCount} questions
2. Distribute questions evenly across the requested types
3. For multiple-choice questions, provide 4 options with the correct answer
4. For fill-in-the-blank, create a clear prompt with a blank to fill
5. For true-false, create statements that test understanding
6. Make questions clear, unambiguous, and test real understanding
7. Use varied difficulty levels

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
    }
  ]
}

Respond ONLY with valid JSON in the format above. Do not include any other text.`;
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

			// Parse JSON response
			const parsed = JSON.parse(content as string) as ParsedAIResponse;

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

			// Parse JSON response
			const parsed = JSON.parse(content as string) as ParsedAIResponse;

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
			};

			// Handle HTTP errors (400, 401, 403, etc.)
			console.error('Gemini API request failed:', error);
			console.error('Error status:', error.status);
			
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
				}
			} catch (parseError) {
				console.error('Could not parse error response:', parseError);
			}

			// Provide helpful error messages based on status code
			if (error.status === 400) {
				throw new Error(`Gemini API returned 400 Bad Request: ${errorDetails}. Common causes: invalid model name (check that '${model}' exists), invalid parameters, or malformed request.`);
			} else if (error.status === 401 || error.status === 403) {
				throw new Error(`Gemini API authentication failed (${error.status}): ${errorDetails}. Check your API key in settings.`);
			} else if (error.status === 429) {
				throw new Error(`Gemini API rate limit exceeded: ${errorDetails}. Please wait and try again.`);
			} else {
				throw new Error(`Gemini API request failed (status ${error.status ?? 'unknown'}): ${errorDetails}`);
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

		// Remove markdown code blocks if present (e.g., ```json ... ```)
		content = content.trim();
		if (content.startsWith('```')) {
			// Remove opening ```json or ```
			content = content.replace(/^```(?:json)?\s*\n/, '');
			// Remove closing ```
			content = content.replace(/\n```\s*$/, '');
			content = content.trim();
		}

		// Validate JSON structure before parsing
		if (!content.startsWith('{') || !content.endsWith('}')) {
			console.error('Content does not look like complete JSON');
			console.error('Starts with:', content.substring(0, 50));
			console.error('Ends with:', content.substring(Math.max(0, content.length - 50)));
			throw new Error(`Response appears incomplete (doesn't start/end with braces). This usually means the response was truncated. Try generating fewer questions or increase max tokens.`);
		}

		// Try to parse JSON response
		let parsed;
		try {
			parsed = JSON.parse(content as string);
		} catch (parseError) {
			console.error('JSON parse error:', parseError);
			console.error('Failed content length:', content.length);
			console.error('Failed content (first 500 chars):', content.substring(0, 500));
			console.error('Failed content (last 200 chars):', content.substring(Math.max(0, content.length - 200)));
			
			// Provide more helpful error message
			const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
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

			// Parse JSON response
			const parsed = JSON.parse(content as string) as ParsedAIResponse;

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
			throw new Error(`Failed to generate quiz with custom API: ${error.message}`);
		}
	}
}
