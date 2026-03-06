import { useEffect, useState } from "react";

type SystemHealth = {
  status: "Online" | "Offline" | "Degraded";
  latency_ms: {
    mcp_localhost_6274: number | null;
    groq_api: number | null;
  };
  active_provider: "Groq" | "OpenAI Fallback" | "Unavailable";
  remediation_step: string;
};

const POLL_INTERVAL_MS = 15000;

const SystemStatusIndicator = () => {
  const [health, setHealth] = useState<SystemHealth>({
    status: "Degraded",
    latency_ms: { mcp_localhost_6274: null, groq_api: null },
    active_provider: "Unavailable",
    remediation_step: "Connectivity check in progress.",
  });

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;

    const probe = async (url: string, init?: RequestInit): Promise<{ ok: boolean; latency: number | null }> => {
      const started = performance.now();
      try {
        await fetch(url, init);
        const latency = Math.round((performance.now() - started) * 1000) / 1000;
        return { ok: true, latency };
      } catch {
        const latency = Math.round((performance.now() - started) * 1000) / 1000;
        return { ok: false, latency };
      }
    };

    const checkHealth = async () => {
      const mcp = await probe("http://localhost:6274", { mode: "no-cors", cache: "no-store" });

      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
      let groq = { ok: false, latency: null as number | null };
      if (groqApiKey) {
        groq = await probe("https://api.groq.com/openai/v1/models", {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${groqApiKey}` },
        });
      }

      let next: SystemHealth = {
        status: "Online",
        latency_ms: {
          mcp_localhost_6274: mcp.latency,
          groq_api: groq.latency,
        },
        active_provider: "Groq",
        remediation_step: "All services are responsive.",
      };

      if (!mcp.ok) {
        next = {
          ...next,
          status: "Offline",
          active_provider: groq.ok ? "Groq" : "OpenAI Fallback",
          remediation_step:
            "CRITICAL_FAILURE: MCP is unreachable. Start/restart FastMCP on localhost:6274 and enable local JSON_FALLBACK until recovery.",
        };
      } else if (!groqApiKey) {
        next = {
          ...next,
          status: "Degraded",
          active_provider: "OpenAI Fallback",
          remediation_step: "Groq API key is missing. Configure VITE_GROQ_API_KEY or route to OpenAI fallback.",
        };
      } else if (!groq.ok) {
        next = {
          ...next,
          status: "Degraded",
          active_provider: "OpenAI Fallback",
          remediation_step: "Groq endpoint unavailable. Route reasoning traffic to OpenAI fallback.",
        };
      } else if ((groq.latency ?? 0) > 1500) {
        next = {
          ...next,
          status: "Degraded",
          active_provider: "Groq",
          remediation_step:
            "DEGRADED_PERFORMANCE: Groq latency exceeds 1500ms. Prefer OpenAI fallback until latency normalizes.",
        };
      }

      if (!mounted) return;
      setHealth(next);
    };

    void checkHealth();
    timer = window.setInterval(() => {
      void checkHealth();
    }, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  const indicatorClass =
    health.status === "Online"
      ? "bg-emerald-500 border-emerald-200/70"
      : health.status === "Degraded"
        ? "bg-amber-500 border-amber-200/70"
        : "bg-red-500 border-red-200/70";

  return (
    <div className="fixed left-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50">
      <div className="group relative">
        <div
          className={`h-3.5 w-3.5 rounded-full border shadow-sm ${indicatorClass}`}
          aria-label={`System status: ${health.status}`}
        />
        <div className="pointer-events-none absolute bottom-6 left-0 hidden min-w-64 rounded-md border border-border bg-card/95 px-2 py-1.5 text-[11px] text-foreground shadow-md group-hover:block">
          <p className="font-medium">System {health.status}</p>
          <p className="text-muted-foreground">Provider: {health.active_provider}</p>
          <p className="text-muted-foreground">
            MCP: {health.latency_ms.mcp_localhost_6274 ?? "n/a"} ms · Groq: {health.latency_ms.groq_api ?? "n/a"} ms
          </p>
          <p className="mt-1 text-muted-foreground">{health.remediation_step}</p>
        </div>
      </div>
    </div>
  );
};

export default SystemStatusIndicator;
