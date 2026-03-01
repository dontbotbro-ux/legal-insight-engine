# Welcome to LawyerBot

## Project info

URL: https://legal-insight-engine-main.vercel.app

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

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
```

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
