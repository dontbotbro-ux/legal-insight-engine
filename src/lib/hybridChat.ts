const SYSTEM_PROMPT = `
You are a senior litigation paralegal working on complex commercial matters.
Your priorities are: precision, completeness, conservative legal reasoning, and clear source citations.

You may receive:
- A "document context" containing text extracted from an uploaded PDF (pleadings, orders, contracts, etc.).
- A normal chat history from the user.

WHEN TO USE WHICH KNOWLEDGE

1. If the user's question is about the uploaded document
   (for example: "summarize this brief", "what does section 5 say",
   "who are the parties in this case"):
   - Treat the PDF as the primary source of truth.
   - Ground your answer in the document text.
   - Where appropriate, mention specific page numbers or sections if the user references them
     (for example: "[p. 3]" or "[Section 5.2]").

2. If the user's question is a general question
   (legal or non-legal) and does not depend on the PDF
   (for example: "what is summary judgment", "what is consideration in contract law"):
   - Answer using your general knowledge.
   - You may ignore the document context.

3. If the question relates both to the document and to general legal principles
   (for example: "how do these facts impact a summary judgment motion",
   "what standard applies to this kind of clause in this contract"):
   - Combine the document-specific details with general legal doctrine.
   - First explain the general rule, then apply it to the specific facts or clauses in the PDF.

4. If the user triggers one of the predefined "Quick Actions" (Flag Risks, Case Timeline,
   Opposing Counsel questions, Executive Summary):
   - Interpret the quick action label and any accompanying instructions as the primary task.
   - Use the document context wherever relevant.
   - Format the output in a way a busy attorney can skim quickly (organized headings, bullets).

If the document context is clearly irrelevant to the question, do not force it in.
If the question cannot be answered from the document where it should be,
be explicit about what is and is not supported by the PDF.

OUTPUT STYLE REQUIREMENTS
- Write in a professional legal-work-product style suitable for attorneys and clients.
- Keep formatting clean and restrained.
- Use concise headings and bullet points where useful.
- Avoid decorative markdown.
- Do not output raw markdown syntax for emphasis (for example **bold** markers).
- If a table is useful, provide a properly structured markdown table with clear headers.
`.trim();

export type HybridChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1200;
const MAX_DOC_CONTEXT_CHARS = 8000;
const LOW_TOKEN_MODEL = "llama-3.1-8b-instant";
const LOW_TOKEN_MAX_HISTORY_MESSAGES = 2;
const LOW_TOKEN_MAX_MESSAGE_CHARS = 400;
const LOW_TOKEN_MAX_DOC_CONTEXT_CHARS = 1200;

const normalizeForMatch = (value: string) => value.toLowerCase();

const toKeywords = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4),
    ),
  ).slice(0, 16);

const splitPageBlocks = (pdfText: string): string[] => {
  const blocks = pdfText.split(/(?=\[Page \d+\])/g).map((block) => block.trim()).filter(Boolean);
  return blocks.length ? blocks : [pdfText];
};

const scoreBlock = (block: string, keywords: string[]): number => {
  if (!keywords.length) return 0;
  const normalized = normalizeForMatch(block);
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) score += 1;
  }
  return score;
};

const compactDocumentContext = (pdfText?: string, latestUserPrompt?: string): string | undefined => {
  if (!pdfText?.trim()) return undefined;

  const blocks = splitPageBlocks(pdfText);
  const keywords = toKeywords(latestUserPrompt ?? "");

  const ranked = blocks
    .map((block, idx) => ({ block, idx, score: scoreBlock(block, keywords) }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  const chosen: string[] = [];
  let used = 0;

  for (const item of ranked) {
    if (item.score === 0 && chosen.length >= 2) continue;
    if (used + item.block.length > MAX_DOC_CONTEXT_CHARS) continue;
    chosen.push(item.block);
    used += item.block.length;
    if (used >= MAX_DOC_CONTEXT_CHARS * 0.9) break;
    if (chosen.length >= 6) break;
  }

  if (!chosen.length) {
    return pdfText.slice(0, MAX_DOC_CONTEXT_CHARS);
  }

  return chosen.join("\n\n").slice(0, MAX_DOC_CONTEXT_CHARS);
};

const compactHistory = (history: HybridChatMessage[]): HybridChatMessage[] =>
  history.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content.slice(0, MAX_MESSAGE_CHARS),
  }));

const compactHistoryForLowTokenRetry = (history: HybridChatMessage[]): HybridChatMessage[] =>
  history.slice(-LOW_TOKEN_MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content.slice(0, LOW_TOKEN_MAX_MESSAGE_CHARS),
  }));

const buildPayload = (args: {
  model: string;
  history: HybridChatMessage[];
  docContext?: string;
  maxTokens?: number;
}) => ({
  model: args.model,
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    ...(args.docContext
      ? [
          {
            role: "system" as const,
            content: `DOCUMENT CONTEXT (relevant excerpts extracted from the user's PDF):\n\n${args.docContext}`,
          },
        ]
      : []),
    ...args.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ],
  temperature: 0.2,
  ...(typeof args.maxTokens === "number" ? { max_tokens: args.maxTokens } : {}),
});

const parseLimitNumbers = (message: string): { limit?: number; used?: number } => {
  const limitMatch = message.match(/Limit\s+(\d+)/i);
  const usedMatch = message.match(/Used\s+(\d+)/i);
  return {
    limit: limitMatch ? Number(limitMatch[1]) : undefined,
    used: usedMatch ? Number(usedMatch[1]) : undefined,
  };
};

const parseRetryAfter = (message: string): string | null => {
  const retryMatch = message.match(/Please try again in\s+([^.]+(?:\.\d+)?s)/i);
  return retryMatch?.[1] ?? null;
};

export async function getHybridAnswer(params: {
  history: HybridChatMessage[];
  pdfText?: string;
}): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    return "The AI backend is not configured (missing Groq/OpenAI API key).";
  }

  const compactedHistory = compactHistory(params.history);
  const latestUserPrompt = [...compactedHistory].reverse().find((message) => message.role === "user")?.content;
  const docContext = compactDocumentContext(params.pdfText, latestUserPrompt);

  const payload = buildPayload({
    model: "llama-3.3-70b-versatile",
    history: compactedHistory,
    docContext,
  });

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let details = "";
      let detailMessage = "";
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        if (errJson?.error?.message) {
          detailMessage = errJson.error.message;
          details = ` (${detailMessage})`;
        }
      } catch {
        // ignore JSON parse errors
      }

      if (res.status === 413) {
        return "Your request is too large for the current model limits. Please ask a narrower question.";
      }

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(detailMessage);
        const { limit, used } = parseLimitNumbers(detailMessage);
        const remaining = typeof limit === "number" && typeof used === "number" ? limit - used : undefined;

        if (typeof remaining === "number" && remaining > 120) {
          const lowTokenHistory = compactHistoryForLowTokenRetry(params.history);
          const lowTokenPrompt = [...lowTokenHistory].reverse().find((message) => message.role === "user")?.content;
          const lowTokenContext = compactDocumentContext(params.pdfText, lowTokenPrompt)?.slice(
            0,
            LOW_TOKEN_MAX_DOC_CONTEXT_CHARS,
          );
          const lowTokenPayload = buildPayload({
            model: LOW_TOKEN_MODEL,
            history: lowTokenHistory,
            docContext: lowTokenContext,
            maxTokens: Math.max(96, Math.min(256, remaining - 60)),
          });

          const retry = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(lowTokenPayload),
          });

          if (retry.ok) {
            const retryData = (await retry.json()) as { choices: { message?: { content?: string } }[] };
            const retryContent = retryData.choices[0]?.message?.content?.trim();
            if (retryContent) return retryContent;
          }
        }

        return retryAfter
          ? `Daily AI quota reached. Please try again in ${retryAfter}. You can also reduce prompt size or upgrade the Groq billing tier.`
          : "Daily AI quota reached. Please wait for reset, reduce prompt size, or upgrade the Groq billing tier.";
      }

      return `The AI service returned an error (status ${res.status}${details}).`;
    }

    const data = (await res.json()) as { choices: { message?: { content?: string } }[] };
    const content = data.choices[0]?.message?.content?.trim();
    if (!content) {
      return "I couldn't generate a useful answer. Please try rephrasing your question.";
    }

    return content;
  } catch {
    return "I couldn't reach the AI service (network error). Please check your connection and try again.";
  }
}
