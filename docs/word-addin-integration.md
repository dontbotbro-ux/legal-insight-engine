# Microsoft Word Drafting-Sync Integration Plan

## Scope
- Host an Office.js Word task pane add-in that connects to the repository-backed matter data.
- Expose drag/insert blocks for:
  - Key Parties
  - Key Dates
  - Governing Law
  - Risk Alerts
- Add citation verification hook for third-party citator APIs (Shepardizing/KeyCite equivalent).

## Recommended Architecture
1. Word add-in task pane (React + Office.js) as a separate package.
2. Shared matter service module that reads saved matter metadata and transcript.
3. Citation verification adapter layer:
   - `verifyCitation(citationText) -> {status, treatment, checkedAt}`
   - Backed by licensed legal-research provider API.

## MVP Endpoints / Interfaces
- `GET /matters`
- `GET /matters/:id`
- `POST /draft/insert` (for reusable block templates)
- `POST /citations/verify`

## Compliance Notes
- Verify user consent and data residency requirements before syncing document content.
- Do not claim "still good law" verification unless backed by a licensed citator feed.
