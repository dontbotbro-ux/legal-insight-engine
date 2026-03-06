# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a49f2816-0099-4b59-a98b-5a26643af348

```mermaid
flowchart TD
    subgraph UI [Frontend Layer]
        A[Next.js Web App]
    end

    subgraph Logic [Intelligence Layer]
        B{Router}
        C[Groq Llama 3.3]
        D[OpenAI Fallback]
    end

    subgraph Data [Legal Engine]
        E[FastMCP Server]
        F[(intelligence.json)]
    end

    A --> B
    B -->|Primary| C
    B -.->|Fallback| D
    C & D --> E
    E --> F
    F --> E
    E --> A

    classDef orange fill:#f96,stroke:#333,stroke-width:2px;
    classDef blue fill:#69f,stroke:#333,stroke-width:2px;
    classDef green fill:#9f6,stroke:#333,stroke-width:2px;

    class B orange;
    class E blue;
    class F green;

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Supabase schema (Legal Intelligence Engine)

Migration added:

- `supabase/migrations/202603010001_legal_intelligence_engine.sql`

Apply with Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or run directly in SQL editor (Supabase Dashboard) using the migration file contents.
