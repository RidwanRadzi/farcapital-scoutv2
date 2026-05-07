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

function SaveButton({ result }: { result: SearchResult }) {
  const saveProject = useMutation(api.projects.saveProject);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "duplicate">("idle");

  const handleSave = async () => {
    if (status !== "idle") return;
    setStatus("saving");
    try {
      const res = await saveProject({
        name: result.project_name!,
        developer: result.developer ?? "",
        area: result.area ?? undefined,
        state: result.state ?? "",
        completion_year: result.completion_year ?? undefined,
      });
      setStatus(res.status === "duplicate" ? "duplicate" : "saved");
    } catch {
      setStatus("idle");
    }
  };

  if (status === "saved") {
    return <span className="text-xs text-emerald-400 font-medium">Saved ✓</span>;
  }
  if (status === "duplicate") {
    return <span className="text-xs text-amber-400 font-medium">Already exists</span>;
  }
  return (
    <button
      onClick={() => void handleSave()}
      disabled={status === "saving"}
      className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2.5 py-0.5 rounded transition-colors disabled:opacity-50"
    >
      {status === "saving" ? "Saving…" : "Save"}
    </button>
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
  // project_name is guaranteed non-null here (SearchPanel filters before rendering)
  const headline = result.project_name!;

  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3 border border-gray-700">

      {/* ── Headline + duplicate badge + save ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-snug">
            {headline}
          </p>
          {result.title !== result.project_name && (
            <p className="text-gray-500 text-xs truncate">{result.title}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SaveButton result={result} />
          <DuplicateBadge title={headline} />
        </div>
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

// ─── Unverified leads collapsible ─────────────────────────────────────────────

function UnverifiedLeads({ results }: { results: SearchResult[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-xs text-gray-400 font-medium">
          Unverified leads ({results.length})
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col divide-y divide-gray-800">
          {results.map((r, i) => (
            <div key={i} className="px-4 py-3 flex flex-col gap-1 bg-gray-900">
              <p className="text-gray-300 text-xs font-medium leading-snug">{r.title}</p>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-400 text-xs break-all transition-colors"
              >
                {r.url}
              </a>
              {r.content && (
                <p className="text-gray-600 text-xs leading-relaxed">
                  {r.content.slice(0, 150)}{r.content.length > 150 ? "…" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab search panel ─────────────────────────────────────────────────────────

const YEAR_MIN = 2020;
const YEAR_MAX = 2027;

function YearRangeSlider({
  minYear,
  maxYear,
  onChange,
}: {
  minYear: number;
  maxYear: number;
  onChange: (min: number, max: number) => void;
}) {
  const pct = (v: number) => ((v - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
  // When min is at the far right, raise its z-index so it can still be dragged left
  const minZ = minYear === YEAR_MAX ? 5 : 3;
  const maxZ = 4;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Completion year</span>
        <span className="text-xs text-gray-300 font-mono tabular-nums">
          {minYear} – {maxYear}
        </span>
      </div>
      {/* Track + filled range */}
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1 rounded bg-gray-700" />
        <div
          className="absolute h-1 rounded bg-emerald-600"
          style={{ left: `${pct(minYear)}%`, width: `${pct(maxYear) - pct(minYear)}%` }}
        />
        {/* Min handle — pointer-events: none on track, all on thumb via .range-thumb CSS */}
        <input
          type="range"
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={minYear}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), maxYear);
            onChange(v, maxYear);
          }}
          className="range-thumb absolute w-full"
          style={{ zIndex: minZ }}
        />
        {/* Max handle */}
        <input
          type="range"
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={maxYear}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), minYear);
            onChange(minYear, v);
          }}
          className="range-thumb absolute w-full"
          style={{ zIndex: maxZ }}
        />
      </div>
      {/* Tick labels */}
      <div className="flex justify-between text-gray-600 text-xs select-none">
        {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((yr) => (
          <span key={yr}>{yr}</span>
        ))}
      </div>
    </div>
  );
}

function SearchPanel({ searchType }: { searchType: SearchType }) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [minYear, setMinYear] = useState(YEAR_MIN);
  const [maxYear, setMaxYear] = useState(YEAR_MAX);

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

  // Split into named (verified) and unnamed (unverified)
  const named = results.filter((r) => r.project_name !== null);
  const unnamed = results.filter((r) => r.project_name === null);
  const visible = named.filter(
    (r) =>
      r.completion_year === null ||
      (r.completion_year >= minYear && r.completion_year <= maxYear),
  );

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

      {/* Year range slider — only shown after results arrive */}
      {searched && results.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <YearRangeSlider
            minYear={minYear}
            maxYear={maxYear}
            onChange={(mn, mx) => { setMinYear(mn); setMaxYear(mx); }}
          />
        </div>
      )}

      {/* Result count */}
      {!loading && searched && (named.length > 0 || unnamed.length > 0) && (
        <p className="text-xs text-gray-500">
          Showing{" "}
          <span className="text-gray-300 font-medium">{visible.length}</span>
          {" "}verified
          {unnamed.length > 0 && (
            <> + <span className="text-gray-300 font-medium">{unnamed.length}</span>{" "}unverified</>
          )}
          {" "}leads
        </p>
      )}

      {/* Results */}
      <div className="mt-2 flex flex-col gap-4">
        {loading && (
          <div className={`flex items-center gap-3 ${accent.spinner} justify-center py-12`}>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm text-gray-400">Searching and extracting data…</span>
          </div>
        )}

        {!loading && searched && named.length === 0 && unnamed.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-12">No results found.</p>
        )}

        {!loading && named.length > 0 && visible.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">
            No verified results in {minYear}–{maxYear}. Try widening the year range.
          </p>
        )}

        {!loading && visible.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {visible.map((r, i) => (
              <ResultCard key={i} result={r} searchType={searchType} />
            ))}
          </div>
        )}

        {/* Unverified leads collapsible */}
        {!loading && unnamed.length > 0 && (
          <UnverifiedLeads results={unnamed} />
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
