/**
 * Traditional Quiz Generator
 * Generates quiz questions from flashcards using rule-based algorithms
 */

import { FlashlyCard } from '../models/card';
import { QuizQuestion, QuizQuestionType, QuizConfig } from '../models/quiz';

export class TraditionalQuizGenerator {
	/**
	 * Generate quiz questions from flashcards
	 */
	generateQuestions(cards: FlashlyCard[], config: QuizConfig): QuizQuestion[] {
		if (cards.length === 0) {
			throw new Error('No cards available to generate quiz');
		}

		const questions: QuizQuestion[] = [];
		const availableTypes: QuizQuestionType[] = [];

		if (config.includeMultipleChoice) availableTypes.push('multiple-choice');
		if (config.includeFillBlank) availableTypes.push('fill-blank');
		if (config.includeTrueFalse) availableTypes.push('true-false');

		if (availableTypes.length === 0) {
			throw new Error('At least one question type must be enabled');
		}

		// Shuffle cards for randomness
		const shuffledCards = this.shuffleArray([...cards]);

		// Calculate how many of each type to generate
		const questionsPerType = Math.floor(config.questionCount / availableTypes.length);
		const remainder = config.questionCount % availableTypes.length;

		let cardIndex = 0;

		// Generate questions for each type
		availableTypes.forEach((type, typeIndex) => {
			const count = questionsPerType + (typeIndex < remainder ? 1 : 0);

			for (let i = 0; i < count && cardIndex < shuffledCards.length; i++) {
				const card = shuffledCards[cardIndex];
				cardIndex++;

				try {
					let question: QuizQuestion | null = null;

					switch (type) {
						case 'multiple-choice':
							question = this.generateMultipleChoice(card, cards);
							break;
						case 'fill-blank':
							question = this.generateFillBlank(card);
							break;
						case 'true-false':
							question = this.generateTrueFalse(card, cards);
							break;
					}

					if (question) {
						questions.push(question);
					}
				} catch (error) {
					console.warn(`Failed to generate ${type} question for card ${card.id}:`, error);
					// Continue with next card
				}
			}
		});

		// If we didn't generate enough questions, fill with any available cards
		while (questions.length < config.questionCount && cardIndex < shuffledCards.length) {
			const card = shuffledCards[cardIndex];
			cardIndex++;

			// Try each type until one succeeds
			for (const type of availableTypes) {
				try {
					let question: QuizQuestion | null = null;

					switch (type) {
						case 'multiple-choice':
							question = this.generateMultipleChoice(card, cards);
							break;
						case 'fill-blank':
							question = this.generateFillBlank(card);
							break;
						case 'true-false':
							question = this.generateTrueFalse(card, cards);
							break;
					}

					if (question) {
						questions.push(question);
						break;
					}
				} catch {
					continue;
				}
			}
		}

		return questions.slice(0, config.questionCount);
	}

	/**
	 * Generate a multiple choice question
	 */
	private generateMultipleChoice(card: FlashlyCard, allCards: FlashlyCard[]): QuizQuestion | null {
		if (!card.back || card.back.trim() === '') {
			return null;
		}

		// Get distractors from the same deck
		const sameDeckCards = allCards.filter(c =>
			c.deck === card.deck &&
			c.id !== card.id &&
			c.back &&
			c.back.trim() !== '' &&
			c.back !== card.back
		);

		if (sameDeckCards.length < 3) {
			// Not enough cards for good distractors
			return null;
		}

		// Randomly select 3 distractors
		const shuffled = this.shuffleArray(sameDeckCards);
		const distractors = shuffled.slice(0, 3).map(c => c.back.trim());

		// Create options array with correct answer
		const options = [...distractors, card.back.trim()];

		// Shuffle options
		const shuffledOptions = this.shuffleArray(options);

		// Find correct answer index
		const correctIndex = shuffledOptions.indexOf(card.back.trim());

		return {
			id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
			type: 'multiple-choice',
			prompt: card.front,
			options: shuffledOptions,
			correctAnswer: correctIndex,
			sourceCardId: card.id
		};
	}

	/**
	 * Generate a fill-in-the-blank question
	 */
	private generateFillBlank(card: FlashlyCard): QuizQuestion | null {
		// Look for cloze deletions in the front text
		const clozePattern = /\{([^}]+)\}/g;
		const matches = card.front.match(clozePattern);

		if (!matches || matches.length === 0) {
			// No cloze deletions found, try to create one from the answer
			if (!card.back || card.back.trim() === '') {
				return null;
			}

			// Create a fill-blank using the front as prompt and back as answer
			return {
				id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
				type: 'fill-blank',
				prompt: card.front,
				correctAnswer: card.back.trim(),
				sourceCardId: card.id
			};
		}

		// Use the first cloze deletion
		const firstCloze = matches[0];
		const answer = firstCloze.slice(1, -1); // Remove { and }
		const prompt = card.front.replace(firstCloze, '_____');

		return {
			id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
			type: 'fill-blank',
			prompt,
			correctAnswer: answer.trim(),
			sourceCardId: card.id
		};
	}

	/**
	 * Generate a true/false question
	 */
	private generateTrueFalse(card: FlashlyCard, allCards: FlashlyCard[]): QuizQuestion | null {
		if (!card.back || card.back.trim() === '') {
			return null;
		}

		// Randomly decide if this should be true or false
		const isTrue = Math.random() > 0.5;

		let prompt: string;
		let correctAnswer: string;

		if (isTrue) {
			// Create a true statement
			prompt = `True or False: ${card.front} - ${card.back}`;
			correctAnswer = 'true';
		} else {
			// Create a false statement by using another card's answer
			const sameDeckCards = allCards.filter(c =>
				c.deck === card.deck &&
				c.id !== card.id &&
				c.back &&
				c.back.trim() !== '' &&
				c.back !== card.back
			);

			if (sameDeckCards.length === 0) {
				// Can't create a false statement, make it true instead
				prompt = `True or False: ${card.front} - ${card.back}`;
				correctAnswer = 'true';
			} else {
				const wrongCard = sameDeckCards[Math.floor(Math.random() * sameDeckCards.length)];
				prompt = `True or False: ${card.front} - ${wrongCard.back}`;
				correctAnswer = 'false';
			}
		}

		return {
			id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
			type: 'true-false',
			prompt,
			options: ['True', 'False'],
			correctAnswer,
			sourceCardId: card.id
		};
	}

	/**
	 * Shuffle array using Fisher-Yates algorithm
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const result = [...array];
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	}
}
