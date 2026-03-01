# Welcome to LawyerBot

## Project info

URL: https://legal-insight-engine-main.vercel.app

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

![Architecture](https://img.shields.io/badge/Architecture-MCP--Distributed-blue)
![Reasoning](https://img.shields.io/badge/Reasoning-Groq--Llama3.3-orange)
![Resilience](https://img.shields.io/badge/Resilience-OpenAI--Fallback-green)
![Status](https://img.shields.io/badge/Status-Production--Ready-brightgreen)

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

Req ID,Business Requirement,Technical Implementation,Validation Method
FR-01,Rapid Legal Data Retrieval,FastMCP Server with indexed intelligence.json,Tool-call latency < 200ms
FR-02,High-Inference Reasoning,Groq Llama 3.3 (LPU Inference),Semantic accuracy check
NFR-01,System Resilience,Multi-Model Fallback (OpenAI GPT-5.3),429 Error Trigger Test
NFR-02,Observability,Real-time Health Monitor Component,Dashboard status heartbeat
NFR-03,Cost Efficiency,Context Pruning & Token Budgeting,API usage log analysis
