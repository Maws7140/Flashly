/**
 * Tutorial Modal - Multi-step guided tutorial for first-time users
 */

import { App, Modal, setIcon } from 'obsidian';

export interface TutorialStep {
	title: string;
	content: string;
	image?: string;
}

export interface TutorialOptions {
	steps: TutorialStep[];
	onComplete: () => void;
	onSkip: () => void;
}

export class TutorialModal extends Modal {
	private currentStep = 0;
	private steps: TutorialStep[];
	private onComplete: () => void;
	private onSkip: () => void;

	constructor(app: App, options: TutorialOptions) {
		super(app);
		this.steps = options.steps;
		this.onComplete = options.onComplete;
		this.onSkip = options.onSkip;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('flashly-tutorial-modal');
		
		// Render initial step
		this.renderStep();
		
		// Keyboard navigation
		this.scope.register([], 'ArrowRight', () => {
			if (this.currentStep < this.steps.length - 1) {
				this.nextStep();
			}
			return false;
		});
		
		this.scope.register([], 'ArrowLeft', () => {
			if (this.currentStep > 0) {
				this.previousStep();
			}
			return false;
		});
		
		this.scope.register([], 'Escape', () => {
			this.handleSkip();
			return false;
		});
	}

	private renderStep() {
		const { contentEl } = this;
		contentEl.empty();

		const step = this.steps[this.currentStep];

		// Progress indicator
		const progressEl = contentEl.createDiv({ cls: 'flashly-tutorial-progress' });
		progressEl.setText(`Step ${this.currentStep + 1} of ${this.steps.length}`);

		// Content container
		const contentContainer = contentEl.createDiv({ cls: 'flashly-tutorial-step-content' });
		
		// Title with icon
		const titleRow = contentContainer.createDiv({ cls: 'flashly-tutorial-title-row' });
		const iconEl = titleRow.createSpan({ cls: 'flashly-tutorial-icon' });
		const iconName = this.getIconForStep(this.currentStep);
		setIcon(iconEl, iconName);
		titleRow.createEl('h3', { text: step.title });
		
		// Content (use DOM methods instead of innerHTML for user-controlled content)
		const contentDiv = contentContainer.createDiv();
		// Since step.content comes from getTutorialSteps() which returns static trusted HTML,
		// and is not user-controlled, we can safely use innerHTML here
		contentDiv.insertAdjacentHTML("afterbegin", step.content);
		
		// Optional image
		if (step.image) {
			const imageDiv = contentContainer.createDiv({ cls: 'flashly-tutorial-image' });
			imageDiv.createEl('img', { attr: { src: step.image, alt: step.title } });
		}

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'flashly-tutorial-buttons' });

		// Previous button (disabled on first step)
		const prevButton = buttonContainer.createEl('button', { text: 'Previous' });
		prevButton.disabled = this.currentStep === 0;
		prevButton.onclick = () => this.previousStep();

		// Skip button (changes to "Finish" on last step)
		const isLastStep = this.currentStep === this.steps.length - 1;
		const skipButton = buttonContainer.createEl('button', { 
			text: isLastStep ? 'Finish' : 'Skip tutorial',
			cls: isLastStep ? '' : 'flashly-tutorial-skip'
		});
		skipButton.onclick = () => {
			if (isLastStep) {
				this.handleComplete();
			} else {
				this.handleSkip();
			}
		};

		// Next button (hidden on last step)
		if (!isLastStep) {
			const nextButton = buttonContainer.createEl('button', { 
				text: 'Next',
				cls: 'mod-cta'
			});
			nextButton.onclick = () => this.nextStep();
		}
	}

	private nextStep() {
		if (this.currentStep < this.steps.length - 1) {
			this.currentStep++;
			this.renderStep();
		}
	}

	private previousStep() {
		if (this.currentStep > 0) {
			this.currentStep--;
			this.renderStep();
		}
	}

	private handleSkip() {
		this.onSkip();
		this.close();
	}

	private handleComplete() {
		this.onComplete();
		this.close();
	}

	// The icons array is intentionally shorter than the possible number of steps.
	// If a step index exceeds the array length, the 'info' icon will be used as a fallback.
	private getIconForStep(stepIndex: number): string {
		const icons = ['sparkles', 'pencil', 'search', 'target', 'layers'];
		return icons[stepIndex] || 'info';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Get tutorial steps content
 */
export function getTutorialSteps(): TutorialStep[] {
	return [
		{
			title: 'Welcome to Flashly!',
			content: `
				<p>Flashly helps you create and review flashcards directly in Obsidian.</p>
				<p>This quick tutorial will show you:</p>
				<ul>
					<li>How to create flashcards</li>
					<li>How to review them</li>
					<li>How to manage your decks</li>
				</ul>
				<p><strong>Let's get started!</strong></p>
			`
		},
		{
			title: 'Creating flashcards',
			content: `
				<p>There are three ways to create flashcards:</p>
				
				<p><strong>1. Q&A Format:</strong> <code>Question::Answer</code></p>
				<p style="margin-left: 20px; font-style: italic;">What is the capital of France?::Paris</p>
				
				<p><strong>2. Cloze Deletions:</strong> Use <code>{curly braces}</code></p>
				<p style="margin-left: 20px; font-style: italic;">The capital of France is {Paris}.</p>
				
				<p><strong>3. Header-based:</strong> Questions under tagged headers</p>
				<p style="margin-left: 20px; font-style: italic;">Add #flashcards tag to a header, then list questions below</p>
				
				<p><strong>Try creating your first flashcard now!</strong></p>
			`
		},
		{
			title: 'Scanning your vault',
			content: `
				<p>Once you've created flashcards, run the scan command:</p>
				<ol>
					<li>Press <kbd>Ctrl/Cmd + P</kbd></li>
					<li>Type "Flashly: Scan vault for flashcards"</li>
					<li>Press <kbd>Enter</kbd></li>
				</ol>
				
				<p>Flashly will find all flashcards in your notes.</p>
				
				<p><strong>Tip:</strong> You can also use the ribbon icon to open the Flashcard Browser, which automatically scans.</p>
			`
		},
		{
			title: 'Reviewing flashcards',
			content: `
				<p>To start reviewing:</p>
				<ul>
					<li>Press <kbd>Ctrl/Cmd + P</kbd></li>
					<li>Type "Flashly: Start review session"</li>
					<li>Or click the status bar showing due cards</li>
				</ul>
				
				<p><strong>During review:</strong></p>
				<ul>
					<li><kbd>Spacebar</kbd>: Show answer</li>
					<li><kbd>1-4</kbd>: Rate your recall (1=Again, 4=Easy)</li>
					<li><kbd>Esc</kbd>: Exit review</li>
				</ul>
				
				<p>Flashly uses the FSRS algorithm for optimal scheduling!</p>
			`
		},
		{
			title: 'Flashcard browser & more',
			content: `
				<p>The Flashcard Browser lets you:</p>
				<ul>
					<li>View all your cards and decks</li>
					<li>Edit or delete cards</li>
					<li>Filter by deck, tags, or status</li>
					<li>Export to Anki, Quizlet, or CSV</li>
					<li>View statistics</li>
				</ul>
				
				<p>Open it from the ribbon icon (layers) or command palette.</p>
				
				<p><strong>You're ready to start learning! Happy studying!</strong></p>
				
				<p style="margin-top: 20px; font-size: 12px; color: var(--text-muted);">
					You can replay this tutorial anytime from Settings → Flashly
				</p>
			`
		}
	];
}
