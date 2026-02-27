import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Scale,
  Upload,
  FileText,
  Send,
  Users,
  Calendar,
  MapPin,
  PanelLeftClose,
  PanelLeft,
  Landmark,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { pdfjsLib } from "@/pdf";
import { getHybridAnswer, type HybridChatMessage } from "@/lib/hybridChat";

type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  page: number;
};

type LegalEntity = {
  id: string;
  name: string;
  page: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type InsightMetrics = {
  governingLaw: string | null;
  keyParties: string | null;
  terminationNotice: string | null;
  liabilityCap: string | null;
};

const Dashboard = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [people, setPeople] = useState<LegalEntity[]>([]);
  const [courts, setCourts] = useState<LegalEntity[]>([]);
  const [dates, setDates] = useState<LegalEntity[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [docText, setDocText] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answering, setAnswering] = useState(false);
  const [metrics, setMetrics] = useState<InsightMetrics>({
    governingLaw: null,
    keyParties: null,
    terminationNotice: null,
    liabilityCap: null,
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") {
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") {
      setFile(selected);
    }
  };

  // When a new PDF is loaded, generate a blob URL and kick off extraction.
  useEffect(() => {
    if (!file) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(null);
      setActivePage(null);
      setTimeline([]);
      setPeople([]);
      setCourts([]);
      setDates([]);
      setExtractError(null);
      setDocText("");
      setMessages([]);
      setMetrics({
        governingLaw: null,
        keyParties: null,
        terminationNotice: null,
        liabilityCap: null,
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    setActivePage(1);
    setExtractError(null);
    setExtracting(true);

    const extract = async () => {
      try {
        const buffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;

        const newTimeline: TimelineEvent[] = [];
        const peopleSet = new Map<string, LegalEntity>();
        const courtSet = new Map<string, LegalEntity>();
        const dateSet = new Map<string, LegalEntity>();

        const dateRegexLong =
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/gi;
        const dateRegexShort = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
        const captionRegex = /([A-Z][A-Za-z.&\s]+?)\s+v\.?\s+([A-Z][A-Za-z.&\s]+?)(?=,|\n|$)/;
        const courtRegex = /\b(Supreme Court|Court of Appeals|District Court|High Court|Appellate Division|Tribunal)\b/gi;

        let combinedText = "";

        const numPages = pdf.numPages;
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(" ");

          combinedText += text + "\n\n";

          // Case caption (people)
          const captionMatch = text.match(captionRegex);
          if (captionMatch) {
            const partyA = captionMatch[1].trim();
            const partyB = captionMatch[2].trim();
            [partyA, partyB].forEach((p) => {
              const key = `${p}|${pageNum}`;
              if (!peopleSet.has(key)) {
                peopleSet.set(key, {
                  id: `person-${peopleSet.size + 1}`,
                  name: p,
                  page: pageNum,
                });
              }
            });
          }

          // Courts
          let courtMatch: RegExpExecArray | null;
          while ((courtMatch = courtRegex.exec(text)) !== null) {
            const courtName = courtMatch[1].trim();
            const key = `${courtName}|${pageNum}`;
            if (!courtSet.has(key)) {
              courtSet.set(key, {
                id: `court-${courtSet.size + 1}`,
                name: courtName,
                page: pageNum,
              });
            }
          }

          // Dates (for both timeline + entities)
          const allDates = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = dateRegexLong.exec(text)) !== null) {
            allDates.add(m[0]);
          }
          while ((m = dateRegexShort.exec(text)) !== null) {
            allDates.add(m[0]);
          }

          if (allDates.size > 0) {
            const pageSnippet = text.slice(0, 240);
            for (const d of allDates) {
              const key = `${d}|${pageNum}`;
              if (!dateSet.has(key)) {
                dateSet.set(key, {
                  id: `date-${dateSet.size + 1}`,
                  name: d,
                  page: pageNum,
                });
              }
              newTimeline.push({
                id: `event-${newTimeline.length + 1}`,
                date: d,
                label: pageSnippet.trim().replace(/\s+/g, " ") || "Referenced in document",
                page: pageNum,
              });
            }
          }
        }

        // Sort timeline by page then date string (best-effort chronological)
        newTimeline.sort((a, b) => {
          if (a.page !== b.page) return a.page - b.page;
          return a.date.localeCompare(b.date);
        });

        setTimeline(newTimeline);
        setPeople(Array.from(peopleSet.values()));
        setCourts(Array.from(courtSet.values()));
        setDates(Array.from(dateSet.values()));
        setDocText(combinedText);
      } catch (err) {
        console.error(err);
        setExtractError("We couldn't analyze this PDF. Please try another file.");
      } finally {
        setExtracting(false);
      }
    };

    void extract();

    return () => {
      loadingTaskCleanup();
    };

    function loadingTaskCleanup() {
      // Nothing to cancel explicitly here because pdf.js handles it internally,
      // but we keep this hook in case we add cancellation later.
    }
  }, [file]);

  // Derive key insight metrics from the extracted text + entities.
  useEffect(() => {
    if (!docText) {
      setMetrics({
        governingLaw: null,
        keyParties: null,
        terminationNotice: null,
        liabilityCap: null,
      });
      return;
    }

    const text = docText.replace(/\s+/g, " ");

    // Governing law
    let governingLaw: string | null = null;
    const lawMatch =
      text.match(/governed by the laws of\s+([A-Za-z\s]+?)(?:,|\.)/i) ??
      text.match(/governing law[:\s]+([A-Za-z\s]+?)(?:,|\.)/i);
    if (lawMatch) {
      governingLaw = lawMatch[1].trim();
    }

    // Key parties from extracted people
    let keyParties: string | null = null;
    if (people.length > 0) {
      const uniqueNames = Array.from(new Set(people.map((p) => p.name)));
      keyParties = uniqueNames.slice(0, 4).join(" · ");
    }

    // Termination notice
    let terminationNotice: string | null = null;
    const termMatch = text.match(
      /(at least\s+)?(\d+)\s+(day|days|month|months)\s+(?:prior to|before)\s+(?:termination|ending)/i,
    );
    if (termMatch) {
      terminationNotice = `${termMatch[2]} ${termMatch[3]}`;
    }

    // Liability cap
    let liabilityCap: string | null = null;
    const capMatch =
      text.match(/liability (?:shall )?not exceed\s+([\$€£]?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/cap on (?:the )?liability\s+of\s+([\$€£]?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/liability cap[:\s]+([\$€£]?[0-9,\.]+\s*(?:million|thousand)?)/i);
    if (capMatch) {
      liabilityCap = capMatch[1].trim();
    }

    setMetrics({
      governingLaw,
      keyParties,
      terminationNotice,
      liabilityCap,
    });
  }, [docText, people]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `m-${Date.now()}-u`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");

    void (async () => {
      setAnswering(true);
      try {
        const historyForModel: HybridChatMessage[] = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const answer = await getHybridAnswer({
          history: historyForModel,
          pdfText: docText || undefined,
        });

        const assistant: ChatMessage = {
          id: `m-${Date.now()}-a`,
          role: "assistant",
          content: answer,
        };
        setMessages((prev) => [...prev, assistant]);
      } catch (err) {
        const assistant: ChatMessage = {
          id: `m-${Date.now()}-a`,
          role: "assistant",
          content:
            "I ran into an error while trying to answer. Please try again in a moment.",
        };
        setMessages((prev) => [...prev, assistant]);
      } finally {
        setAnswering(false);
      }
    })();
  };

  const runQuickAction = (label: string, instruction: string) => {
    if (!file) return;

    const content = `Quick Action – ${label}.\n\n${instruction}`;
    const userMessage: ChatMessage = {
      id: `m-${Date.now()}-qa`,
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);

    void (async () => {
      setAnswering(true);
      try {
        const historyForModel: HybridChatMessage[] = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const answer = await getHybridAnswer({
          history: historyForModel,
          pdfText: docText || undefined,
        });

        const assistant: ChatMessage = {
          id: `m-${Date.now()}-qa-a`,
          role: "assistant",
          content: answer,
        };
        setMessages((prev) => [...prev, assistant]);
      } catch {
        const assistant: ChatMessage = {
          id: `m-${Date.now()}-qa-a`,
          role: "assistant",
          content:
            "I ran into an error while running that quick action. Please try again in a moment.",
        };
        setMessages((prev) => [...prev, assistant]);
      } finally {
        setAnswering(false);
      }
    })();
  };

  const handleDownloadAnalysis = () => {
    if (!messages.length) return;
    const lines: string[] = [];
    lines.push("# Document Analysis");
    if (file) {
      lines.push("");
      lines.push(`**Document:** ${file.name}`);
    }
    lines.push("");
    lines.push("## Chat Transcript");
    lines.push("");

    messages.forEach((m) => {
      const prefix = m.role === "user" ? "### Attorney" : "### Senior Paralegal";
      lines.push(prefix);
      lines.push("");
      lines.push(m.content);
      lines.push("");
    });

    const markdown = lines.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `${file.name.replace(/\.[^.]+$/, "")}-analysis.md` : "analysis.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-navy-deep flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-navy-deep/95 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gold" />
            <span className="font-serif text-lg font-bold text-cream">LawyerBot</span>
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground font-sans">Dashboard</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMetricsOpen(!metricsOpen)}
          className="text-muted-foreground"
        >
          {metricsOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          <span className="ml-2 text-sm">Intelligence</span>
        </Button>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden bg-cream">
        {/* Legal Intelligence Sidebar */}
        {metricsOpen && (
          <aside className="w-80 border-r border-border bg-navy-deep text-cream p-5 overflow-y-auto shrink-0">
            <h3 className="font-serif font-bold mb-1 text-xs uppercase tracking-[0.2em] text-gold">
              Legal Intelligence
            </h3>
            <p className="text-[11px] text-muted-foreground/80 mb-4">
              Automatically builds a matter-aware brief from your PDF.
            </p>

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock3 className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Timeline of Events</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {!file && <SidebarHint label="Upload a PDF to generate a chronology." />}
                {file && extracting && <SidebarHint label="Reading the record and building a chronology..." />}
                {file && !extracting && timeline.length === 0 && !extractError && (
                  <SidebarHint label="No explicit dates detected yet. Try a pleading, order, or contract." />
                )}
                {extractError && <SidebarError message={extractError} />}
                {timeline.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setActivePage(event.page)}
                    className="w-full text-left group rounded-md px-3 py-2 bg-navy-deep/60 hover:bg-gold/10 transition-colors"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-gold mb-0.5">{event.date}</p>
                    <p className="text-xs text-cream/90 line-clamp-2 font-serif leading-snug">
                      {event.label}
                      <span className="ml-1 text-[10px] text-gold/80">[p. {event.page}]</span>
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Key Legal Entities</span>
              </div>
              <div className="space-y-3 text-xs">
                <EntitySection
                  icon={Users}
                  title="People & Parties"
                  emptyLabel={file ? (extracting ? "Identifying parties..." : "No parties detected yet.") : "Upload a document."}
                  items={people}
                  onItemClick={(p) => setActivePage(p.page)}
                />
                <EntitySection
                  icon={MapPin}
                  title="Courts & Forums"
                  emptyLabel={file ? (extracting ? "Scanning for courts..." : "No courts detected yet.") : "Upload a document."}
                  items={courts}
                  onItemClick={(c) => setActivePage(c.page)}
                />
                <EntitySection
                  icon={Calendar}
                  title="Key Dates"
                  emptyLabel={file ? (extracting ? "Extracting dates..." : "No dates detected yet.") : "Upload a document."}
                  items={dates}
                  onItemClick={(d) => setActivePage(d.page)}
                />
              </div>
            </section>

            <section>
              <p className="text-[11px] text-muted-foreground/80 mb-2 uppercase tracking-[0.16em]">
                Quick Actions
              </p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-gold/40 bg-navy-deep/40 hover:bg-gold/15 text-[11px]"
                  disabled={!file || answering}
                  onClick={() =>
                    runQuickAction(
                      "Flag Risks",
                      "Act as a senior commercial paralegal. Scan the uploaded document and list any clauses that are one-sided, unusually risky, or materially unfavorable to our client. Group them by topic, quote the key language briefly, and include page/section references where possible.",
                    )
                  }
                >
                  Flag Risks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-gold/40 bg-navy-deep/40 hover:bg-gold/15 text-[11px]"
                  disabled={!file || answering}
                  onClick={() =>
                    runQuickAction(
                      "Case Timeline",
                      "Using the document text and any dates or names you can see, build a concise chronological table of events. Each row should include: date (or approximate), actor/party, and a short description, with page citations where possible.",
                    )
                  }
                >
                  Case Timeline
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-gold/40 bg-navy-deep/40 hover:bg-gold/15 text-[11px]"
                  disabled={!file || answering}
                  onClick={() =>
                    runQuickAction(
                      "Opposing Counsel Questions",
                      "From the perspective of a sharp opposing counsel, generate three tough, specific questions or challenges you would raise about this document. Focus on ambiguities, risk allocations, missing protections, or inconsistent definitions, and reference the relevant sections.",
                    )
                  }
                >
                  Opposing Counsel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-gold/40 bg-navy-deep/40 hover:bg-gold/15 text-[11px]"
                  disabled={!file || answering}
                  onClick={() =>
                    runQuickAction(
                      "Executive Summary",
                      "Prepare a one-page style executive summary of this document for a non-lawyer business client. Use short sections and bullets: purpose, key parties, term/termination, economics, major risks, and anything unusual. Avoid legalese and include page references in brackets where helpful.",
                    )
                  }
                >
                  Executive Summary
                </Button>
              </div>
            </section>
          </aside>
        )}

        {/* PDF Viewer / Upload */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0 bg-cream">
          {!file || !pdfUrl ? (
            <div className="flex-1 flex items-center justify-center p-10">
              <label
                className={`w-full max-w-xl aspect-[4/3] rounded-2xl border-2 border-dashed bg-cream flex flex-col items-center justify-center cursor-pointer transition-all duration-200 shadow-sm ${
                  dragging
                    ? "border-gold bg-gold/5"
                    : "border-border hover:border-gold/60 hover:bg-gold/5"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-slate-500 mb-4" />
                <p className="text-foreground font-semibold mb-1 font-serif">Drop your brief, order, or contract</p>
                <p className="text-sm text-muted-foreground">
                  I&apos;ll build a timeline, find parties, courts, and key dates.
                </p>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
          ) : (
            <>
              <div className="h-14 flex items-center justify-between px-4 border-b border-border/70 bg-[#fdf7ec]">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-gold shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate font-serif">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB{" "}
                      {activePage && (
                        <span className="ml-1 text-[11px] text-slate-500"> · Viewer synced to page {activePage}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setFile(null);
                      setDragging(false);
                    }}
                  >
                    Replace PDF
                  </Button>
                </div>
              </div>

              <div className="flex-1 bg-cream p-4">
                <div className="w-full h-full rounded-xl overflow-hidden border border-border/70 shadow-sm bg-white">
                  <iframe
                    key={pdfUrl + (activePage ?? "")}
                    src={`${pdfUrl}#page=${activePage ?? 1}&toolbar=1&zoom=page-width`}
                    title="Legal document viewer"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chat Panel */}
        <div className="w-[420px] flex flex-col bg-card shrink-0 border-l border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-serif font-bold text-foreground text-sm">AI Legal Assistant</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Grounded answers with source citations</p>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Insight cards + messages scroll independently */}
            <div className="p-4 border-b border-border bg-card">
              <div className="grid grid-cols-2 gap-3">
                <InsightCard
                  label="Governing Law"
                  value={metrics.governingLaw}
                  placeholder="Not detected yet"
                />
                <InsightCard
                  label="Key Parties"
                  value={metrics.keyParties}
                  placeholder="Parties not detected"
                />
                <InsightCard
                  label="Termination Notice"
                  value={metrics.terminationNotice}
                  placeholder="No notice period found"
                />
                <InsightCard
                  label="Liability Cap"
                  value={metrics.liabilityCap}
                  placeholder="No cap language detected"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* System message */}
              <Card className="p-4 bg-muted/50 border-border">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload a legal document to begin. I&apos;ll analyze its contents and answer your questions with precise <span className="text-gold font-medium">[Page X]</span> citations.
                </p>
              </Card>

              {file && (
                <Card className="p-4 bg-primary/5 border-gold/20">
                  <p className="text-sm text-foreground leading-relaxed">
                    <span className="font-semibold">Document loaded:</span> {file.name}. You can ask about clauses, risks, timelines, or run quick actions in the sidebar.
                  </p>
                </Card>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <Card
                    className={
                      msg.role === "user"
                        ? "max-w-[85%] p-3 bg-primary text-primary-foreground"
                        : "max-w-[85%] p-3 bg-muted/60"
                    }
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </Card>
                </div>
              ))}

              {answering && (
                <p className="text-xs text-muted-foreground italic px-1">Analyzing the document…</p>
              )}
            </div>

            {/* Chat input + export */}
            <div className="border-t border-border p-3 space-y-2">
              <form
                onSubmit={handleChatSubmit}
                className="flex gap-2"
              >
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={file ? "Ask a question about this document..." : "Upload a PDF first..."}
                  disabled={!file}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!file || !chatInput.trim() || answering} className="bg-primary text-primary-foreground hover:bg-navy-light">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!messages.length}
                  onClick={handleDownloadAnalysis}
                >
                  Download Analysis (Markdown)
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SidebarHint = ({ label }: { label: string }) => (
  <p className="text-[11px] text-muted-foreground/80 italic px-1">{label}</p>
);

const SidebarError = ({ message }: { message: string }) => (
  <p className="text-[11px] text-red-300 bg-red-900/40 border border-red-500/40 rounded px-2 py-1">{message}</p>
);

const EntitySection = ({
  icon: Icon,
  title,
  emptyLabel,
  items,
  onItemClick,
}: {
  icon: any;
  title: string;
  emptyLabel: string;
  items: LegalEntity[];
  onItemClick: (item: LegalEntity) => void;
}) => (
  <div>
    <div className="flex items-center gap-2 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-gold" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream/90">{title}</span>
    </div>
    {items.length === 0 ? (
      <p className="text-[11px] text-muted-foreground/80 pl-5">{emptyLabel}</p>
    ) : (
      <ul className="space-y-1.5 pl-5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => onItemClick(item)}
              className="w-full text-left text-[11px] text-cream/90 hover:text-gold transition-colors flex justify-between gap-2"
            >
              <span className="truncate font-serif">{item.name}</span>
              <span className="shrink-0 text-[10px] text-gold/80">[p. {item.page}]</span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const InsightCard = ({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null;
  placeholder: string;
}) => (
  <Card className="p-3 bg-card border-border/70">
    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{label}</p>
    <p className="text-sm font-serif text-foreground min-h-[1.5rem]">
      {value ?? <span className="text-muted-foreground text-xs">{placeholder}</span>}
    </p>
  </Card>
);

export default Dashboard;
