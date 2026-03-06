# Legal-Insight-Engine Engineering Rules

## 1. Feature: Doc-to-Doc Transformation
- When converting transcripts to claims, always extract: Names, Dates, Specific Allegations, and Statutory References.
- Use a 'Comparison Table' format for redlining so lawyers can see the AI's changes side-by-side.

## 2. Feature: Litigation Analytics
- When analyzing judge patterns, prioritize 'Motion Grant Rates' and 'Typical Time to Trial'.
- All 'Win-Rate' forecasts must include a 'Confidence Score' and a disclaimer that the AI is not providing legal advice.

## 3. Feature: Real-Time Drafting Co-Pilot
- Implement 'Market-Standard Benchmarking' by comparing local drafts against the `benchmarks/` folder in the project.
- Suggest 'Softer' or 'More Aggressive' language based on a user-defined 'Negotiation Mode' variable.

## 4. Technical Guardrails
- Local Gateway: All AI completions must route through the OpenClaw proxy at http://127.0.0.1:18789.
- Telegram Integration: Use the `/proxy/telegram` endpoint for client alerts and intake notifications.