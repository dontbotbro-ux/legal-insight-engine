import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
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
  AlertTriangle,
  Gavel,
  ListTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { pdfjsLib } from "@/pdf";
import { getHybridAnswer, type HybridChatMessage } from "@/lib/hybridChat";
import { getMatter, saveMatter } from "@/lib/matterRepository";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useIsMobile } from "@/hooks/use-mobile";

type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  page: number;
  evidence?: string;
  kind?: "detected" | "deadline";
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

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
};

type TocEntry = {
  id: string;
  title: string;
  page: number;
  source: "pdf-outline" | "generated";
};

type RiskAlert = {
  id: string;
  level: "high" | "medium";
  title: string;
  detail: string;
  pageHint?: number;
};

type JudgeAnalytics = {
  judge: string;
  forum: string;
  motionType: string;
  grantRate: number;
  styleHint: string;
};

type IntelligenceSeed = {
  people?: Array<{ name: string; page?: number; sourceFile?: string }>;
  courts?: Array<{ name: string; page?: number; sourceFile?: string }>;
  keyDates?: Array<{ date: string; page?: number; sourceFile?: string }>;
  timeline?: Array<{ date: string; description: string; page?: number; sourceFile?: string }>;
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const JUDGE_FORUM_DB: JudgeAnalytics[] = [
  {
    judge: "Smith",
    forum: "District Court",
    motionType: "Motion to Dismiss",
    grantRate: 62,
    styleHint: "Prefers concise, citation-heavy briefs with clear rule-first structure.",
  },
  {
    judge: "Garcia",
    forum: "Superior Court",
    motionType: "Summary Judgment",
    grantRate: 48,
    styleHint: "Responds well to fact chronology and direct evidentiary references.",
  },
  {
    judge: "Patel",
    forum: "Court of Appeals",
    motionType: "Emergency Relief",
    grantRate: 31,
    styleHint: "Favors tight issue framing and strict standards analysis.",
  },
];

const parseDateLoose = (value: string): Date | null => {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalized = value.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/, "$1/$2/20$3");
  const alt = new Date(normalized);
  return Number.isNaN(alt.getTime()) ? null : alt;
};

const looksLikeHeading = (line: string): boolean => {
  const value = normalizeWhitespace(line);
  if (value.length < 6 || value.length > 120) return false;
  if (/^\d+(\.\d+){0,3}\s+[A-Z]/.test(value)) return true;
  if (/^(ARTICLE|SECTION|CHAPTER)\s+[A-Z0-9IVX]+[:\.\s-]/i.test(value)) return true;
  const lettersOnly = value.replace(/[^A-Za-z]/g, "");
  if (!lettersOnly) return false;
  const uppercaseRatio =
    lettersOnly.split("").filter((char) => char === char.toUpperCase()).length / lettersOnly.length;
  return uppercaseRatio >= 0.8 && value.split(" ").length <= 14;
};

const detectPrintedPageLabel = (pageText: string): string | null => {
  const lines = pageText
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (!lines.length) return null;

  const candidates = [
    ...lines.slice(0, 5), // headers
    ...lines.slice(-5),   // footers
  ];

  const patterns = [
    /\bpage\s+['’]?\s*(\d{1,5})\b/i,
    /^\(?['’]?\s*(\d{1,5})\)?$/,
    /^[-–—\s]*['’]?\s*([0-9]{1,5})[-–—\s]*$/,
    /\b['’]?\s*(\d{1,5})\s*(?:of|\/)\s*\d{1,5}\b/i,
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match?.[1]) {
        const raw = match[0];
        const numeric = Number(match[1]);
        if (!Number.isFinite(numeric)) continue;
        if (/['’]\s*\d{1,3}/.test(raw) && numeric < 100) {
          return String(100 + numeric);
        }
        return String(numeric);
      }
    }
  }
  return null;
};

const detectPrintedPageLabelFromItems = (items: PdfTextItem[], pageHeight: number): string | null => {
  const topZone = items.filter((item) => {
    const y = item.transform?.[5];
    return typeof y === "number" && y > pageHeight * 0.86;
  });
  const bottomZone = items.filter((item) => {
    const y = item.transform?.[5];
    return typeof y === "number" && y < pageHeight * 0.14;
  });

  const zoneTexts = [topZone, bottomZone]
    .map((zone) =>
      zone
        .sort((a, b) => {
          const ax = a.transform?.[4] ?? 0;
          const bx = b.transform?.[4] ?? 0;
          return ax - bx;
        })
        .map((item) => normalizeWhitespace(item.str ?? ""))
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);

  for (const zoneText of zoneTexts) {
    const found = detectPrintedPageLabel(zoneText);
    if (found) return found;
  }

  for (const item of [...topZone, ...bottomZone]) {
    const text = normalizeWhitespace(item.str ?? "");
    const found = detectPrintedPageLabel(text);
    if (found) return found;
  }
  return null;
};

const extractCandidatePageNumbers = (text: string): number[] => {
  const candidates: number[] = [];
  const pattern = /(?:page\s+)?(['’]?)\s*(\d{1,5})(?:\s*(?:of|\/)\s*\d{1,5})?/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const quote = m[1] ?? "";
    const numeric = Number(m[2]);
    if (!Number.isFinite(numeric)) continue;
    if (quote && numeric < 100) {
      candidates.push(100 + numeric);
    } else {
      candidates.push(numeric);
    }
  }
  return candidates.filter((n) => {
    if (n < 1 || n > 1500) return false;
    // Filter common year tokens frequently present in legal reporters.
    if (n >= 1700 && n <= 2100) return false;
    return true;
  });
};

const parsePartiesFromText = (text: string): string[] => {
  const results = new Set<string>();

  // "by and between Acme, Inc. and Beta LLC"
  const byBetween = /\bby and between\s+(.+?)\s+and\s+(.+?)(?:,|\.\s|\n|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = byBetween.exec(text)) !== null) {
    results.add(normalizeWhitespace(m[1].replace(/^\(?["']?|["']?\)?$/g, "")));
    results.add(normalizeWhitespace(m[2].replace(/^\(?["']?|["']?\)?$/g, "")));
  }

  // Typical legal entity names in contracts and captions.
  const entityPattern =
    /\b([A-Z][A-Za-z0-9&.,'’\- ]{2,80}?\s(?:Inc\.?|LLC|L\.L\.C\.|Ltd\.?|LP|L\.P\.|LLP|L\.L\.P\.|Corporation|Corp\.?|Company|Co\.?|PLC|PC|P\.C\.|Association|Bank|Trust|University))\b/g;
  while ((m = entityPattern.exec(text)) !== null) {
    results.add(normalizeWhitespace(m[1]));
  }

  return Array.from(results).filter((name) => name.length >= 4 && name.length <= 100);
};

const extractCourtMatches = (text: string): string[] => {
  const matches = new Set<string>();
  const courtRegex =
    /\b(Supreme Court|Court of Appeals|District Court|United States District Court|U\.S\. District Court|Superior Court|Circuit Court|Court of Chancery|Bankruptcy Court|Appellate Division|High Court|Tribunal)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = courtRegex.exec(text)) !== null) {
    matches.add(normalizeWhitespace(m[1]));
  }
  return Array.from(matches);
};

const extractDateMatches = (text: string): string[] => {
  const matches = new Set<string>();
  const patterns = [
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}\b/gi,
  ];
  patterns.forEach((pattern) => {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.add(normalizeWhitespace(m[0]));
    }
  });
  return Array.from(matches);
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageLabels, setPageLabels] = useState<string[]>([]);
  const [manualStartPage, setManualStartPage] = useState<number | null>(null);

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineFocus, setTimelineFocus] = useState<TimelineEvent | null>(null);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [people, setPeople] = useState<LegalEntity[]>([]);
  const [courts, setCourts] = useState<LegalEntity[]>([]);
  const [dates, setDates] = useState<LegalEntity[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [judgeAnalytics, setJudgeAnalytics] = useState<JudgeAnalytics | null>(null);
  const [seededIntelligence, setSeededIntelligence] = useState<IntelligenceSeed | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [docText, setDocText] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answering, setAnswering] = useState(false);
  const [currentMatterId, setCurrentMatterId] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const autosaveMatterIdRef = useRef<string | null>(null);
  const [metrics, setMetrics] = useState<InsightMetrics>({
    governingLaw: null,
    keyParties: null,
    terminationNotice: null,
    liabilityCap: null,
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/intelligence.json", { cache: "no-store" });
        if (!res.ok) return;
        const parsed = (await res.json()) as IntelligenceSeed;
        setSeededIntelligence(parsed);
      } catch {
        // ignore baseline intelligence load errors
      }
    })();
  }, []);

  const effectivePageLabels = useMemo(() => {
    if (!totalPages) return pageLabels;
    if (!manualStartPage || !Number.isFinite(manualStartPage)) return pageLabels;
    return Array.from({ length: totalPages }, (_, idx) => String(manualStartPage + idx));
  }, [manualStartPage, pageLabels, totalPages]);

  useEffect(() => {
    if (isMobile) {
      setMobileInsightsOpen(false);
    }
  }, [isMobile]);


  const loadMatterFromRepository = async (id: string) => {
    if (!user) {
      setExtractError("Sign in with Google to load saved matters.");
      return;
    }
    try {
      const matter = await getMatter(id, user.sub);
      if (!matter) {
        setExtractError("Saved matter was not found in local storage.");
        return;
      }

      const restoredFile = new File([matter.pdfBlob], matter.fileName, {
        type: "application/pdf",
        lastModified: matter.updatedAt,
      });

      setCurrentMatterId(matter.id);
      autosaveMatterIdRef.current = matter.id;
      setMessages(
        matter.messages.map((m, idx) => ({
          id: `repo-${matter.id}-${idx}`,
          role: m.role,
          content: m.content,
        })),
      );
      setFile(restoredFile);
      setExtractError(null);
    } catch {
      setExtractError("Could not load saved matter.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") {
      setCurrentMatterId(null);
      autosaveMatterIdRef.current = null;
      setMessages([]);
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") {
      setCurrentMatterId(null);
      autosaveMatterIdRef.current = null;
      setMessages([]);
      setFile(selected);
    }
  };

  useEffect(() => {
    const matterId = searchParams.get("matter");
    if (!matterId || !user) return;
    void loadMatterFromRepository(matterId);
  }, [searchParams, user?.sub]);

  useEffect(() => {
    if (file) return;
    if (!seededIntelligence) return;

    const seedPeople: LegalEntity[] = (seededIntelligence.people ?? []).slice(0, 200).map((p, idx) => ({
      id: `seed-person-${idx + 1}`,
      name: p.name,
      page: p.page ?? 1,
    }));
    const seedCourts: LegalEntity[] = (seededIntelligence.courts ?? []).slice(0, 200).map((c, idx) => ({
      id: `seed-court-${idx + 1}`,
      name: c.name,
      page: c.page ?? 1,
    }));
    const seedDates: LegalEntity[] = (seededIntelligence.keyDates ?? []).slice(0, 300).map((d, idx) => ({
      id: `seed-date-${idx + 1}`,
      name: d.date,
      page: d.page ?? 1,
    }));
    const seedTimeline: TimelineEvent[] = (seededIntelligence.timeline ?? []).slice(0, 400).map((t, idx) => ({
      id: `seed-event-${idx + 1}`,
      date: t.date,
      label: t.description,
      page: t.page ?? 1,
      evidence: t.description,
      kind: "detected",
    }));

    setPeople(seedPeople);
    setCourts(seedCourts);
    setDates(seedDates);
    setTimeline(seedTimeline);
    setTimelineFocus(seedTimeline[0] ?? null);
  }, [file, seededIntelligence]);

  // When a new PDF is loaded, generate a blob URL and kick off extraction.
  useEffect(() => {
    if (!file) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(null);
      setActivePage(null);
      setTotalPages(0);
      setPageLabels([]);
      setManualStartPage(null);
      setTimeline([]);
      setTimelineFocus(null);
      setTocEntries([]);
      setPeople([]);
      setCourts([]);
      setDates([]);
      setRiskAlerts([]);
      setJudgeAnalytics(null);
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
        setTotalPages(pdf.numPages);
        const labels = await pdf.getPageLabels();
        let resolvedPageLabels: string[] = Array.from({ length: pdf.numPages }, (_, idx) => String(idx + 1));
        if (Array.isArray(labels) && labels.length === pdf.numPages && labels.some((label) => Boolean(label?.trim()))) {
          resolvedPageLabels = labels.map((label, idx) => (label?.trim() ? label.trim() : String(idx + 1)));
        }

        const newTimeline: TimelineEvent[] = [];
        const peopleSet = new Map<string, LegalEntity>();
        const courtSet = new Map<string, LegalEntity>();
        const dateSet = new Map<string, LegalEntity>();

        const dateRegexLong =
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi;
        const dateRegexShort = /\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
        const captionRegex = /([A-Z][A-Za-z.&\s]+?)\s+v\.?\s+([A-Z][A-Za-z.&\s]+?)(?=,|\n|$)/;
        const courtRegex =
          /\b(Supreme Court|Court of Appeals|District Court|United States District Court|U\.S\. District Court|Superior Court|Circuit Court|Court of Chancery|Bankruptcy Court|Appellate Division|High Court|Tribunal)\b/gi;

        let combinedText = "";
        const pageTexts: Array<{ page: number; text: string }> = [];
        const generatedTocMap = new Map<string, TocEntry>();

        const resolveOutlinePage = async (dest: unknown): Promise<number | null> => {
          try {
            const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
            if (!Array.isArray(resolved) || !resolved[0]) return null;
            const ref = resolved[0];
            const pageIndex = await pdf.getPageIndex(ref);
            return pageIndex + 1;
          } catch {
            return null;
          }
        };

        const extractPdfOutline = async (): Promise<TocEntry[]> => {
          const outline = await pdf.getOutline();
          if (!outline || outline.length === 0) return [];
          const entries: TocEntry[] = [];

          const walk = async (items: any[]) => {
            for (const item of items) {
              const title = normalizeWhitespace(String(item.title ?? ""));
              if (!title) continue;
              const page = await resolveOutlinePage(item.dest);
              if (page) {
                entries.push({
                  id: `toc-outline-${entries.length + 1}`,
                  title,
                  page,
                  source: "pdf-outline",
                });
              }
              if (Array.isArray(item.items) && item.items.length) {
                await walk(item.items);
              }
            }
          };

          await walk(outline);
          return entries;
        };

        const outlineEntries = await extractPdfOutline();

        const numPages = pdf.numPages;
        const printedPageLabels: string[] = Array.from({ length: numPages }, (_, idx) => String(idx + 1));
        let detectedPrintedLabels = 0;
        const perPageCandidateNumbers: number[][] = [];
        let firstStrongPrintedSignal: { pageIndex: number; value: number } | null = null;
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });
          const text = (textContent.items as PdfTextItem[])
            .map((item) => (item.hasEOL ? `${item.str}\n` : `${item.str} `))
            .join("")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          const printedLabel =
            detectPrintedPageLabelFromItems(textContent.items as PdfTextItem[], viewport.height) ??
            detectPrintedPageLabel(text);
          if (printedLabel) {
            printedPageLabels[pageNum - 1] = printedLabel;
            detectedPrintedLabels += 1;
            const parsed = Number(printedLabel);
            if (Number.isFinite(parsed) && !firstStrongPrintedSignal) {
              firstStrongPrintedSignal = { pageIndex: pageNum - 1, value: parsed };
            }
          }
          const zoneText = (textContent.items as PdfTextItem[])
            .filter((item) => {
              const y = item.transform?.[5];
              if (typeof y !== "number") return false;
              return y > viewport.height * 0.86 || y < viewport.height * 0.14;
            })
            .map((item) => normalizeWhitespace(item.str ?? ""))
            .join(" ");
          const candidates = extractCandidatePageNumbers(zoneText);
          perPageCandidateNumbers.push(candidates);
          if (!firstStrongPrintedSignal && pageNum <= 3) {
            const highConfidence = candidates
              .filter((value) => value >= 20 && value <= 1500)
              .sort((a, b) => b - a)[0];
            if (highConfidence) {
              firstStrongPrintedSignal = { pageIndex: pageNum - 1, value: highConfidence };
            }
          }

          combinedText += `[Page ${pageNum}]\n${text}\n\n`;
          pageTexts.push({ page: pageNum, text });

          if (outlineEntries.length === 0) {
            const lines = text.split("\n").map((line) => normalizeWhitespace(line)).filter(Boolean);
            for (const line of lines.slice(0, 40)) {
              if (!looksLikeHeading(line)) continue;
              const key = line.toLowerCase();
              if (!generatedTocMap.has(key)) {
                generatedTocMap.set(key, {
                  id: `toc-generated-${generatedTocMap.size + 1}`,
                  title: line,
                  page: pageNum,
                  source: "generated",
                });
              }
            }
          }

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

          // Reset global regex cursors for each new page text.
          courtRegex.lastIndex = 0;
          dateRegexLong.lastIndex = 0;
          dateRegexShort.lastIndex = 0;

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
          while ((m = dateRegexLong.exec(text)) !== null) allDates.add(normalizeWhitespace(m[0]));
          while ((m = dateRegexShort.exec(text)) !== null) allDates.add(normalizeWhitespace(m[0]));
          extractDateMatches(text).forEach((d) => allDates.add(d));

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
                evidence: pageSnippet.trim().replace(/\s+/g, " "),
                kind: "detected",
              });
            }
          }
        }

        // Additional party fallback for agreements that don't use "A v. B" caption style.
        if (peopleSet.size === 0 && combinedText.trim().length > 0) {
          const fallbackParties = parsePartiesFromText(combinedText);
          fallbackParties.slice(0, 12).forEach((name, idx) => {
            peopleSet.set(`${name}|1|fallback`, {
              id: `person-fallback-${idx + 1}`,
              name,
              page: 1,
            });
          });
        }

        // Second-pass fallback extraction for harder PDF layouts.
        if (dateSet.size === 0 || peopleSet.size === 0 || courtSet.size === 0) {
          pageTexts.forEach(({ page, text }) => {
            if (courtSet.size === 0) {
              extractCourtMatches(text).forEach((courtName) => {
                const key = `${courtName}|${page}|fallback`;
                if (!courtSet.has(key)) {
                  courtSet.set(key, {
                    id: `court-fallback-${courtSet.size + 1}`,
                    name: courtName,
                    page,
                  });
                }
              });
            }

            if (dateSet.size === 0) {
              extractDateMatches(text).forEach((dateValue) => {
                const key = `${dateValue}|${page}|fallback`;
                if (!dateSet.has(key)) {
                  dateSet.set(key, {
                    id: `date-fallback-${dateSet.size + 1}`,
                    name: dateValue,
                    page,
                  });
                }
                newTimeline.push({
                  id: `event-fallback-${newTimeline.length + 1}`,
                  date: dateValue,
                  label: normalizeWhitespace(text).slice(0, 240) || "Referenced in document",
                  page,
                  evidence: normalizeWhitespace(text).slice(0, 240),
                  kind: "detected",
                });
              });
            }

            if (peopleSet.size === 0) {
              const roleBasedPartyRegex =
                /\b(?:plaintiff|defendant|petitioner|respondent|claimant|appellant|appellee)\s*[:\-]\s*([A-Z][A-Za-z0-9&.,'’\- ]{2,80})/gi;
              let match: RegExpExecArray | null;
              while ((match = roleBasedPartyRegex.exec(text)) !== null) {
                const name = normalizeWhitespace(match[1]);
                const key = `${name}|${page}|role`;
                if (!peopleSet.has(key)) {
                  peopleSet.set(key, {
                    id: `person-role-${peopleSet.size + 1}`,
                    name,
                    page,
                  });
                }
              }
            }
          });
        }

        // Procedural deadline overlay: if service date is detected, compute answer due (+21 days).
        const serviceEvent = newTimeline.find((event) =>
          /service|served|service date/i.test(event.label),
        );
        if (serviceEvent) {
          const base = parseDateLoose(serviceEvent.date);
          if (base) {
            const due = new Date(base);
            due.setDate(due.getDate() + 21);
            const dueLabel = `Answer Due (computed 21 days after service date)`;
            newTimeline.push({
              id: `deadline-answer-${due.getTime()}`,
              date: due.toLocaleDateString("en-US"),
              label: dueLabel,
              page: serviceEvent.page,
              evidence: serviceEvent.evidence ?? serviceEvent.label,
              kind: "deadline",
            });
          }
        }

        // Sort timeline by parsed date when available, then by page.
        newTimeline.sort((a, b) => {
          const aDate = parseDateLoose(a.date);
          const bDate = parseDateLoose(b.date);
          if (aDate && bDate) return aDate.getTime() - bDate.getTime();
          if (a.page !== b.page) return a.page - b.page;
          return a.date.localeCompare(b.date);
        });

        const normalizedDocText = combinedText.replace(/\s+/g, " ").trim();
        const mergedToc = outlineEntries.length > 0 ? outlineEntries : Array.from(generatedTocMap.values());
        // Normalize numeric printed labels with a stable offset if detected
        // (e.g., first visible page number is 137).
        const numericSignals = printedPageLabels
          .map((label, idx) => ({ idx, value: Number(label) }))
          .filter((v) => Number.isFinite(v.value) && String(v.value) === printedPageLabels[v.idx].trim());
        // Deterministic fallback: one strong printed page label sets the global offset.
        if (firstStrongPrintedSignal) {
          const offset = firstStrongPrintedSignal.value - (firstStrongPrintedSignal.pageIndex + 1);
          for (let i = 0; i < numPages; i++) {
            printedPageLabels[i] = String(i + 1 + offset);
          }
          detectedPrintedLabels = numPages;
        }
        if (numericSignals.length >= 2 || perPageCandidateNumbers.some((arr) => arr.length > 0)) {
          const offsetCounts = new Map<number, number>();
          for (const signal of numericSignals) {
            const offset = signal.value - (signal.idx + 1);
            offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
          }
          perPageCandidateNumbers.forEach((numbers, idx) => {
            numbers.forEach((value) => {
              const offset = value - (idx + 1);
              offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
            });
          });
          const [bestOffset, bestCount] = Array.from(offsetCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
          if (bestCount >= 2) {
            for (let i = 0; i < numPages; i++) {
              printedPageLabels[i] = String(i + 1 + bestOffset);
            }
            detectedPrintedLabels = numPages;
          }
        }
        // Prefer printed page numbers found in document text when enough pages expose them.
        if (detectedPrintedLabels >= Math.max(2, Math.floor(numPages * 0.3))) {
          resolvedPageLabels = printedPageLabels;
        }
        setPageLabels(resolvedPageLabels);

        // Adverse inference and missing-reference alerting.
        const alerts: RiskAlert[] = [];
        const rainFound = /\b(rain|raining|rainstorm|wet roads)\b/i.test(normalizedDocText);
        const sunFound = /\b(sunny|clear skies|no precipitation)\b/i.test(normalizedDocText);
        if (rainFound && sunFound) {
          alerts.push({
            id: "weather-contradiction",
            level: "high",
            title: "Credibility Risk: Contradictory Weather Facts",
            detail:
              "Document context includes both rainy and sunny/no-precipitation descriptions. Verify source dates and witness statements for inconsistency.",
          });
        }

        const exhibitRefs = Array.from(normalizedDocText.matchAll(/\bExhibit\s+([A-Z0-9]+)\b/gi)).map(
          (m) => m[1].toUpperCase(),
        );
        const exhibitHeadings = new Set(
          Array.from(combinedText.matchAll(/(?:^|\n)\s*Exhibit\s+([A-Z0-9]+)\s*(?:[:\-]|\n)/gim)).map(
            (m) => m[1].toUpperCase(),
          ),
        );
        const missingExhibits = Array.from(new Set(exhibitRefs)).filter((id) => !exhibitHeadings.has(id));
        missingExhibits.forEach((exhibitId) => {
          alerts.push({
            id: `missing-exhibit-${exhibitId}`,
            level: "medium",
            title: `Missing Reference Detected: Exhibit ${exhibitId}`,
            detail:
              "This exhibit is referenced in the text but no matching exhibit section was detected in the uploaded materials.",
          });
        });

        const judgeMatch =
          combinedText.match(/\bJudge\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) ??
          combinedText.match(/\bHon\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
        const detectedJudge = judgeMatch?.[1] ?? null;
        const detectedForum = Array.from(courtSet.values())[0]?.name ?? "Unknown Forum";
        let judgeInsight: JudgeAnalytics | null = null;
        if (detectedJudge) {
          const candidate = JUDGE_FORUM_DB.find((entry) =>
            normalizeWhitespace(entry.judge.toLowerCase()) === normalizeWhitespace(detectedJudge.toLowerCase()),
          );
          if (candidate) {
            judgeInsight = candidate;
          } else {
            judgeInsight = {
              judge: detectedJudge,
              forum: detectedForum,
              motionType: "Dispositive Motions",
              grantRate: 50,
              styleHint:
                "No local ruling profile found. Default to concise sections, precise citations, and neutral tone.",
            };
          }
        }

        setTimeline(newTimeline);
        setTimelineFocus((prev) => prev ?? newTimeline[0] ?? null);
        setTocEntries(mergedToc.slice(0, 200));
        setPeople(Array.from(peopleSet.values()));
        setCourts(Array.from(courtSet.values()));
        setDates(Array.from(dateSet.values()));
        setRiskAlerts(alerts);
        setJudgeAnalytics(judgeInsight);
        setDocText(combinedText);

        if (normalizedDocText.length < 120) {
          setExtractError(
            "This PDF appears to have little or no extractable text (likely scanned/image-based). Upload a text-based PDF or OCR it first for matter-aware analysis.",
          );
        } else {
          setExtractError(null);
        }
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
      text.match(/govern(?:ed|ing)\s+(?:by|under)\s+(?:the\s+)?laws?\s+of\s+([A-Za-z\s]+?)(?:,|\.|;|\)|\n|$)/i) ??
      text.match(/governing law[:\s]+([A-Za-z\s]+?)(?:,|\.|;|\)|\n|$)/i) ??
      text.match(/construed in accordance with the laws?\s+of\s+([A-Za-z\s]+?)(?:,|\.|;|\)|\n|$)/i);
    if (lawMatch) {
      governingLaw = lawMatch[1].replace(/^the state of\s+/i, "").trim();
    }

    // Key parties from extracted people
    let keyParties: string | null = null;
    const parsedParties = parsePartiesFromText(text);
    if (people.length > 0 || parsedParties.length > 0) {
      const uniqueNames = Array.from(
        new Set([...people.map((p) => p.name), ...parsedParties].map((name) => normalizeWhitespace(name))),
      );
      keyParties = uniqueNames.slice(0, 4).join(" · ");
    }

    // Termination notice
    let terminationNotice: string | null = null;
    const termMatch =
      text.match(/(\d+)\s*[- ]?(day|days|month|months)\s*(?:'?s)?\s*(?:prior written )?notice\s+(?:of\s+)?termination/i) ??
      text.match(/(?:at least\s+)?(\d+)\s+(day|days|month|months)\s+(?:prior to|before)\s+(?:termination|ending)/i) ??
      text.match(/termination.*?upon\s+(\d+)\s*[- ]?(day|days|month|months)\s*(?:'?s)?\s*notice/i);
    if (termMatch) {
      const amount = termMatch[1];
      const unit = termMatch[2];
      terminationNotice = `${amount} ${unit}`;
    }

    // Liability cap
    let liabilityCap: string | null = null;
    const capMatch =
      text.match(/(?:aggregate|total)?\s*liability(?: of [A-Za-z\s]+)?\s+(?:shall )?not exceed\s+([\$€£]?\s?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/liability(?: of [A-Za-z\s]+)?\s+is\s+limited\s+to\s+([\$€£]?\s?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/cap on (?:the )?liability\s+of\s+([\$€£]?\s?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/liability cap[:\s]+([\$€£]?\s?[0-9,\.]+\s*(?:million|thousand)?)/i) ??
      text.match(/in no event.*?liability.*?exceed\s+([\$€£]?\s?[0-9,\.]+\s*(?:million|thousand)?)/i);
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

  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
  }, [messages, answering]);

  useEffect(() => {
    if (!file || !user) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const savedId = await saveMatter({
            id: currentMatterId ?? autosaveMatterIdRef.current ?? undefined,
            userId: user.sub,
            file,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          });
          autosaveMatterIdRef.current = savedId;
          if (savedId !== currentMatterId) {
            setCurrentMatterId(savedId);
          }
        } catch {
          // Keep UI responsive if local storage save fails.
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currentMatterId, file, messages, user?.sub]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (extracting) {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-a-pending`,
          role: "assistant",
          content: "I am still analyzing the uploaded PDF. Please try again in a moment.",
        },
      ]);
      return;
    }
    if (!docText.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-a-nodoc`,
          role: "assistant",
          content:
            extractError ??
            "I could not extract readable text from this PDF yet. Please wait for analysis to finish or upload a text-based PDF.",
        },
      ]);
      return;
    }
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
    if (extracting || !docText.trim()) return;

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

  const handleDownloadAnalysis = async () => {
    if (!messages.length) return;

    const children: Paragraph[] = [
      new Paragraph({
        text: "Document Analysis",
        heading: HeadingLevel.TITLE,
      }),
    ];

    if (file) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Document: ", bold: true }),
            new TextRun({ text: file.name }),
          ],
        }),
      );
    }

    children.push(
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: "Chat Transcript",
        heading: HeadingLevel.HEADING_1,
      }),
    );

    messages.forEach((m) => {
      const speaker = m.role === "user" ? "Attorney" : "Senior Paralegal";
      children.push(
        new Paragraph({
          text: speaker,
          heading: HeadingLevel.HEADING_2,
        }),
      );

      m.content.split(/\n+/).forEach((line) => {
        children.push(
          new Paragraph({
            text: line.trim() || " ",
          }),
        );
      });
    });

    const doc = new Document({
      sections: [{ children }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `${file.name.replace(/\.[^.]+$/, "")}-analysis.docx` : "analysis.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyDraftField = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op fallback; copy support depends on browser permissions
    }
  };

  return (
    <div
      className={`bg-navy-deep flex flex-col ${
        isMobile ? "h-[100dvh] overflow-hidden" : "h-screen overflow-hidden"
      }`}
    >
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-navy-deep/95 px-4 shrink-0">
        <div className="h-full flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gold" />
            <span className="font-serif text-lg font-bold text-cream">LawyerBot</span>
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMetricsOpen(!metricsOpen)}
            className="text-muted-foreground"
          >
            {metricsOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            <span className="ml-2 text-sm">Intelligence</span>
          </Button>
        </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex items-center gap-2 w-max ml-auto pr-1">
          <Link to="/">
            <Button variant="outline" size="sm" className="text-foreground">
              Home
            </Button>
          </Link>
          <Link to="/repository">
            <Button variant="outline" size="sm" className="text-foreground">
              History
            </Button>
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

      {/* Main area */}
      <div className={isMobile ? "flex-1 min-h-0 bg-cream overflow-hidden" : "flex-1 min-h-0 bg-cream overflow-hidden"}>
        <ResizablePanelGroup
          direction={isMobile ? "vertical" : "horizontal"}
          className={isMobile ? "h-full min-h-0 touch-pan-y" : "h-full min-h-0"}
        >
          {metricsOpen && (
            <>
              <ResizablePanel
                defaultSize={isMobile ? 45 : 24}
                minSize={isMobile ? 35 : 16}
                maxSize={isMobile ? 70 : 38}
                className={isMobile ? "min-h-0 overflow-hidden" : "min-h-0 overflow-hidden"}
              >
                <aside
                  className={`bg-navy-deep text-cream p-5 flex flex-col min-h-0 ${
                    isMobile
                      ? "h-full border-b border-border pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
                      : "h-full border-r border-border"
                  }`}
                >
            <h3 className="font-serif font-bold mb-1 text-xs uppercase tracking-[0.2em] text-gold">
              Legal Intelligence
            </h3>
            <p className="text-[11px] text-muted-foreground/80 mb-4">
              Automatically builds a matter-aware brief from your PDF.
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <ListTree className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Document TOC</span>
              </div>
              <div className="space-y-2">
                {!file && <SidebarHint label="Upload a PDF to build or read a table of contents." />}
                {file && extracting && <SidebarHint label="Analyzing document structure..." />}
                {file && !extracting && tocEntries.length === 0 && (
                  <SidebarHint label="No outline detected and no reliable headings found to generate a TOC." />
                )}
                {file && tocEntries.length > 0 && (
                  <select
                    className="w-full rounded-md border border-gold/30 bg-navy-deep/50 px-2 py-1.5 text-[11px] text-cream"
                    defaultValue=""
                    onChange={(e) => {
                      const page = Number(e.target.value);
                      if (!Number.isNaN(page) && page > 0) setActivePage(page);
                    }}
                  >
                    <option value="" disabled>
                      Jump to section...
                    </option>
                    {tocEntries.map((entry) => (
                      <option key={entry.id} value={entry.page}>
                        {entry.title} [p. {effectivePageLabels[entry.page - 1] ?? String(entry.page)}]
                      </option>
                    ))}
                  </select>
                )}
                {file && totalPages > 0 && (
                  <>
                    <select
                      className="w-full rounded-md border border-gold/30 bg-navy-deep/50 px-2 py-1.5 text-[11px] text-cream"
                      value={String(activePage ?? "")}
                      onChange={(e) => {
                        const page = Number(e.target.value);
                        if (!Number.isNaN(page) && page > 0) setActivePage(page);
                      }}
                    >
                      <option value="" disabled>
                        Jump to page...
                      </option>
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
                        <option key={page} value={page}>
                          Page {effectivePageLabels[page - 1] ?? String(page)}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground whitespace-nowrap">
                        Starts at page
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={manualStartPage ?? ""}
                        placeholder={effectivePageLabels[0] ?? "1"}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          if (!value) {
                            setManualStartPage(null);
                            return;
                          }
                          const parsed = Number(value);
                          if (Number.isFinite(parsed) && parsed > 0) {
                            setManualStartPage(Math.floor(parsed));
                          }
                        }}
                        className="w-20 rounded border border-gold/30 bg-navy-deep/50 px-2 py-1 text-[11px] text-cream"
                      />
                      <button
                        onClick={() => setManualStartPage(null)}
                        className="text-[10px] text-gold hover:text-gold-light"
                        type="button"
                      >
                        Auto
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">AI Redline Risk Alerts</span>
              </div>
              <div className="space-y-2">
                {!file && <SidebarHint label="Upload a PDF to run contradiction and reference checks." />}
                {file && !extracting && riskAlerts.length === 0 && (
                  <SidebarHint label="No adverse inference or missing-reference alerts detected." />
                )}
                {riskAlerts.map((alert) => (
                  <Card
                    key={alert.id}
                    className={`p-2 border ${
                      alert.level === "high"
                        ? "border-red-500/50 bg-red-900/20"
                        : "border-amber-400/50 bg-amber-900/20"
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-cream">{alert.title}</p>
                    <p className="text-[11px] text-cream/80">{alert.detail}</p>
                    {alert.pageHint && <p className="text-[10px] text-gold/90 mt-1">[p. {alert.pageHint}]</p>}
                  </Card>
                ))}
              </div>
            </section>

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Judge & Forum Analytics</span>
              </div>
              {!file && <SidebarHint label="Upload a PDF to detect judge and forum context." />}
              {file && !extracting && !judgeAnalytics && (
                <SidebarHint label="No judge signature detected yet. Analytics will appear when a judge is found." />
              )}
              {judgeAnalytics && (
                <Card className="p-3 bg-navy-deep/50 border-gold/30 text-[#fdf7ec]">
                  <p className="text-xs text-[#fdf7ec]">
                    <span className="font-semibold">Judge:</span> {judgeAnalytics.judge}
                  </p>
                  <p className="text-xs text-[#fdf7ec]">
                    <span className="font-semibold">Forum:</span> {judgeAnalytics.forum}
                  </p>
                  <p className="text-xs text-gold mt-1">
                    {judgeAnalytics.motionType} grant rate: <span className="font-semibold">{judgeAnalytics.grantRate}%</span>
                  </p>
                  <p className="text-[11px] text-[#fdf7ec]/85 mt-2">
                    <span className="font-semibold">Tone Matching:</span> {judgeAnalytics.styleHint}
                  </p>
                </Card>
              )}
            </section>

            <section className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock3 className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Tactical Timeline</span>
              </div>
              {timeline.length > 0 && (
                <TacticalTimeline
                  events={timeline}
                  activeId={timelineFocus?.id ?? null}
                  onSelect={(event) => {
                    setTimelineFocus(event);
                    setActivePage(event.page);
                  }}
                />
              )}
              {timelineFocus && (
                <Card className="p-2 mb-2 bg-navy-deep/40 border-gold/20">
                  <p className="text-[11px] text-gold font-semibold">{timelineFocus.date}</p>
                  <p className="text-[11px] text-cream/90">{timelineFocus.label}</p>
                  <p className="text-[10px] text-cream/80 mt-1">
                    Evidence: {(timelineFocus.evidence || timelineFocus.label).slice(0, 200)}
                  </p>
                  <p className="text-[10px] text-gold/90 mt-1">[p. {timelineFocus.page}]</p>
                </Card>
              )}
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
                      {event.kind === "deadline" && (
                        <span className="ml-1 text-[10px] text-red-300">[deadline]</span>
                      )}
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
            </div>
                </aside>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel
            defaultSize={isMobile ? (metricsOpen ? 44 : 60) : metricsOpen ? 46 : 65}
            minSize={isMobile ? 30 : 28}
            className={isMobile ? "min-h-0 overflow-y-auto overscroll-contain" : "min-h-0 overflow-y-auto"}
          >
            {/* PDF Viewer / Upload */}
            <div className={`${isMobile ? "h-full" : "h-full"} flex flex-col min-w-0 bg-cream ${isMobile ? "border-b border-border" : "border-r border-border"}`}>
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
                      setCurrentMatterId(null);
                      autosaveMatterIdRef.current = null;
                      setMessages([]);
                      setDragging(false);
                    }}
                  >
                    Replace PDF
                  </Button>
                </div>
              </div>

              <div
                className={
                  isMobile
                    ? "flex-1 min-h-0 bg-cream p-4"
                    : "flex-1 bg-cream p-4"
                }
              >
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
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={isMobile ? (metricsOpen ? 34 : 40) : metricsOpen ? 30 : 35}
            minSize={isMobile ? 30 : 22}
            maxSize={isMobile ? 65 : 50}
            className={isMobile ? "min-h-0 overflow-hidden overscroll-contain" : "min-h-0 overflow-y-auto"}
          >
            {/* Chat Panel */}
            <div
              className={`${isMobile ? "h-full min-h-0" : "h-full min-h-0"} flex flex-col bg-card ${isMobile ? "border-t border-border" : "border-l border-border"}`}
            >
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif font-bold text-foreground text-sm">AI Legal Assistant</h3>
                  {isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setMobileInsightsOpen((prev) => !prev)}
                    >
                      {mobileInsightsOpen ? "Hide Insights" : "Show Insights"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Grounded answers with source citations</p>
                {!user && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Sign in with Google to save this matter to your repository history.
                  </p>
                )}
              </div>

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Insight cards + messages scroll independently */}
                {(!isMobile || mobileInsightsOpen) && (
                  <div
                    className={`p-4 border-b border-border bg-card ${
                      isMobile ? "min-h-[16dvh] max-h-[26dvh] overflow-y-auto shrink-0" : ""
                    }`}
                  >
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
                  <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">Drafting Sync (Word)</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => void copyDraftField(metrics.keyParties ?? "Not detected")}
                      >
                        Copy Parties
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => void copyDraftField(dates.map((d) => `${d.name} [p. ${d.page}]`).join("\n") || "No dates detected")}
                      >
                        Copy Dates
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          void copyDraftField(
                            `Forum: ${courts[0]?.name ?? "Not detected"}\nGoverning Law: ${metrics.governingLaw ?? "Not detected"}`,
                          )
                        }
                      >
                        Copy Forum/Law
                      </Button>
                    </div>
                  </div>
                  </div>
                )}

                <div
                  ref={messagesViewportRef}
                  className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 ${isMobile ? "pb-24" : ""}`}
                >
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
                        {msg.role === "assistant" ? (
                          <AssistantMessage content={msg.content} />
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </Card>
                    </div>
                  ))}

                  {answering && (
                    <p className="text-xs text-muted-foreground italic px-1">Analyzing the document…</p>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat input + export */}
                <div
                  className={
                    isMobile
                      ? "mt-auto z-20 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] space-y-2 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
                      : "border-t border-border p-3 space-y-2 bg-card"
                  }
                >
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
                      Download Analysis (.docx)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
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

const TacticalTimeline = ({
  events,
  activeId,
  onSelect,
}: {
  events: TimelineEvent[];
  activeId: string | null;
  onSelect: (event: TimelineEvent) => void;
}) => {
  const max = Math.max(events.length - 1, 1);
  return (
    <div className="mb-3 overflow-x-auto">
      <div className="relative min-w-[520px] h-12">
        <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-[2px] bg-gold/40" />
        {events.map((event, idx) => {
          const leftPct = `${(idx / max) * 100}%`;
          const isActive = activeId === event.id;
          const isDeadline = event.kind === "deadline";
          return (
            <button
              key={event.id}
              onClick={() => onSelect(event)}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-transform hover:scale-110 ${
                isDeadline
                  ? "bg-red-400 border-red-200"
                  : isActive
                    ? "bg-gold border-cream"
                    : "bg-gold/70 border-gold/30"
              }`}
              style={{ left: leftPct }}
              title={`${event.date} · ${event.label}`}
            />
          );
        })}
      </div>
    </div>
  );
};

const AssistantMessage = ({ content }: { content: string }) => (
  <div className="text-sm leading-relaxed text-foreground">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h4 className="font-semibold text-base mb-2">{children}</h4>,
        h2: ({ children }) => <h4 className="font-semibold text-base mb-2">{children}</h4>,
        h3: ({ children }) => <h5 className="font-semibold text-sm mb-2">{children}</h5>,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-md border border-border/60">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
        th: ({ children }) => <th className="border border-border/60 px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-border/60 px-2 py-1 align-top">{children}</td>,
        code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default Dashboard;
