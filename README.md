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

### 📋 Requirements Traceability Matrix (RTM)

| ID | Category | Requirement | Technical Implementation | Status |
| :--- | :--- | :--- | :--- | :---: |
| **REQ-01** | **Core** | Rapid Legal Data Retrieval | `FastMCP Server` + `intelligence.json` | ✅ |
| **REQ-02** | **Logic** | High-Inference Reasoning | `Groq Llama-3.3` (LPU Inference) | ✅ |
| **REQ-03** | **Resilience** | API Failover Protection | `OpenAI GPT-5.3` Circuit Breaker | 🛡️ |
| **REQ-04** | **UX** | Real-time Observability | `System Health Monitor` Component | 📡 |
| **REQ-05** | **Business** | Token Cost Optimization | Context Pruning & Prompt Engineering | 💰 |
