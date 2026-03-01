# Welcome to LawerBot

## Project info

**URL**: https://legal-insight-engine-main.vercel.app

```mermaid
flowchart TD
    %% Layers
    subgraph UI [Frontend]
        A[Next.js App]
    end

    subgraph Logic [Intelligence]
        B{Router}
        C[Groq Llama 3.3]
        D[OpenAI Fallback]
    end

    subgraph Data [Legal Backend]
        E[FastMCP Server]
        F[(intelligence.json)]
    end

    %% Flow
    A --> B
    B --> C
    B -.-> D
    C & D --> E
    E --> F
    F --> E
    E --> A

    %% Styles
    classDef orange fill:#f96,stroke:#333,stroke-width:2px
    classDef blue fill:#69f,stroke:#333,stroke-width:2px
    classDef green fill:#9f6,stroke:#333,stroke-width:2px

    class B orange
    class E blue
    class F green

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
