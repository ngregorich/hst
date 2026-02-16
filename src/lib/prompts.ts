export const DEFAULT_QUESTION_PROMPT_TEMPLATE = `Given this Hacker News post title and context, generate a clear statement that commenters might agree or disagree with. The statement should capture the main claim or topic being discussed.

Title: {{title}}
{{body_section}}{{url_section}}{{top_comments_section}}

Respond with ONLY the statement, no quotes, no explanation. Make it a declarative statement that can be evaluated as agree/disagree.

Examples of good statements:
- "Remote work is more productive than office work"
- "This new JavaScript framework solves real problems"
- "The author's approach to database design is sound"`;

export const DEFAULT_ANALYSIS_PROMPT_TEMPLATE = `Analyze this Hacker News comment for sentiment regarding: "{{sentiment_question}}"

Comment:
"""
{{comment_text}}
"""

Respond with JSON only, no markdown:
{
  "sentiment": "promoter" | "neutral" | "detractor",
  "npsScore": 0-10 integer,
  "summary": "1-2 sentence summary of the comment's main point",
  "keywords": []
}

Guidelines:
- sentiment: promoter (agrees/supports), neutral (neither/off-topic), detractor (disagrees/opposes)
- npsScore: integer 0-10 reflecting sentiment intensity about the statement
  - 9-10 = promoter, 7-8 = neutral, 0-6 = detractor
- summary: Brief factual summary of the main point
- keywords: 0-5 unique key phrases that provide insight into the commenter's perspective. Only include meaningful phrases, not generic words.`;

export const DEFAULT_THREAD_SUMMARY_PROMPT_TEMPLATE = `Write a concise top-level summary of Hacker News thread sentiment.

Sentiment question:
{{sentiment_question}}

Analysis stats:
- analyzed: {{analyzed_count}} of {{analyzable_count}} analyzable comments
- nps-style score: {{nps_score}} (promoters {{promoters}}, neutral {{neutrals}}, detractors {{detractors}})
- top keyword phrases: {{top_keywords}}

Requirements:
- 2-4 sentences
- capture overall stance and uncertainty/divergence
- mention 2-4 major themes from keywords
- do not invent details not supported by the data
- plain text only`;

export function renderPromptTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key: string) => values[key] ?? '');
}
