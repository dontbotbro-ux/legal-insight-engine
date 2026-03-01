# Welcome to LawerBot

## Project info

**URL**: https://legal-insight-engine-main.vercel.app

```mermaid
flowchart TD
    subgraph User_Interface [Frontend Layer]
        A[Next.js Web App]
    end

    subgraph Logic_Orchestration [Intelligence Layer]
        B{Request Router}
        C[Groq Llama 3.3]
        D[OpenAI Fallback]
    end

    subgraph Data_Protocol [MCP Backend]
        E[FastMCP Python Server]
        F[(intelligence.json)]
    end

    %% Connections
    A -->|User Query| B
    B -->|Primary| C
    B -.->|429 Rate Limit Fallback| D
    C & D -->|JSON Tool Call| E
    E -->|Read/Parse| F
    F -->|Legal Context| E
    E -->|Structured Data| A

    %% Styling
    style B fill:#f96,stroke:#333,stroke-width:2px
    style E fill:#69f,stroke:#333,stroke-width:2px
    style F fill:#9f6,stroke:#333,stroke-width:2px

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
