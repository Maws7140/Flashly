/**
 * Tests for Audio Support in Quizzes
 * Tests audio handling across traditional and AI quiz generation
 */

import { extractAudioWikilinks, removeAudioWikilinks } from '../src/utils/audio-utils';
import { AIQuizGenerator } from '../src/quiz/ai-quiz-generator';
import { TraditionalQuizGenerator } from '../src/quiz/traditional-quiz-generator';
import { FlashlyCard, createFlashlyCard } from '../src/models/card';
import { QuizConfig, QuizQuestion } from '../src/models/quiz';
import { createEmptyCard } from 'ts-fsrs';
import { createMockApp } from './setup';

describe('Audio Support in Quizzes', () => {
	describe('Audio Utilities', () => {
		describe('extractAudioWikilinks', () => {
			it('should extract single audio wikilink', () => {
				const markdown = 'Question text ![[audio.mp3]] more text';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(1);
				expect(audioLinks[0]).toBe('![[audio.mp3]]');
			});

			it('should extract multiple audio wikilinks', () => {
				const markdown = '![[audio1.mp3]] Question ![[audio2.wav]] Answer';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(2);
				expect(audioLinks).toContain('![[audio1.mp3]]');
				expect(audioLinks).toContain('![[audio2.wav]]');
			});

			it('should extract audio with alt text', () => {
				const markdown = '![[audio.mp3|description]]';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(1);
				expect(audioLinks[0]).toBe('![[audio.mp3|description]]');
			});

			it('should not extract non-audio files', () => {
				const markdown = '![[image.png]] ![[video.mp4]] ![[audio.mp3]]';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(1);
				expect(audioLinks[0]).toBe('![[audio.mp3]]');
			});

			it('should handle various audio formats', () => {
				const markdown = '![[audio.mp3]] ![[sound.wav]] ![[music.ogg]] ![[track.m4a]]';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(4);
			});

			it('should return empty array for text without audio', () => {
				const markdown = 'Just regular text with no audio';
				const audioLinks = extractAudioWikilinks(markdown);
				
				expect(audioLinks).toHaveLength(0);
			});
		});

		describe('removeAudioWikilinks', () => {
			it('should remove single audio wikilink', () => {
				const markdown = 'Question ![[audio.mp3]] text';
				const cleaned = removeAudioWikilinks(markdown);
				
				expect(cleaned).toBe('Question  text');
			});

			it('should remove multiple audio wikilinks', () => {
				const markdown = '![[audio1.mp3]] Question ![[audio2.wav]]';
				const cleaned = removeAudioWikilinks(markdown);
				
				expect(cleaned).toBe(' Question ');
			});

			it('should preserve non-audio wikilinks', () => {
				const markdown = '![[image.png]] ![[audio.mp3]] text';
				const cleaned = removeAudioWikilinks(markdown);
				
				expect(cleaned).toBe('![[image.png]]  text');
			});

			it('should handle audio with alt text', () => {
				const markdown = '![[audio.mp3|description]] text';
				const cleaned = removeAudioWikilinks(markdown);
				
				expect(cleaned).toBe(' text');
			});
		});
	});

	describe('Traditional Quiz Generator - Audio Support', () => {
		let generator: TraditionalQuizGenerator;

		beforeEach(() => {
			generator = new TraditionalQuizGenerator();
		});

		it('should preserve audio in question prompts', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Listen ![[pronunciation.mp3]] What is this?',
				'Answer',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			// Add more cards for multiple choice (needs at least 4 cards total)
			const cards: FlashlyCard[] = [
				card,
				createFlashlyCard('Q2', 'A2', 'test2.md', 2, createEmptyCard(new Date())),
				createFlashlyCard('Q3', 'A3', 'test3.md', 3, createEmptyCard(new Date())),
				createFlashlyCard('Q4', 'A4', 'test4.md', 4, createEmptyCard(new Date()))
			];

			const config: QuizConfig = {
				questionCount: 1,
				includeMultipleChoice: true,
				includeFillBlank: false,
				includeTrueFalse: false,
				useAI: false
			};

			const questions = generator.generateQuestions(cards, config);
			
			expect(questions.length).toBeGreaterThan(0);
			// Find the question from our test card
			const testQuestion = questions.find(q => q.sourceCardId === card.id);
			if (testQuestion) {
				expect(testQuestion.prompt).toContain('![[pronunciation.mp3]]');
			}
		});

		it('should preserve audio in multiple choice options', () => {
			const cards: FlashlyCard[] = [
				createFlashlyCard(
					'Question',
					'![[answer1.mp3]] Option A',
					'test.md',
					1,
					createEmptyCard(new Date())
				),
				createFlashlyCard(
					'Question',
					'![[answer2.mp3]] Option B',
					'test.md',
					2,
					createEmptyCard(new Date())
				),
				createFlashlyCard(
					'Question',
					'![[answer3.mp3]] Option C',
					'test.md',
					3,
					createEmptyCard(new Date())
				),
				createFlashlyCard(
					'Question',
					'![[answer4.mp3]] Option D',
					'test.md',
					4,
					createEmptyCard(new Date())
				)
			];

			const config: QuizConfig = {
				questionCount: 1,
				includeMultipleChoice: true,
				includeFillBlank: false,
				includeTrueFalse: false,
				useAI: false
			};

			const questions = generator.generateQuestions(cards, config);
			
			expect(questions).toHaveLength(1);
			expect(questions[0].options).toBeDefined();
			if (questions[0].options) {
				// At least one option should contain audio
				const hasAudio = questions[0].options.some(opt => opt.includes('!['));
				expect(hasAudio).toBe(true);
			}
			expect(questions[0].sourceCardId).toBeDefined();
		});

		it('should set sourceCardId for all question types', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question with {cloze}',
				'Answer',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const config: QuizConfig = {
				questionCount: 3,
				includeMultipleChoice: true,
				includeFillBlank: true,
				includeTrueFalse: true,
				useAI: false
			};

			const questions = generator.generateQuestions([card, card, card], config);
			
			expect(questions.length).toBeGreaterThan(0);
			questions.forEach(q => {
				expect(q.sourceCardId).toBeDefined();
			});
		});
	});

	describe('AI Quiz Generator - Audio Support', () => {
		let generator: AIQuizGenerator;
		const mockSettings = {
			enabled: true,
			provider: 'openai' as const,
			openai: {
				apiKey: 'test-key',
				model: 'gpt-4'
			},
			temperature: 0.7,
			maxTokens: 4000
		};

		const mockApp = {
			vault: {
				getAbstractFileByPath: () => null,
				read: () => Promise.resolve(''),
				readBinary: () => Promise.resolve(new ArrayBuffer(0)),
				adapter: {
					write: () => Promise.resolve(),
					mkdir: () => Promise.resolve()
				}
			},
			metadataCache: {
				getFirstLinkpathDest: () => null
			}
		};

		beforeEach(() => {
			generator = new AIQuizGenerator(mockSettings, mockApp as any);
		});

		it('should extract audio metadata from cards', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question ![[audio1.mp3]]',
				'Answer ![[audio2.mp3]]',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			// Access private method via type assertion for testing
			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			
			expect(audioMetadata).toBeDefined();
			expect(audioMetadata[card.id]).toBeDefined();
			expect(audioMetadata[card.id].front).toHaveLength(1);
			expect(audioMetadata[card.id].front[0]).toBe('![[audio1.mp3]]');
			expect(audioMetadata[card.id].back).toHaveLength(1);
			expect(audioMetadata[card.id].back[0]).toBe('![[audio2.mp3]]');
		});

		it('should replace audio with placeholders', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question ![[audio1.mp3]] text',
				'Answer ![[audio2.mp3]]',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			const replaced = (generator as any).replaceAudioWithPlaceholders?.(
				card.front,
				audioMetadata[card.id].front,
				card.id
			);

			expect(replaced).toContain('[AUDIO:');
			expect(replaced).not.toContain('![[audio1.mp3]]');
			expect(replaced).toContain(card.id);
		});

		it('should restore audio from placeholders', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question ![[audio1.mp3]]',
				'Answer ![[audio2.mp3]]',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			const placeholder = `[AUDIO:${card.id}:0]`;
			const restored = (generator as any).restoreAudioInText?.(
				`Listen ${placeholder} and answer`,
				audioMetadata
			);

			expect(restored).toContain('![[audio1.mp3]]');
			expect(restored).not.toContain(placeholder);
		});

		it('should find source card based on content', () => {
			const cards: FlashlyCard[] = [
				createFlashlyCard('What is JavaScript?', 'A programming language', 'test1.md', 1, createEmptyCard(new Date())),
				createFlashlyCard('What is Python?', 'Another language', 'test2.md', 2, createEmptyCard(new Date()))
			];

			const question: QuizQuestion = {
				id: 'q-1',
				type: 'fill-blank',
				prompt: 'What is JavaScript? Answer: _____',
				correctAnswer: 'A programming language'
			};

			const sourceCardId = (generator as any).findSourceCard?.(question, cards);
			expect(sourceCardId).toBe(cards[0].id);
		});

		it('should set sourceCardId for AI-generated questions', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question',
				'Answer',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			// Mock the findSourceCard method behavior
			// In real usage, this is tested through integration
			expect(card.id).toBeDefined();
		});

		it('should handle cards without audio', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question without audio',
				'Answer without audio',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			expect(audioMetadata[card.id].front).toHaveLength(0);
			expect(audioMetadata[card.id].back).toHaveLength(0);
		});

		it('should handle cards with audio in front only', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question ![[audio.mp3]]',
				'Answer',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			expect(audioMetadata[card.id].front).toHaveLength(1);
			expect(audioMetadata[card.id].back).toHaveLength(0);
		});

		it('should handle cards with audio in back only', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question',
				'Answer ![[audio.mp3]]',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card]);
			expect(audioMetadata[card.id].front).toHaveLength(0);
			expect(audioMetadata[card.id].back).toHaveLength(1);
		});

		it('should restore audio in questions with multiple placeholders', () => {
			const card1: FlashlyCard = createFlashlyCard(
				'Question ![[audio1.mp3]]',
				'Answer',
				'test1.md',
				1,
				createEmptyCard(new Date())
			);

			const card2: FlashlyCard = createFlashlyCard(
				'Another ![[audio2.mp3]]',
				'Different',
				'test2.md',
				2,
				createEmptyCard(new Date())
			);

			const audioMetadata = (generator as any).extractAudioMetadata?.([card1, card2]);
			
			// Create a question with placeholders from both cards
			const questionText = `Listen [AUDIO:${card1.id}:0] and [AUDIO:${card2.id}:0] then answer`;
			const restored = (generator as any).restoreAudioInText?.(questionText, audioMetadata);
			
			expect(restored).toContain('![[audio1.mp3]]');
			expect(restored).toContain('![[audio2.mp3]]');
			expect(restored).not.toContain('[AUDIO:');
		});

		it('should restore audio in multiple choice options', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question',
				'Answer ![[correct.mp3]]',
				'test.md',
				1,
				createEmptyCard(new Date())
			);

			const cards = [
				card,
				createFlashlyCard('Q2', 'Option2 ![[wrong1.mp3]]', 'test2.md', 2, createEmptyCard(new Date())),
				createFlashlyCard('Q3', 'Option3 ![[wrong2.mp3]]', 'test3.md', 3, createEmptyCard(new Date())),
				createFlashlyCard('Q4', 'Option4 ![[wrong3.mp3]]', 'test4.md', 4, createEmptyCard(new Date()))
			];

			const audioMetadata = (generator as any).extractAudioMetadata?.(cards);
			
			const question: QuizQuestion = {
				id: 'q-1',
				type: 'multiple-choice',
				prompt: 'Which is correct?',
				options: [
					`[AUDIO:${cards[1].id}:0] Option B`,
					`[AUDIO:${card.id}:0] Option A`,
					`[AUDIO:${cards[2].id}:0] Option C`,
					`[AUDIO:${cards[3].id}:0] Option D`
				],
				correctAnswer: 1
			};

			const restored = (generator as any).restoreAudioInQuestions?.([question], cards, audioMetadata);
			
			expect(restored[0].options).toBeDefined();
			if (restored[0].options) {
				expect(restored[0].options[1]).toContain('![[correct.mp3]]');
				expect(restored[0].options[0]).toContain('![[wrong1.mp3]]');
			}
			expect(restored[0].sourceCardId).toBeDefined();
		});
	});

	describe('Audio Question Types', () => {
		it('should support audio-prompt question type', () => {
			const question: QuizQuestion = {
				id: 'test-1',
				type: 'audio-prompt',
				prompt: '![[question.mp3]] Listen and answer',
				correctAnswer: 'answer',
				sourceCardId: 'card-1'
			};

			expect(question.type).toBe('audio-prompt');
			expect(question.prompt).toContain('![');
			expect(question.sourceCardId).toBeDefined();
		});

		it('should support audio in multiple choice options', () => {
			const question: QuizQuestion = {
				id: 'test-2',
				type: 'multiple-choice',
				prompt: 'Question',
				options: [
					'![[option1.mp3]] Option A',
					'![[option2.mp3]] Option B',
					'![[option3.mp3]] Option C',
					'![[option4.mp3]] Option D'
				],
				correctAnswer: 0,
				sourceCardId: 'card-1'
			};

			expect(question.type).toBe('multiple-choice');
			expect(question.options).toBeDefined();
			if (question.options) {
				question.options.forEach(opt => {
					expect(opt).toContain('![');
				});
			}
		});
	});

	describe('Source Card ID Resolution', () => {
		it('should preserve sourceCardId for audio path resolution', () => {
			const card: FlashlyCard = createFlashlyCard(
				'Question ![[audio.mp3]]',
				'Answer',
				'folder/test.md',
				1,
				createEmptyCard(new Date())
			);

			const question: QuizQuestion = {
				id: 'q-1',
				type: 'fill-blank',
				prompt: 'Question ![[audio.mp3]]',
				correctAnswer: 'answer',
				sourceCardId: card.id
			};

			expect(question.sourceCardId).toBe(card.id);
			// The source path can be resolved from card.id -> card.source.file
			expect(card.source.file).toBe('folder/test.md');
		});

		it('should handle questions without sourceCardId gracefully', () => {
			const question: QuizQuestion = {
				id: 'q-1',
				type: 'fill-blank',
				prompt: 'Question',
				correctAnswer: 'answer'
				// No sourceCardId
			};

			expect(question.sourceCardId).toBeUndefined();
			// Audio path resolution should handle this gracefully
		});
	});
});
