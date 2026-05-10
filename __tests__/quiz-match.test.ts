import { createEmptyCard } from 'ts-fsrs';
import { FlashlyCard, createFlashlyCard } from '../src/models/card';
import { QuizConfig, QuizQuestion, checkAnswer } from '../src/models/quiz';
import { TraditionalQuizGenerator } from '../src/quiz/traditional-quiz-generator';

describe('Match quiz support', () => {
	it('generates a match question when enabled', () => {
		const generator = new TraditionalQuizGenerator();
		const cards: FlashlyCard[] = [
			createFlashlyCard('Term 1', 'Definition 1', 'test1.md', 1, createEmptyCard(new Date())),
			createFlashlyCard('Term 2', 'Definition 2', 'test2.md', 2, createEmptyCard(new Date())),
			createFlashlyCard('Term 3', 'Definition 3', 'test3.md', 3, createEmptyCard(new Date())),
			createFlashlyCard('Term 4', 'Definition 4', 'test4.md', 4, createEmptyCard(new Date()))
		];

		const config: QuizConfig = {
			questionCount: 1,
			includeMultipleChoice: false,
			includeFillBlank: false,
			includeTrueFalse: false,
			includeMatch: true,
			useAI: false
		};

		const questions = generator.generateQuestions(cards, config);

		expect(questions).toHaveLength(1);
		expect(questions[0].type).toBe('match');
		expect(Array.isArray(questions[0].correctAnswer)).toBe(true);
		if (Array.isArray(questions[0].correctAnswer)) {
			expect(questions[0].correctAnswer).toHaveLength(4);
			expect(questions[0].correctAnswer[0]).toHaveProperty('left');
			expect(questions[0].correctAnswer[0]).toHaveProperty('right');
		}
	});

	it('scores match answers independent of order', () => {
		const question: QuizQuestion = {
			id: 'q-match',
			type: 'match',
			prompt: 'Match pairs',
			correctAnswer: [
				{ left: 'A', right: '1' },
				{ left: 'B', right: '2' }
			]
		};

		expect(checkAnswer(question, [
			{ left: 'B', right: '2' },
			{ left: 'A', right: '1' }
		])).toBe(true);

		expect(checkAnswer(question, [
			{ left: 'A', right: '1' },
			{ left: 'B', right: '3' }
		])).toBe(false);
	});
});