import { useState } from "react";
import { Link } from "react-router-dom";
import { Scale, Upload, FileText, Send, Users, Calendar, MapPin, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const Dashboard = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(true);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") setFile(droppedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") setFile(selected);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gold" />
            <span className="font-serif text-lg font-bold text-foreground">LawyerBot</span>
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
          <span className="ml-2 text-sm">Metrics</span>
        </Button>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Smart Metrics Sidebar */}
        {metricsOpen && (
          <aside className="w-72 border-r border-border bg-card p-5 overflow-y-auto shrink-0">
            <h3 className="font-serif font-bold text-foreground mb-4 text-sm uppercase tracking-wider">Smart Metrics</h3>

            <MetricSection icon={Users} title="Parties" items={file ? ["Extracting..."] : ["Upload a document"]} />
            <MetricSection icon={Calendar} title="Key Deadlines" items={file ? ["Extracting..."] : ["Upload a document"]} />
            <MetricSection icon={MapPin} title="Jurisdiction" items={file ? ["Extracting..."] : ["Upload a document"]} />
          </aside>
        )}

        {/* PDF Viewer / Upload */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          {!file ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <label
                className={`w-full max-w-lg aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                  dragging
                    ? "border-gold bg-gold/5"
                    : "border-border hover:border-gold/50 hover:bg-muted/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-foreground font-semibold mb-1">Drop your PDF here</p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-muted/30 p-8">
              <FileText className="h-16 w-16 text-gold mb-4" />
              <p className="font-semibold text-foreground mb-1">{file.name}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <Button variant="outline" size="sm" onClick={() => setFile(null)}>
                Remove & Upload New
              </Button>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        <div className="w-[420px] flex flex-col bg-card shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="font-serif font-bold text-foreground text-sm">AI Legal Assistant</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Grounded answers with source citations</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* System message */}
            <Card className="p-4 bg-muted/50 border-border">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload a legal document to begin. I'll analyze its contents and answer your questions with precise <span className="text-gold font-medium">[Page X]</span> citations.
              </p>
            </Card>

            {file && (
              <Card className="p-4 bg-primary/5 border-gold/20">
                <p className="text-sm text-foreground leading-relaxed">
                  <span className="font-semibold">Document loaded:</span> {file.name}. You can now ask questions about its contents. All responses will be grounded in the document.
                </p>
              </Card>
            )}
          </div>

          {/* Chat input */}
          <div className="p-4 border-t border-border">
            <form
              onSubmit={(e) => { e.preventDefault(); setChatInput(""); }}
              className="flex gap-2"
            >
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={file ? "Ask about the document..." : "Upload a PDF first..."}
                disabled={!file}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={!file || !chatInput.trim()} className="bg-primary text-primary-foreground hover:bg-navy-light">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricSection = ({ icon: Icon, title, items }: { icon: any; title: string; items: string[] }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4 text-gold" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-muted-foreground pl-6">{item}</li>
      ))}
    </ul>
  </div>
);

export default Dashboard;
