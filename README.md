# HN Sentiment

Sentiment analysis tool for Hacker News threads. Analyze comment sentiment, extract keywords, and visualize discussion patterns.

**Live:** [hnsentiment.experimentarea.com](https://hnsentiment.experimentarea.com)

## Features

- **Sentiment Classification**: Categorizes each comment as promoter, neutral, or detractor relative to a customizable question
- **Comment Summaries**: AI-generated one-line summaries of each comment
- **Keyword Extraction**: Up to 5 key phrases per comment for pattern analysis
- **Tree Visualization**: File-tree style view with color-coded sentiment, keyboard navigation
- **Threaded View**: HN-style nested comments with inline analysis
- **Keyword Analysis**: Sortable table of keywords by sentiment breakdown
- **Export/Import**: Save and share analyses as JSON

## Usage

1. Paste an HN URL or post ID (e.g., `41780712` or `https://news.ycombinator.com/item?id=41780712`)
2. Optionally adjust the sentiment question (auto-generated from the post title)
3. Enter your [OpenRouter API key](https://openrouter.ai/keys)
4. Select a model and run analysis

No API key? Click "Load Example" to explore the UI with pre-analyzed data.

## Models

Supports any OpenRouter model. Preset options:

- `anthropic/claude-haiku-4.5` - Fast, affordable
- `anthropic/claude-sonnet-4.5` - Balanced
- `deepseek/deepseek-v3.2` - Budget option
- `google/gemini-3-flash-preview` - Very cheap
- `openai/gpt-5-mini` - Default
- `openai/gpt-5.2` - High quality
- `x-ai/grok-4.1-fast` - Fast alternative

## Development

```bash
npm install
npm run dev
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run check` | Type check |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |

### Tech Stack

- [SvelteKit](https://kit.svelte.dev/) with Svelte 5
- [Tailwind CSS](https://tailwindcss.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/) adapter
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) for IndexedDB

## JSON Schema

Analyses export as JSON with the following structure:

```typescript
interface AnalysisExport {
  version: string;           // Schema version (currently "1.0")
  hnPostId: number;
  hnPostUrl: string;
  title: string;
  sentimentQuestion: string;
  model: string;
  analyzedAt: string;        // ISO 8601
  post: HNPost;
  comments: Comment[];
}

interface Comment {
  id: number;
  parentId: number | null;
  author: string;
  time: number;              // Unix timestamp
  text: string;
  deleted?: boolean;
  dead?: boolean;
  children: Comment[];
  analysis?: {
    sentiment: "promoter" | "neutral" | "detractor";
    summary: string;
    keywords: string[];
  };
}
```

## License

MIT
