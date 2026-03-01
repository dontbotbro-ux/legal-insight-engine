# Welcome to LawerBot

## Project info

**URL**: https://legal-insight-engine-main.vercel.app



```mermaid
flowchart TD
    %% Define Nodes
    subgraph User_Layer [User Experience]
        A[Next.js Web App]
    end

    subgraph Logic_Layer [Intelligence & Reasoning]
        B{Router}
        C[Groq Llama 3.3]
        D[OpenAI Fallback]
    end

    subgraph Data_Layer [MCP Legal Backend]
        E[FastMCP Server]
        F[(intelligence.json)]
    end

    %% Define Flow
    A --> B
    B --> C
    B -.-> D
    C & D --> E
    E --> F
    F --> E
    E --> A

    %% Define Styles
    classDef router fill:#f96,stroke:#333,stroke-width:2px
    classDef server fill:#69f,stroke:#333,stroke-width:2px
    classDef data fill:#9f6,stroke:#333,stroke-width:2px

    class B router
    class E server
    class F data

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
