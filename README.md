# Flashly - Spaced Repetition Flashcards for Obsidian

Flashly is a powerful Obsidian plugin that transforms your notes into flashcards using spaced repetition learning powered by FSRS (Free Spaced Repetition Scheduler).

![Flashly Quiz Interface](screenshots/flashlyq.png)

## Features

### Multiple Flashcard Formats

Flashly supports four different flashcard formats to match your note-taking style:

#### 1. Q::A Format (Inline)
```markdown
What is the capital of France::Paris
What is 2+2::4
```

#### 2. ?? Format (Multi-line)
```markdown
What is photosynthesis?
??
The process by which plants convert light energy into chemical energy.
```

#### 3. {Cloze} Format
```markdown
The {mitochondria} is the powerhouse of the cell.
Paris is the capital of {France}.
```

#### 4. Header Format
```markdown
## What is a cell?
The basic structural unit of all living organisms.

## What is the function of mitochondria?
Mitochondria are the powerhouse of the cell, responsible for producing ATP.
```

### Smart Deck Organization

- **Automatic deck creation** from note filenames
- **Custom deck names** via frontmatter `deck:` property
- **Subtag-based decks**: `#flashcards/biology` creates a "biology" deck
- **Flexible deck hierarchy** based on your tag structure

### FSRS Algorithm

Flashly uses the modern FSRS (Free Spaced Repetition Scheduler) algorithm for optimal learning efficiency:
- **20% fewer reviews** compared to traditional SM-2
- **Adaptive scheduling** based on your performance
- **SM-2 fallback option** available in settings

### Flashcard Browser

A powerful browser view to manage your flashcards:
- **Deck overview** with statistics
- **Search and filter** by deck, status, or content
- **Study directly** from the browser
- **Track progress** for each deck

![Flashcard Browser](screenshots/Flashlyqh.png)

### Review Sessions

- **Keyboard shortcuts** for quick reviews (Space, 1-4, Esc)
- **Card flipping animation** for better UX
- **Progress tracking** during sessions
- **Session summaries** with detailed statistics

## Getting Started

When you first activate Flashly, an interactive tutorial will guide you through:
- Creating flashcards (Q&A, cloze, header-based)
- Scanning your vault for flashcards
- Starting review sessions
- Using the Flashcard Browser

You can replay the tutorial anytime:
- **From Settings:** Flashly → Tutorial → "Start Tutorial"
- **From Command Palette:** "Flashly: Replay Tutorial"

### 1. Tag Your Notes

**Important:** Flashly only parses notes that are explicitly tagged for flashcard parsing.

Add the `flashcards` tag to your note's frontmatter:

```yaml
---
tags: [flashcards]
---
```

Without this tag, your note will be ignored during scanning, even if it contains flashcard syntax.

### 2. Create Flashcards

Once your note is tagged, you can use any of the supported flashcard formats:

```markdown
---
tags: [flashcards]
deck: Spanish Vocabulary
---

# Spanish Study Notes

Hola::Hello
Adiós::Goodbye

## What does "gracias" mean?
Thank you
```

### 3. Scan Your Vault

Use the command palette (`Ctrl/Cmd+P`) and run:
- **"Flashly: Scan vault for flashcards"**

This will find all flashcards in tagged notes and add them to your collection.

### 4. Review Your Cards

Click the flashcard icon in the ribbon or use the command:
- **"Flashly: Open Flashcard Browser"**

Browse your decks and start reviewing!

## Custom Configuration

### Custom Flashcard Tags

You can configure custom tags in **Settings → Flashly → Header-Based Flashcards**.

Default tags: `flashcards`, `cards`

### Custom Deck Names

Control how your flashcards are organized into decks:

**Option 1: Frontmatter deck property**
```yaml
---
tags: [flashcards]
deck: My Custom Deck
---
```

**Option 2: Subtags**
```yaml
---
tags: [flashcards/biology]
---
```
This creates a "biology" deck.

**Option 3: Auto-naming (Default)**
If no custom deck is specified, cards use the note's filename as the deck name.

### Scheduler Settings

Choose between FSRS (default) and SM-2 algorithms in the settings:
- **FSRS**: Modern, adaptive, 20% more efficient
- **SM-2**: Traditional, reliable fallback option

Configure daily limits:
- **Review limit**: Maximum due cards per day
- **New cards limit**: Maximum new cards introduced per day

## Installation

### From Obsidian Community Plugins
1. Open **Settings → Community Plugins**
2. Search for "Flashly"
3. Click **Install**, then **Enable**

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder: `<vault>/.obsidian/plugins/flashly/`
3. Copy the files into that folder
4. Reload Obsidian
5. Enable the plugin in **Settings → Community Plugins**

## Development

### Install Dependencies
```bash
npm install
```

### Development Build (Watch Mode)
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

## Troubleshooting

### My flashcards aren't being found

Make sure your note has the `flashcards` tag in frontmatter:

```yaml
---
tags: [flashcards]
---
```

Without this tag, the note will not be scanned.

### Cards appear from unintended notes

If you're seeing flashcards from notes you didn't intend to parse, check if those notes have the `flashcards` tag. Remove the tag from notes you don't want parsed, then re-scan your vault.

### How do I remove unwanted flashcards?

1. Remove the `flashcards` tag from the note
2. Run **"Scan vault for flashcards"** again
3. The cards from that note will be automatically deleted

### Review session not showing cards

Check your settings:
- Make sure you have cards due for review
- Check if deck filters are limiting which cards appear
- Verify that daily limits haven't been reached

## Examples

See the `examples/` folder for comprehensive demonstrations of all features:
- `complete-example.md` - Full feature showcase
- `inline-tag-example.md` - Inline format examples

## Contributing

Contributions are welcome! Please see the development section above for setup instructions.

## License

MIT License - See LICENSE file for details

## Support

- [Support on Ko-fi](https://ko-fi.com/kingmaws) - If you find Flashly useful, consider supporting development
- [Report a Bug](https://github.com/SamW7140/Flashly-/issues)
- [Request a Feature](https://github.com/SamW7140/Flashly-/issues)
- [Documentation](https://github.com/SamW7140/Flashly-/tree/master/docs)

## Quiz Generation

Flashly includes powerful quiz generation capabilities with **optional AI enhancement**.

### Traditional Quiz Generation

Generate quizzes automatically from your flashcards using rule-based algorithms:

**Question Types:**
- **Multiple Choice**: Uses other cards from the same deck as plausible distractors
- **Fill-in-the-Blank**: Extracted from cloze deletions `{text}`
- **True/False**: Creates statements to validate understanding

**How to Use:**
1. Run command: **"Generate Quiz"**
2. Configure:
   - Number of questions
   - Question types to include
   - Deck filter (optional)
3. Click **"Generate Quiz"**
4. Take your quiz!

### AI-Powered Quiz Generation 🤖

**NEW!** Use AI to generate creative, contextual quiz questions from your flashcards.

#### Supported AI Providers

**OpenAI** (GPT-4, GPT-4 Turbo, GPT-3.5)
- Most capable and widely used
- Great for creative question generation
- Requires OpenAI API key

**Anthropic** (Claude 3.5 Sonnet, Opus, Haiku)
- Excellent at educational content
- Strong reasoning capabilities
- Requires Anthropic API key

**Google Gemini** (Gemini 1.5 Pro, Flash, Flash-8B)
- Fast and efficient
- Strong multimodal capabilities
- Requires Google AI Studio API key
- Cost-effective option

**Custom API**
- Any OpenAI-compatible endpoint
- Local models (Ollama, LM Studio, etc.)
- Complete control over your data

#### Setting Up AI Quiz Generation

1. **Enable AI** in Settings → Flashly → Quiz Generation
2. **Choose Provider**: OpenAI, Anthropic, Gemini, or Custom
3. **Configure API Key** and model
4. **Adjust Settings** (optional):
   - Temperature (creativity level)
   - Max tokens (response length)
   - Custom system prompt

#### API Key Setup

**For OpenAI:**
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Paste in Settings → Quiz Generation → OpenAI Configuration

**For Anthropic:**
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Paste in Settings → Quiz Generation → Anthropic Configuration

**For Google Gemini:**
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Paste in Settings → Quiz Generation → Gemini Configuration

**For Custom/Local Models:**
1. Set base URL (e.g., `http://localhost:11434/v1` for Ollama)
2. Add API key if required
3. Specify model name

#### Using AI Quiz Generation

1. Run **"Generate Quiz"** command
2. Configure your quiz
3. **Toggle "Use AI to generate questions"** ✨
4. Click **"Generate Quiz"**
5. AI will create contextual, creative questions!

**Benefits of AI Generation:**
- More natural question phrasing
- Better context understanding
- Creative variations on concepts
- Explanation generation
- Adaptive difficulty

**Privacy Note:** When using cloud providers (OpenAI/Anthropic), your flashcard content is sent to their servers. Use local models if you need complete privacy.

## AnkiConnect Integration

Sync your Flashly cards directly to Anki without exporting CSV files!

### What is AnkiConnect?

[AnkiConnect](https://ankiweb.net/shared/info/2055492159) is an Anki add-on that provides an API for external applications to communicate with Anki.

### Setup Instructions

#### Step 1: Install AnkiConnect Add-on

1. Open Anki
2. Go to **Tools → Add-ons → Get Add-ons**
3. Enter code: `2055492159`
4. Click **OK** and restart Anki

#### Step 2: Configure AnkiConnect for Obsidian

AnkiConnect needs to allow requests from Obsidian. Edit the AnkiConnect configuration:

1. In Anki, go to **Tools → Add-ons**
2. Select **AnkiConnect** → Click **Config**
3. Find the `webCorsOriginList` setting
4. Add `"app://obsidian.md"` to the list:

```json
{
    "apiKey": null,
    "apiLogPath": null,
    "webBindAddress": "127.0.0.1",
    "webBindPort": 8765,
    "webCorsOriginList": [
        "http://localhost",
        "app://obsidian.md"
    ]
}
```

5. Click **OK** and restart Anki

**Important:** Without adding `app://obsidian.md` to the CORS list, you'll get CORS errors and syncing will fail.

#### Step 3: Enable in Flashly Settings

1. Open Obsidian Settings → Flashly → Export
2. Toggle **"Enable AnkiConnect"** on
3. (Optional) Change URL if Anki is running on a different port
4. Click **"Test connection"** to verify setup

### Using AnkiConnect

Once configured, you have two ways to sync:

**Method 1: Export Modal**
1. Run command: **"Export flashcards"**
2. Select decks to sync
3. Click **"Sync to Anki"** button (requires Anki running)

**Method 2: Export as CSV**
- Use format "Anki (CSV file)" to export a file
- Import manually into Anki via File → Import

### Features

- **Direct sync**: No CSV files needed
- **Media support**: Automatically uploads images and audio files
- **Duplicate detection**: Skips cards that already exist
- **Deck creation**: Creates decks automatically if they don't exist
- **Progress feedback**: Shows success/failure counts

### Troubleshooting

**CORS Error:**
```
Access to fetch has been blocked by CORS policy
```
**Solution:** Make sure you added `"app://obsidian.md"` to AnkiConnect's `webCorsOriginList` (see Step 2 above)

**Connection Refused:**
```
Failed to connect to AnkiConnect
```
**Solution:**
- Make sure Anki is running
- Verify AnkiConnect add-on is installed
- Check that the URL in settings matches (default: `http://127.0.0.1:8765`)

**Media Upload Fails:**
- Files over 10MB are skipped
- Check that media files exist in your vault
- Verify file paths in your flashcards are correct

## Statistics Dashboard

Track your learning progress with comprehensive statistics:

- **Overview Cards**: Total cards, due today, new cards, review cards
- **Deck Breakdown**: Detailed stats per deck with progress bars
- **Activity Heatmap**: 30-day review activity visualization
- **Card Distribution**: Visual breakdown by learning state
- **Quiz Statistics**: Quiz history and performance metrics

![Statistics Dashboard](screenshots/flashlysd1.png)

![Detailed Statistics](screenshots/flashlysd3.png)

Access via command: **"View Statistics"**

## Roadmap

### Upcoming Features
- Export flashcards to various formats
- AI quiz customization
- Deck and quiz sharing and collaboration
