# Welcome to LawerBot

## Project info

**URL**: https://legal-insight-engine-main.vercel.app

architecture-beta
    group user_layer[User Experience]
    service client[React Web App] in user_layer
    
    group logic_layer[Orchestration & Reasoning]
    service llm_primary(cloud)[Groq Llama 3.3] in logic_layer
    service llm_fallback(cloud)[OpenAI GPT-5.3] in logic_layer
    service router[Circuit Breaker / Router] in logic_layer
    
    group data_layer[MCP Legal Engine]
    service mcp_server(server)[FastMCP Python Server] in data_layer
    service database(database)[intelligence.json] in data_layer

    client:R -- L:router
    router:T -- B:llm_primary
    router:B -- T:llm_fallback
    router:R -- L:mcp_server
    mcp_server:R -- L:database

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
