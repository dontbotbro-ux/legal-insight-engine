import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Scale, Search, Trash2, FileDown, MessageSquareText, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import {
  deleteMatter,
  getMatter,
  listMatters,
  type MatterSummary,
  type StoredChatMessage,
} from "@/lib/matterRepository";

type MatterDetail = {
  id: string;
  fileName: string;
  pdfBlob: Blob;
  messages: StoredChatMessage[];
  updatedAt: number;
  createdAt: number;
};

const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const Repository = () => {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<MatterSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatterDetail | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) {
      setItems([]);
      setSelected(null);
      return;
    }
    setLoading(true);
    try {
      const matters = await listMatters(user.sub);
      setItems(matters);
      if (!selectedId && matters.length) {
        setSelectedId(matters[0].id);
      }
      setError(null);
    } catch {
      setError("Could not load local repository.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [user?.sub]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    if (!user) return;
    void (async () => {
      try {
        const matter = await getMatter(selectedId, user.sub);
        if (!matter) {
          setSelected(null);
          return;
        }
        setSelected({
          id: matter.id,
          fileName: matter.fileName,
          pdfBlob: matter.pdfBlob,
          messages: matter.messages,
          updatedAt: matter.updatedAt,
          createdAt: matter.createdAt,
        });
      } catch {
        setError("Could not load selected matter.");
      }
    })();
  }, [selectedId, user?.sub]);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const base = normalized
      ? items.filter((item) => item.fileName.toLowerCase().includes(normalized))
      : items;
    return [...base].sort((a, b) => {
      if (sortBy === "name") return a.fileName.localeCompare(b.fileName);
      return b.updatedAt - a.updatedAt;
    });
  }, [items, query, sortBy]);

  const totals = useMemo(() => {
    const messages = items.reduce((sum, item) => sum + item.messageCount, 0);
    const size = items.reduce((sum, item) => sum + item.fileSize, 0);
    return { matters: items.length, messages, size };
  }, [items]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await deleteMatter(id, user.sub);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch {
      setError("Could not delete matter.");
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selected) return;
    const url = URL.createObjectURL(selected.pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selected.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTranscript = async () => {
    if (!selected) return;
    const children: Paragraph[] = [
      new Paragraph({ text: "Matter Transcript", heading: HeadingLevel.TITLE }),
      new Paragraph({
        children: [
          new TextRun({ text: "Document: ", bold: true }),
          new TextRun({ text: selected.fileName }),
        ],
      }),
      new Paragraph({ text: "" }),
    ];

    selected.messages.forEach((m) => {
      const speaker = m.role === "user" ? "Attorney" : "Senior Paralegal";
      children.push(new Paragraph({ text: speaker, heading: HeadingLevel.HEADING_2 }));
      m.content.split(/\n+/).forEach((line) => {
        children.push(new Paragraph({ text: line.trim() || " " }));
      });
    });

    const doc = new Document({
      sections: [{ children }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.fileName.replace(/\.[^.]+$/, "")}-transcript.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleGenerateClaim = async () => {
    if (!selected) return;
    setClaimLoading(true);
    setClaimStatus(null);

    try {
      const response = await fetch("http://localhost:5000/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; claim_file?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Claim generation failed (${response.status})`);
      }

      setClaimStatus(`Statement of Claim generated: ${payload.claim_file ?? "saved in matters/claims"}`);
    } catch (err) {
      setClaimStatus(err instanceof Error ? err.message : "Could not generate Statement of Claim.");
    } finally {
      setClaimLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="h-14 border-b border-border bg-card px-4">
        <div className="h-full flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gold" />
            <span className="font-serif text-lg font-bold text-foreground">LawyerBot</span>
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-foreground font-medium">History</span>
        </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex items-center gap-2 w-max ml-auto pr-1">
          <Link to="/">
            <Button variant="outline" size="sm">Home</Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="outline" size="sm">Dashboard</Button>
          </Link>
          {!user && <GoogleSignInButton compact />}
          {user && (
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          )}
                    </div>
          </div>
        </div>
      </header>

      <div className="container py-6 space-y-4">
        {!user && (
          <Card className="p-6 border-border/70">
            <p className="text-sm text-muted-foreground">
              Sign in with Google to view and manage your matter repository history.
            </p>
          </Card>
        )}
        {user && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MetricCard label="Saved Matters" value={String(totals.matters)} />
              <MetricCard label="Total Messages" value={String(totals.messages)} />
              <MetricCard label="Stored PDFs" value={formatBytes(totals.size)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-4">
              <Card className="p-3 border-border/70">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  className="pl-8"
                  placeholder="Search by file name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortBy((prev) => (prev === "recent" ? "name" : "recent"))}
              >
                {sortBy === "recent" ? "Recent" : "A-Z"}
              </Button>
            </div>

            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
              {error && <p className="text-xs text-red-600">{error}</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-muted-foreground">No saved matters yet.</p>
              )}
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selectedId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{item.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.messageCount} msgs · {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
              </Card>

              <Card className="p-4 border-border/70">
            {!selected && <p className="text-sm text-muted-foreground">Select a matter to review its history.</p>}

            {selected && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-foreground">{selected.fileName}</h2>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(selected.createdAt).toLocaleString()} · Updated{" "}
                      {new Date(selected.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/dashboard?matter=${selected.id}`}>
                      <Button size="sm">Open in Dashboard</Button>
                    </Link>
                    <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
                      <FileDown className="h-4 w-4 mr-1" />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleDownloadTranscript()}>
                      <FileDown className="h-4 w-4 mr-1" />
                      Transcript
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleGenerateClaim()} disabled={claimLoading}>
                      <FileText className="h-4 w-4 mr-1" />
                      {claimLoading ? "Generating..." : "Generate Claim"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDelete(selected.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>

                {claimStatus && (
                  <p className="text-xs text-muted-foreground border border-border rounded-md p-2 bg-muted/40">{claimStatus}</p>
                )}

                <Separator />

                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" />
                    Chat History ({selected.messages.length})
                  </h3>
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                    {selected.messages.length === 0 && (
                      <p className="text-xs text-muted-foreground">No chat messages saved for this matter yet.</p>
                    )}
                    {selected.messages.map((m, idx) => (
                      <div key={`${m.role}-${idx}`} className="rounded-md border border-border bg-card p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                          {m.role === "user" ? "Attorney" : "Senior Paralegal"}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <Card className="p-4 border-border/70">
    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    <p className="text-2xl font-serif font-bold text-foreground mt-1">{value}</p>
  </Card>
);

export default Repository;
