# Flashly Plugin - Changelog

## [1.0.3] - 2025-01-XX

### Changes
- Added audio support documentation to README
- Updated .gitignore to exclude developer files (coverage, scripts, test files)
- Version bump to 1.0.3

---

## [1.0.2] - 2025-01-XX

### Changes
- Update details for version 1.0.2

---

## [1.0.1] - 2025-01-XX

### Changes
- Update details for version 1.0.1

---

## Latest Updates - Quiz Generation & Enhanced Features

### 🎯 Major Features Added

#### 1. AI-Powered Quiz Generation
- **Traditional Quiz Generation**: Rule-based algorithm with multiple choice, fill-in-the-blank, and true/false questions
- **AI Quiz Generation**: Integration with OpenAI, Anthropic, and custom AI providers
  - OpenAI GPT-4, GPT-4 Turbo, GPT-3.5 Turbo support
  - Anthropic Claude 3.5 Sonnet, Opus, Haiku support
  - Custom OpenAI-compatible API support (Ollama, LM Studio, etc.)
- **Configurable Settings**:
  - Toggle AI generation on/off
  - Select AI provider and model
  - Adjust temperature and max tokens
  - Custom system prompts
  - API key management

#### 2. Interactive Quiz View
- **Question Types**: Multiple choice, fill-in-the-blank, true/false
- **Keyboard Shortcuts**:
  - `←/→` Navigate between questions
  - `Enter/Space` Next question or finish quiz
  - `1-4` Select multiple choice answers
  - `T/F` Select true/false answers
  - `Esc` Close quiz
- **Progress Tracking**: Visual progress bar and question counter
- **Results Screen**: Detailed performance breakdown with explanations
- **Question Review**: See correct/incorrect answers with color coding

#### 3. Quiz History View
- **Complete History**: Browse all completed quizzes
- **Sorting & Filtering**:
  - Sort by date, score, or title
  - Filter by generation method (all/traditional/AI)
- **Quiz Management**:
  - View quiz details
  - Retake quizzes
  - Delete quizzes
- **Statistics Summary**: Overview cards with total quizzes, average score, and more

#### 4. Enhanced Statistics Dashboard
- **Quiz Performance Section**:
  - Overview cards (quizzes taken, avg score, questions answered, accuracy)
  - Recent quiz history (last 5 quizzes)
  - Question type performance breakdown
  - Color-coded scores (excellent/good/fair/poor)
  - AI vs Traditional quiz badges
- **Existing Features**:
  - Flashcard overview (total, due, new, review)
  - Deck breakdown with progress bars
  - 30-day review activity heatmap
  - Card distribution charts

#### 5. Comprehensive Example Files
Created three detailed example files:
- **quiz-example.md**: 50+ cards optimized for quiz generation
  - World history topics
  - Mix of all question formats
  - Good distractor candidates
- **cloze-advanced-example.md**: 100+ cloze deletion examples
  - Computer science, math, biology, physics
  - Multiple concepts per field
  - Best practices guide
- **multiline-format-example.md**: 10 detailed programming concept cards
  - Rich formatting with code examples
  - Tables and lists
  - Multi-paragraph explanations

### 🎨 UI/UX Improvements

#### Styling Enhancements
- **Modern Design System**: Consistent color palette and spacing
- **Interactive Elements**: Hover effects, transitions, animations
- **Color-Coded Feedback**:
  - Quiz scores (green/blue/orange/red)
  - Question types badges
  - Generation method indicators
- **Mobile Responsive**: All new views work on small screens
- **Accessibility**: ARIA labels, keyboard navigation, focus states

#### Visual Polish
- **Quiz Statistics**: Clean cards with icons and gradients
- **Quiz History**: Card-based layout with action buttons
- **Keyboard Hints**: Contextual shortcut display
- **Empty States**: Helpful messages with action buttons

### 📁 New Files Created

#### Core Features
- `src/models/quiz.ts` - Quiz data models and types
- `src/quiz/traditional-quiz-generator.ts` - Rule-based quiz generation
- `src/quiz/ai-quiz-generator.ts` - AI-powered quiz generation
- `src/services/quiz-storage.ts` - Quiz persistence layer
- `src/commands/generate-quiz-command.ts` - Quiz generation command

#### UI Components
- `src/ui/quiz-view.ts` - Interactive quiz interface
- `src/ui/quiz-history-view.ts` - Quiz history browser
- Enhanced `src/ui/statistics-view.ts` - Added quiz statistics section

#### Examples
- `examples/quiz-example.md` - World history quiz prep
- `examples/cloze-advanced-example.md` - Advanced cloze deletions
- `examples/multiline-format-example.md` - Programming concepts with ?? format

### 🔧 Technical Improvements

#### Code Quality
- TypeScript strict mode compliance
- Proper null checks and error handling
- Type-safe AI response parsing
- Comprehensive JSDoc comments

#### Architecture
- Modular quiz generation system
- Pluggable AI provider architecture
- Separation of concerns (models/services/ui)
- Event-driven keyboard handling

#### Data Management
- Quiz serialization/deserialization
- History tracking with chronological ordering
- Statistics aggregation
- Graceful error handling for missing data

### 📊 Statistics & Analytics

#### Quiz Metrics
- Total quizzes taken
- Average score across all quizzes
- Total questions answered
- Overall accuracy percentage
- AI vs traditional breakdown

#### Performance Tracking
- Per-question-type accuracy
- Score trends over time
- Time taken per quiz
- Completion rates

### ⚙️ Settings Configuration

#### Quiz Settings Tab
- Enable/disable AI generation
- Provider selection (OpenAI/Anthropic/Custom)
- Model dropdowns per provider
- API key fields (password-protected)
- Temperature slider (0.0 - 2.0)
- Max tokens input
- Custom system prompt textarea
- Configuration warnings for missing credentials

### 🚀 Commands Added
- `Flashly: Generate Quiz` - Open quiz generation modal
- `Flashly: View Quiz History` - Browse completed quizzes
- `Flashly: View Statistics` - Enhanced with quiz performance

### 📝 Documentation Updates
- Comprehensive README with quiz generation section
- AI provider setup instructions with links
- Privacy notes about cloud vs local models
- Example files with inline documentation
- Best practices for quiz generation

### 🔐 Security Considerations
- API keys stored securely in Obsidian's data
- Password-type inputs for sensitive fields
- Clear warnings when credentials missing
- Privacy notice about data sent to AI providers

### 🎯 User Experience Highlights
- **One-click quiz generation** from flashcards
- **Seamless AI integration** with fallback to traditional
- **Intuitive keyboard shortcuts** for power users
- **Visual feedback** for all interactions
- **No data loss** - quizzes persist across sessions
- **Flexible retakes** - generate fresh quiz instances

### 🐛 Bug Fixes
- Fixed TypeScript null pointer in quiz view navigation
- Added missing `quizStorage` property to main plugin
- Resolved ESBuild platform mismatch (documented workaround)
- Fixed keyboard event handler cleanup

### 📈 Performance Optimizations
- Efficient quiz history rendering
- Optimized statistics calculations
- Cached quiz data in memory
- Minimal re-renders on user interactions

## Installation & Usage

### Prerequisites
- Obsidian v1.0.0 or higher
- Node.js 16+ (for development)
- Optional: AI provider API key (for AI quiz generation)

### Development
```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Production build
npm run build

# Run tests
npm test
```

### TypeScript Compilation
```bash
# Type check without emitting
npx tsc --noEmit --skipLibCheck
```

## Next Steps & Future Enhancements

### Potential Features
- [ ] Export quizzes to PDF/Markdown
- [ ] Quiz templates and presets
- [ ] Collaborative quiz sharing
- [ ] Advanced statistics with charts
- [ ] Spaced repetition for quiz retakes
- [ ] Custom quiz question weighting
- [ ] Quiz difficulty adjustment
- [ ] More AI providers (Google Gemini, etc.)
- [ ] Bulk quiz generation
- [ ] Quiz categories and tags

### Known Issues
- ESBuild platform mismatch in WSL (workaround: run `npm install` on Windows)
- Jest-mock type definition requires `skipLibCheck`

## Credits & Acknowledgments
- Built with [Obsidian Plugin API](https://docs.obsidian.md)
- FSRS algorithm via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- AI integration: OpenAI & Anthropic APIs
- Inspired by Anki, Quizlet, and the spaced repetition community

---

**Version**: Development Build
**Last Updated**: 2025-11-01
**Status**: Feature-complete for quiz generation system
