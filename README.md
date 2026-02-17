# HN Sentiment Tool (HST)

Sentiment analysis tool for Hacker News threads. Analyze comment sentiment, extract keywords, and visualize discussion patterns.

**Live:** [hst.experimentarea.com](https://hst.experimentarea.com)

## Features

- **Sentiment Classification**: Categorizes each comment as promoter, neutral, or detractor relative to a customizable question
- **Comment Summaries**: AI-generated one-line summaries of each comment
- **Keyword Extraction**: Up to 5 key phrases per comment for pattern analysis
- **Tree Visualization**: File-tree style view with color-coded sentiment, keyboard navigation
- **Threaded View**: HN-style nested comments with inline analysis
- **Keyword Analysis**: Sortable table of keywords by sentiment breakdown
- **Import / Export**: Save and share analyses as JSON

## Usage

1. Paste Hacker News URL / post id
2. Load thread data
3. Enter your [OpenRouter API key](https://openrouter.ai/keys)
4. Select LLM model
5. Fine tune sentiment question
6. Run analysis

To auto-load an exported analysis at startup, place it at `static/examples/startup-analysis.json` before building / deploying.

## Models

Supports any OpenRouter model. Preset options:

- `anthropic/claude-haiku-4.5` (default)
- `anthropic/claude-sonnet-4.5`
- `deepseek/deepseek-v3.2`
- `google/gemini-3-flash-preview`
- `openai/gpt-5-mini`
- `openai/gpt-5.2`
- `x-ai/grok-4.1-fast`

## Development

```bash
npm install
npm run dev
```

## Deploy to Cloudflare Pages (Static)

1. Connect this repository in Cloudflare Pages
2. Set build command to `npm run build`
3. Set build output directory to `build`
4. Use framework preset `None` (static site)
5. Optional startup data: commit your exported JSON to `static/examples/startup-analysis.json`

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
- [Cloudflare Pages](https://pages.cloudflare.com/) static hosting
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

## Contributors

- Claude Opus 4.5
- ChatGPT Codex 5.3
