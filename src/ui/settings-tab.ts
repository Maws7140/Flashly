/**
 * Settings UI for Flashly plugin
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type FlashlyPlugin from '../../main';
import type { SchedulerType } from '../settings';
import type { AIProvider } from '../models/quiz';
import { TutorialModal, getTutorialSteps } from './tutorial-modal';

export class FlashlySettingTab extends PluginSettingTab {
	plugin: FlashlyPlugin;

	constructor(app: App, plugin: FlashlyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Flashly settings')
			.setHeading();

		// Inline Parser Settings
		new Setting(containerEl)
			.setName('Inline flashcards')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable inline flashcards')
			.setDesc('Parse Q::A, ??, and {cloze} formats')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.parser.inline.enabled)
				.onChange(async (value) => {
					this.plugin.settings.parser.inline.enabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide dependent settings
				}));

		if (this.plugin.settings.parser.inline.enabled) {
			new Setting(containerEl)
				.setName('Enable Q::A format')
				.setDesc('Single-line question::answer format')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.inline.enableQA)
					.onChange(async (value) => {
						this.plugin.settings.parser.inline.enableQA = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Enable ?? format')
				.setDesc('Multi-line question/answer format')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.inline.enableMultiLine)
					.onChange(async (value) => {
						this.plugin.settings.parser.inline.enableMultiLine = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Enable {cloze} format')
				.setDesc('Cloze deletion format')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.inline.enableCloze)
					.onChange(async (value) => {
						this.plugin.settings.parser.inline.enableCloze = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Create empty cards')
				.setDesc('Create flashcards even when answer is empty')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.inline.createEmptyCards)
					.onChange(async (value) => {
						this.plugin.settings.parser.inline.createEmptyCards = value;
						await this.plugin.saveSettings();
					}));
		}

		// Header Parser Settings
		new Setting(containerEl)
			.setName('Header-based flashcards')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable header-based flashcards')
			.setDesc('Convert headers in tagged notes to flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.parser.header.enabled)
				.onChange(async (value) => {
					this.plugin.settings.parser.header.enabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide dependent settings
				}));

		if (this.plugin.settings.parser.header.enabled) {
			new Setting(containerEl)
				.setName('Flashcard tags')
				.setDesc('Tags that mark notes for header parsing (comma-separated)')
				.addText(text => text
					.setPlaceholder('flashcards, cards')
					.setValue(this.plugin.settings.parser.header.flashcardTags.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.parser.header.flashcardTags = 
							value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Header levels')
				.setDesc('Which header levels to convert (2-6, comma-separated)')
				.addText(text => text
					.setPlaceholder('2, 3, 4, 5, 6')
					.setValue(this.plugin.settings.parser.header.headerLevels.join(', '))
					.onChange(async (value) => {
						const levels = value.split(',')
							.map(l => parseInt(l.trim()))
							.filter(l => l >= 2 && l <= 6);
						this.plugin.settings.parser.header.headerLevels = levels;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Deck name priority')
				.setDesc('Order to determine deck name: frontmatter, title, subtags')
				.addDropdown(dropdown => dropdown
					.addOption('frontmatter,title,subtags', 'Frontmatter → Title → Subtags')
					.addOption('title,frontmatter,subtags', 'Title → Frontmatter → Subtags')
					.addOption('frontmatter,subtags,title', 'Frontmatter → Subtags → Title')
					.setValue(this.plugin.settings.parser.header.deckNamePriority.join(','))
					.onChange(async (value) => {
						this.plugin.settings.parser.header.deckNamePriority = 
							value.split(',') as ('frontmatter' | 'title' | 'subtags')[];
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Use subtags for deck names')
				.setDesc('Use #flashcards/math as deck name')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.header.useSubtags)
					.onChange(async (value) => {
						this.plugin.settings.parser.header.useSubtags = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Answer terminator')
				.setDesc('How to determine where answer ends')
				.addDropdown(dropdown => dropdown
					.addOption('next-header', 'Next header')
					.addOption('blank-line', 'Blank line')
					.addOption('hr', 'Horizontal rule')
					.setValue(this.plugin.settings.parser.header.answerTerminator)
					.onChange(async (value) => {
						this.plugin.settings.parser.header.answerTerminator = 
							value as 'next-header' | 'blank-line' | 'hr';
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Create empty cards')
				.setDesc('Create flashcards even when answer is empty')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.header.createEmptyCards)
					.onChange(async (value) => {
						this.plugin.settings.parser.header.createEmptyCards = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Enable exclusion comments')
				.setDesc('Allow %%NO_FLASHCARD%% to skip headers')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.parser.header.enableExclusion)
					.onChange(async (value) => {
						this.plugin.settings.parser.header.enableExclusion = value;
						await this.plugin.saveSettings();
					}));

			if (this.plugin.settings.parser.header.enableExclusion) {
				new Setting(containerEl)
					.setName('Exclusion comment')
					.setDesc('Comment text to exclude headers')
					.addText(text => text
						.setPlaceholder('%%NO_FLASHCARD%%')
						.setValue(this.plugin.settings.parser.header.exclusionComment)
						.onChange(async (value) => {
							this.plugin.settings.parser.header.exclusionComment = value;
							await this.plugin.saveSettings();
						}));
			}
		}

		// Mixed Formats
		new Setting(containerEl)
			.setName('Advanced')
			.setHeading();

		new Setting(containerEl)
			.setName('Allow mixed formats')
			.setDesc('Allow both inline and header flashcards in same note')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.parser.mixedFormats)
				.onChange(async (value) => {
					this.plugin.settings.parser.mixedFormats = value;
					await this.plugin.saveSettings();
				}));

		// Review Sessions
		new Setting(containerEl)
			.setName('Review sessions')
			.setHeading();

		new Setting(containerEl)
			.setName('Scheduler algorithm')
			.setDesc('Choose between FSRS (default) or SM-2 fallback')
			.addDropdown(dropdown => {
				const scheduler = this.plugin.settings.review.scheduler;
				dropdown.addOption('fsrs', 'FSRS (recommended)');
				dropdown.addOption('sm2', 'SM-2 fallback');
				dropdown.setValue(scheduler);
				dropdown.onChange(async (value) => {
					this.plugin.settings.review.scheduler = value as SchedulerType;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Daily due limit')
			.setDesc('Maximum number of due cards per review session')
			.addText(text => {
				text.inputEl.type = 'number';
				text.setPlaceholder('100');
				text.setValue(String(this.plugin.settings.review.limits.reviewPerDay));
				text.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					this.plugin.settings.review.limits.reviewPerDay = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Daily new limit')
			.setDesc('Maximum number of new cards introduced per session')
			.addText(text => {
				text.inputEl.type = 'number';
				text.setPlaceholder('20');
				text.setValue(String(this.plugin.settings.review.limits.newPerDay));
				text.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					this.plugin.settings.review.limits.newPerDay = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Include learning cards')
			.setDesc('Keep cards in learning steps within the queue')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.review.includeLearningCards)
				.onChange(async (value) => {
					this.plugin.settings.review.includeLearningCards = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ignore empty answers')
			.setDesc('Skip cards without answers until filled in')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.review.excludeEmptyCards)
				.onChange(async (value) => {
					this.plugin.settings.review.excludeEmptyCards = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Deck filter')
			.setDesc('Only review specific decks (comma-separated, leave blank for all decks)')
			.addText(text => {
				text.setPlaceholder('Biology, Chemistry');
				text.setValue(this.plugin.settings.review.deckFilter.join(', '));
				text.onChange(async (value) => {
					this.plugin.settings.review.deckFilter = value
						.split(',')
						.map(deck => deck.trim())
						.filter(deck => deck.length > 0);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Keyboard shortcuts')
			.setDesc('Enable keyboard controls (Space, 1-4, Esc) in review sessions')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.review.enableKeyboardShortcuts)
				.onChange(async (value) => {
					this.plugin.settings.review.enableKeyboardShortcuts = value;
					await this.plugin.saveSettings();
				}));

		// AI Quiz Generation
		new Setting(containerEl)
			.setName('Quiz generation (AI-powered)')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable AI quiz generation')
			.setDesc('Use AI to generate quiz questions from your flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.quiz.enabled)
				.onChange(async (value) => {
					this.plugin.settings.quiz.enabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide AI settings
				}));

		if (this.plugin.settings.quiz.enabled) {
			new Setting(containerEl)
				.setName('AI provider')
				.setDesc('Choose your AI provider for quiz generation')
				.addDropdown(dropdown => dropdown
					.addOption('openai', 'OpenAI (GPT-4, GPT-3.5)')
					.addOption('anthropic', 'Anthropic (Claude)')
					.addOption('gemini', 'Google Gemini')
					.addOption('custom', 'Custom API endpoint')
					.setValue(this.plugin.settings.quiz.provider)
					.onChange(async (value) => {
						this.plugin.settings.quiz.provider = value as AIProvider;
						await this.plugin.saveSettings();
						this.display(); // Refresh to show provider-specific settings
					}));

			// OpenAI Settings
			if (this.plugin.settings.quiz.provider === 'openai') {
				new Setting(containerEl)
					.setName('OpenAI configuration')
					.setHeading();

				new Setting(containerEl)
					.setName('API key')
					.setDesc('Your OpenAI API key')
					.addText(text => {
						text.inputEl.type = 'password';
						text.setPlaceholder('sk-...');
						text.setValue(this.plugin.settings.quiz.openai?.apiKey || '');
						text.onChange(async (value) => {
							if (!this.plugin.settings.quiz.openai) {
								this.plugin.settings.quiz.openai = {
									apiKey: '',
									model: 'gpt-4'
								};
							}
							this.plugin.settings.quiz.openai.apiKey = value;
							await this.plugin.saveSettings();
						});
					});

				new Setting(containerEl)
					.setName('Model')
					.setDesc('OpenAI model to use')
					.addDropdown(dropdown => dropdown
						.addOption('gpt-4', 'GPT-4 (most capable)')
						.addOption('gpt-4-turbo', 'GPT-4 Turbo (faster)')
						.addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo (cheaper)')
						.setValue(this.plugin.settings.quiz.openai?.model || 'gpt-4')
						.onChange(async (value) => {
							if (!this.plugin.settings.quiz.openai) {
								this.plugin.settings.quiz.openai = {
									apiKey: '',
									model: 'gpt-4'
								};
							}
							this.plugin.settings.quiz.openai.model = value;
							await this.plugin.saveSettings();
						}));
			}

			// Anthropic Settings
			if (this.plugin.settings.quiz.provider === 'anthropic') {
				new Setting(containerEl)
					.setName('Anthropic configuration')
					.setHeading();

				new Setting(containerEl)
					.setName('API key')
					.setDesc('Your Anthropic API key')
					.addText(text => {
						text.inputEl.type = 'password';
						text.setPlaceholder('sk-ant-...');
						text.setValue(this.plugin.settings.quiz.anthropic?.apiKey || '');
						text.onChange(async (value) => {
							if (!this.plugin.settings.quiz.anthropic) {
								this.plugin.settings.quiz.anthropic = {
									apiKey: '',
									model: 'claude-3-5-sonnet-20241022'
								};
							}
							this.plugin.settings.quiz.anthropic.apiKey = value;
							await this.plugin.saveSettings();
						});
					});

				new Setting(containerEl)
					.setName('Model')
					.setDesc('Anthropic model to use')
					.addDropdown(dropdown => dropdown
						.addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
						.addOption('claude-3-opus-20240229', 'Claude 3 Opus')
						.addOption('claude-3-sonnet-20240229', 'Claude 3 Sonnet')
						.addOption('claude-3-haiku-20240307', 'Claude 3 Haiku')
						.setValue(this.plugin.settings.quiz.anthropic?.model || 'claude-3-5-sonnet-20241022')
						.onChange(async (value) => {
							if (!this.plugin.settings.quiz.anthropic) {
								this.plugin.settings.quiz.anthropic = {
									apiKey: '',
									model: 'claude-3-5-sonnet-20241022'
								};
							}
							this.plugin.settings.quiz.anthropic.model = value;
							await this.plugin.saveSettings();
						}));
			}

			// Gemini Settings
			if (this.plugin.settings.quiz.provider === 'gemini') {
				new Setting(containerEl)
					.setName('Google Gemini configuration')
					.setHeading();

				new Setting(containerEl)
					.setName('API key')
					.setDesc('Your Google AI Studio API key')
					.addText(text => {
						text.inputEl.type = 'password';
						text.setPlaceholder('AIza...');
						text.setValue(this.plugin.settings.quiz.gemini?.apiKey || '');
						text.onChange(async (value) => {
							if (!this.plugin.settings.quiz.gemini) {
								this.plugin.settings.quiz.gemini = {
									apiKey: '',
									model: 'gemini-1.5-pro'
								};
							}
							this.plugin.settings.quiz.gemini.apiKey = value;
							await this.plugin.saveSettings();
						});
					});

				new Setting(containerEl)
					.setName('Model')
					.setDesc('Gemini model to use')
					.addDropdown(dropdown => dropdown
						.addOption('gemini-2.5-flash', 'Gemini 2.5 Flash (fast, cheaper)')
						.addOption('gemini-2.5-pro', 'Gemini 2.5 Pro (most capable)')
						.addOption('gemini-2.0-flash', 'Gemini 2.0 Flash')
						.addOption('gemini-1.5-flash', 'Gemini 1.5 Flash (legacy)')
						.setValue(this.plugin.settings.quiz.gemini?.model || 'gemini-2.5-flash')
						.onChange(async (value) => {
							if (!this.plugin.settings.quiz.gemini) {
								this.plugin.settings.quiz.gemini = {
									apiKey: '',
									model: 'gemini-1.5-pro'
								};
							}
							this.plugin.settings.quiz.gemini.model = value;
							await this.plugin.saveSettings();
						}));
			}

			// Custom API Settings
			if (this.plugin.settings.quiz.provider === 'custom') {
				new Setting(containerEl)
					.setName('Custom API configuration')
					.setHeading();

				new Setting(containerEl)
					.setName('API key')
					.setDesc('Your API key')
					.addText(text => {
						text.inputEl.type = 'password';
						text.setPlaceholder('Enter API key');
						text.setValue(this.plugin.settings.quiz.custom?.apiKey || '');
						text.onChange(async (value) => {
							if (!this.plugin.settings.quiz.custom) {
								this.plugin.settings.quiz.custom = {
									apiKey: '',
									model: '',
									baseUrl: ''
								};
							}
							this.plugin.settings.quiz.custom.apiKey = value;
							await this.plugin.saveSettings();
						});
					});

				new Setting(containerEl)
					.setName('Base URL')
					.setDesc('API endpoint URL')
					.addText(text => {
						text.setPlaceholder('https://api.example.com/v1');
						text.setValue(this.plugin.settings.quiz.custom?.baseUrl || '');
						text.onChange(async (value) => {
							if (!this.plugin.settings.quiz.custom) {
								this.plugin.settings.quiz.custom = {
									apiKey: '',
									model: '',
									baseUrl: ''
								};
							}
							this.plugin.settings.quiz.custom.baseUrl = value;
							await this.plugin.saveSettings();
						});
					});

			new Setting(containerEl)
				.setName('Model name')
				.setDesc('Model identifier')
				.addText(text => {
					text.setPlaceholder('model-name');
					text.setValue(this.plugin.settings.quiz.custom?.model || '');
					text.onChange(async (value) => {
						if (!this.plugin.settings.quiz.custom) {
							this.plugin.settings.quiz.custom = {
								apiKey: '',
								model: '',
								baseUrl: ''
							};
						}
						this.plugin.settings.quiz.custom.model = value;
						await this.plugin.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName('Endpoint path (optional)')
				.setDesc('API endpoint path (defaults to /chat/completions if not specified)')
				.addText(text => {
					text.setPlaceholder('/chat/completions');
					text.setValue(this.plugin.settings.quiz.custom?.endpoint || '');
					text.onChange(async (value) => {
						if (!this.plugin.settings.quiz.custom) {
							this.plugin.settings.quiz.custom = {
								apiKey: '',
								model: '',
								baseUrl: ''
							};
						}
						this.plugin.settings.quiz.custom.endpoint = value;
						await this.plugin.saveSettings();
					});
				});
		}			// Advanced AI Settings
			new Setting(containerEl)
				.setName('Advanced AI settings')
				.setHeading();

			new Setting(containerEl)
				.setName('Temperature')
				.setDesc('Creativity level (0-1). Higher = more creative, lower = more focused')
				.addSlider(slider => slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.quiz.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.quiz.temperature = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Max tokens')
				.setDesc('Maximum response length')
				.addText(text => {
					text.inputEl.type = 'number';
					text.setPlaceholder('2000');
					text.setValue(String(this.plugin.settings.quiz.maxTokens));
					text.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						this.plugin.settings.quiz.maxTokens = Number.isNaN(parsed) ? 2000 : parsed;
						await this.plugin.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName('System prompt')
				.setDesc('Custom instructions for the AI (optional)')
				.addTextArea(text => {
					text.setPlaceholder('You are a helpful assistant...');
					text.setValue(this.plugin.settings.quiz.systemPrompt || '');
					text.onChange(async (value) => {
						this.plugin.settings.quiz.systemPrompt = value;
						await this.plugin.saveSettings();
					});
					text.inputEl.rows = 4;
				});
		}

		// Tutorial Settings
		new Setting(containerEl)
			.setName('Tutorial')
			.setHeading();

		new Setting(containerEl)
			.setName('Replay tutorial')
			.setDesc('Show the first-time user tutorial again')
			.addButton(button => button
				.setButtonText('Replay tutorial')
				.setTooltip('Replay the interactive tutorial')
				.onClick(() => {
					const modal = new TutorialModal(this.app, {
						steps: getTutorialSteps(),
						onComplete: () => {
							// No action needed for replay
						},
						onSkip: () => {
							// No action needed for replay
						}
					});
					modal.open();
				}));
	}
}
