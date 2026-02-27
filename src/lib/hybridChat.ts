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
`.trim();

export type HybridChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function getHybridAnswer(params: {
  history: HybridChatMessage[];
  pdfText?: string;
}): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    return "The AI backend is not configured (missing Groq/OpenAI API key).";
  }

  const payload = {
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...(params.pdfText
        ? [
            {
              role: "system" as const,
              content: `DOCUMENT CONTEXT (verbatim text extracted from the user's PDF):\n\n${params.pdfText}`,
            },
          ]
        : []),
      ...params.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
    temperature: 0.2,
  };

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
      try {
        const errJson = (await res.json()) as { error?: { message?: string; type?: string } };
        if (errJson?.error?.message) {
          details = ` (${errJson.error.message})`;
        }
      } catch {
        // ignore JSON parse errors, fall back to status text
      }

      return `The AI service returned an error (status ${res.status}${details}).`;
    }

    const data = (await res.json()) as {
      choices: { message?: { content?: string } }[];
    };

    const content = data.choices[0]?.message?.content?.trim();
    if (!content) {
      return "I couldn't generate a useful answer. Please try rephrasing your question.";
    }

    return content;
  } catch (err) {
    return "I couldn't reach the AI service (network error). Please check your connection and try again.";
  }
}

