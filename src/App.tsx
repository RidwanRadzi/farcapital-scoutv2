import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchType = "unsold" | "new_launch";

type SearchResult = {
  title: string;
  url: string;
  content: string;
  project_name: string | null;
  developer: string | null;
  area: string | null;
  state: string | null;
  completion_year: number | null;
  is_high_rise: boolean;
  has_unsold_signal: boolean;
  confidence: string;
};

type SeedProject = {
  name: string;
  developer: string;
  area?: string;
  state: string;
  completion_year?: number;
};

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function findYear(cols: string[]): number | undefined {
  for (const col of cols) {
    const m = col.match(/\b(201[8-9]|202[0-9]|2030)\b/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function parseProjectsCSV(text: string): SeedProject[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map(parseCSVRow);
  const dataRows =
    rows[0]?.[0]?.toLowerCase().includes("project") ? rows.slice(1) : rows;

  const projects: SeedProject[] = [];
  for (const cols of dataRows) {
    const name = cols[0]?.trim();
    if (!name) continue;
    const developer = cols[1]?.trim() ?? "";
    const state = (cols[3]?.trim() || cols[2]?.trim()) ?? "";
    const completion_year = findYear(cols);
    projects.push({
      name,
      developer,
      state,
      ...(completion_year !== undefined ? { completion_year } : {}),
    });
  }
  return projects;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNSOLD_CHIPS = ["Shah Alam", "Rawang", "Cheras", "Cyberjaya", "Klang", "Seremban"];
const NEW_LAUNCH_CHIPS = ["Klang Valley", "Shah Alam", "Petaling Jaya", "Johor Bahru", "Penang"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function DuplicateBadge({ title }: { title: string }) {
  const match = useQuery(api.projects.checkDuplicate, { projectName: title });
  if (match === undefined) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
        Checking…
      </span>
    );
  }
  if (match !== null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">
        ⚠️ Already studied
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-300">
      New
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    high: "bg-emerald-400",
    medium: "bg-yellow-400",
    low: "bg-gray-500",
  };
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400">
      <span
        className={`inline-block w-2 h-2 rounded-full ${colors[confidence] ?? "bg-gray-500"}`}
      />
      {confidence}
    </span>
  );
}

function ResultCard({
  result,
  searchType,
}: {
  result: SearchResult;
  searchType: SearchType;
}) {
  const accentUrl = searchType === "unsold" ? "text-emerald-400" : "text-amber-400";
  // Use extracted project_name as headline; fall back to raw page title
  const headline = result.project_name ?? result.title;
  const hasExtracted = result.project_name !== null;

  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3 border border-gray-700">

      {/* ── Headline + duplicate badge ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-snug">
            {headline}
          </p>
          {/* Show raw page title as subtitle only when we have an extracted name */}
          {hasExtracted && result.title !== result.project_name && (
            <p className="text-gray-500 text-xs truncate">{result.title}</p>
          )}
        </div>
        <DuplicateBadge title={headline} />
      </div>

      {/* ── Developer + location row ── */}
      {(result.developer || result.area || result.state) && (
        <div className="flex flex-wrap gap-1.5">
          {result.developer && (
            <span className="text-xs text-gray-200 bg-gray-700 px-2 py-0.5 rounded font-medium">
              {result.developer}
            </span>
          )}
          {result.area && (
            <span className="text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded">
              {result.area}
            </span>
          )}
          {result.state && (
            <span className="text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded font-mono">
              {result.state}
            </span>
          )}
        </div>
      )}

      {/* ── Status badges ── */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {result.completion_year !== null && result.completion_year > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
            {result.completion_year}
          </span>
        )}
        {result.has_unsold_signal && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300 font-semibold">
            Unsold Signal
          </span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">
          High Rise
        </span>
        <ConfidenceDot confidence={result.confidence} />
        {!hasExtracted && (
          <span className="text-xs text-gray-600 italic">no extraction</span>
        )}
      </div>

      {/* ── Source URL ── */}
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${accentUrl} text-xs hover:underline break-all`}
      >
        {result.url}
      </a>

      {/* ── Content snippet ── */}
      <p className="text-gray-500 text-xs leading-relaxed">
        {result.content.slice(0, 200)}
        {result.content.length > 200 ? "…" : ""}
      </p>
    </div>
  );
}

// ─── Seed Modal ───────────────────────────────────────────────────────────────

function SeedModal({ onClose }: { onClose: () => void }) {
  const seedFromCSV = useMutation(api.projects.seedFromCSV);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setStatus("loading");
    setError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const projects = parseProjectsCSV(text);
      if (projects.length === 0) {
        setError("No valid rows found in CSV.");
        setStatus("error");
        return;
      }
      try {
        const res = await seedFromCSV({ projects });
        setResult(res);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">Seed Projects from CSV</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-400 text-xs leading-relaxed">
          CSV columns: <span className="text-gray-300">project name, developer, state (col 3 or 4), completion year (any column)</span>
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-300 file:text-xs hover:file:bg-gray-600 cursor-pointer"
        />

        {status === "idle" || status === "loading" ? (
          <button
            onClick={handleUpload}
            disabled={status === "loading"}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {status === "loading" ? "Uploading…" : "Upload and Seed"}
          </button>
        ) : null}

        {status === "loading" && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing…
          </div>
        )}

        {status === "done" && result && (
          <p className="text-emerald-400 text-sm">
            {result.inserted} projects added, {result.skipped} skipped (already exist)
          </p>
        )}

        {status === "error" && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab search panel ─────────────────────────────────────────────────────────

function SearchPanel({ searchType }: { searchType: SearchType }) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const searchProjects = useAction(api.search.searchProjects);

  const chips = searchType === "unsold" ? UNSOLD_CHIPS : NEW_LAUNCH_CHIPS;
  const accent =
    searchType === "unsold"
      ? {
          btn: "bg-emerald-600 hover:bg-emerald-500",
          ring: "focus:ring-emerald-500",
          spinner: "text-emerald-400",
        }
      : {
          btn: "bg-amber-600 hover:bg-amber-500",
          ring: "focus:ring-amber-500",
          spinner: "text-amber-400",
        };

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchProjects({ query: q.trim(), searchType });
      setResults(res as SearchResult[]);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChip = (chip: string) => {
    setInput(chip);
    void runSearch(chip);
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto">
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void runSearch(input)}
          placeholder={
            searchType === "unsold"
              ? "Search for unsold developer units…"
              : "Search for new property launches…"
          }
          className={`flex-1 bg-white text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent.ring}`}
        />
        <button
          onClick={() => void runSearch(input)}
          disabled={loading}
          className={`${accent.btn} disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors`}
        >
          Search
        </button>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChip(chip)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-full border border-gray-700 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mt-4">
        {loading && (
          <div className={`flex items-center gap-3 ${accent.spinner} justify-center py-12`}>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm text-gray-400">Searching and extracting data…</span>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-12">No high-rise results found.</p>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {results.map((r, i) => (
              <ResultCard key={i} result={r} searchType={searchType} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<SearchType>("unsold");
  const [showSeedModal, setShowSeedModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <span className="text-white font-bold text-lg tracking-tight">FarCapital Scout</span>
        <span className="bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
          Beta
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowSeedModal(true)}
          className="text-gray-400 hover:text-gray-200 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Seed Projects
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 flex gap-1">
        <button
          onClick={() => setTab("unsold")}
          className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
            tab === "unsold"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Unsold Units
        </button>
        <button
          onClick={() => setTab("new_launch")}
          className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
            tab === "new_launch"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          New Launches
        </button>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col px-4 pt-10 pb-12">
        <SearchPanel key={tab} searchType={tab} />
      </main>

      {showSeedModal && <SeedModal onClose={() => setShowSeedModal(false)} />}
    </div>
  );
}
