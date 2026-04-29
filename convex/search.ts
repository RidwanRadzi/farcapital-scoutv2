import { action } from "./_generated/server";
import { v } from "convex/values";

type RawResult = { title: string; url: string; content: string };

type ExtractedResult = RawResult & {
  project_name: string | null;
  developer: string | null;
  area: string | null;
  state: string | null;
  completion_year: number | null;
  is_high_rise: boolean;
  has_unsold_signal: boolean;
  confidence: string;
};

async function searchSearXNG(baseUrl: string, q: string): Promise<RawResult[]> {
  const url = `${baseUrl}?q=${encodeURIComponent(q)}&format=json&language=en&limit=10`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error(`[SearXNG] HTTP ${res.status} for query: ${q}`);
      return [];
    }
    const data = await res.json();
    const results = (data.results ?? []).map(
      (r: { title?: string; url?: string; content?: string }) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
      }),
    );
    console.log(`[SearXNG] query="${q.slice(0, 60)}…" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[SearXNG] fetch error for query "${q.slice(0, 60)}…":`, err);
    return [];
  }
}

async function extractWithClaude(
  apiKey: string,
  title: string,
  content: string,
): Promise<Omit<ExtractedResult, keyof RawResult> | null> {
  const prompt = `You are extracting structured data from a Malaysian property search result.
Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Fields to extract:
- project_name: string or null (the property project name, e.g. "Residensi Harmoni")
- developer: string or null (the developer company, e.g. "SP Setia")
- area: string or null (suburb/district, e.g. "Cheras", "Bukit Jalil")
- state: string or null (use abbreviations: KL, SEL, JOH, PEN, NS, KED, SBH, SWK, MLK, TRG, PHG, KTN, PRK, PLS, LBN, PJY)
- completion_year: number or null (4-digit year)
- is_high_rise: boolean (true if condominium/serviced apartment/SOHO/apartment/flat; false if terrace/semi-d/bungalow/townhouse/link house)
- has_unsold_signal: boolean (true if text mentions unsold/overhang/tidak terjual/developer stock/available units from developer)
- confidence: "high" | "medium" | "low"

Title: ${title}
Snippet: ${content.slice(0, 600)}`;

  let responseText = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[Claude] HTTP ${res.status} for title="${title.slice(0, 60)}": ${errBody}`);
      return null;
    }

    const data = await res.json();
    responseText = data.content?.[0]?.text ?? "";
    console.log(`[Claude] raw response for "${title.slice(0, 60)}": ${responseText}`);

    // Strip markdown code fences if present
    const stripped = responseText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[Claude] no JSON object found in response: ${responseText}`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Claude] parsed OK for "${title.slice(0, 60)}":`, JSON.stringify(parsed));

    return {
      project_name: typeof parsed.project_name === "string" ? parsed.project_name : null,
      developer: typeof parsed.developer === "string" ? parsed.developer : null,
      area: typeof parsed.area === "string" ? parsed.area : null,
      state: typeof parsed.state === "string" ? parsed.state : null,
      completion_year:
        typeof parsed.completion_year === "number" ? parsed.completion_year : null,
      is_high_rise: parsed.is_high_rise === true,
      has_unsold_signal: parsed.has_unsold_signal === true,
      confidence:
        parsed.confidence === "high" || parsed.confidence === "medium"
          ? parsed.confidence
          : "low",
    };
  } catch (err) {
    console.error(
      `[Claude] parse error for "${title.slice(0, 60)}": ${err}. Raw response: ${responseText}`,
    );
    return null;
  }
}

export const searchProjects = action({
  args: {
    query: v.string(),
    searchType: v.union(v.literal("unsold"), v.literal("new_launch")),
  },
  handler: async (_ctx, args): Promise<ExtractedResult[]> => {
    const baseUrl = process.env.SEARXNG_URL;
    if (!baseUrl) throw new Error("SEARXNG_URL environment variable is not set");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");

    const q = args.query.trim();

    const queries =
      args.searchType === "unsold"
        ? [
            `${q} condominium OR "serviced apartment" OR SOHO developer unit FOR SALE site:propertyguru.com.my`,
            `${q} kondominium OR "apartment servis" pemaju unit baharu Malaysia 2023 2024 2025`,
            `${q} new property developer launch condominium "serviced apartment" Malaysia site:edgeprop.my OR site:iproperty.com.my`,
          ]
        : [
            `${q} new launch condominium OR "serviced apartment" OR SOHO developer 2025 2026 site:propertyguru.com.my OR site:edgeprop.my`,
            `${q} pelancaran baharu kondominium OR "apartment servis" pemaju Malaysia 2025 2026`,
          ];

    // Run all SearXNG queries in parallel
    const rawBatches = await Promise.all(
      queries.map((qStr) => searchSearXNG(baseUrl, qStr)),
    );

    // Junk patterns to filter out (matched against URL + title, case-insensitive)
    const JUNK = [
      "pdf", "tiktok.com", "facebook.com", "youtube.com",
      "jabatan", "kerajaan", "gov.my", "bernama", "rehda", "napic",
      "planningmalaysia", "subsale", "auction", "lelong",
      "second-hand", "secondhand",
    ];

    // Domain priority: lower index = higher priority
    const DOMAIN_PRIORITY = [
      "propertyguru.com.my",
      "edgeprop.my",
      "iproperty.com.my",
    ];

    function domainScore(url: string): number {
      const idx = DOMAIN_PRIORITY.findIndex((d) => url.includes(d));
      return idx === -1 ? DOMAIN_PRIORITY.length : idx; // lower = better
    }

    // Flatten, deduplicate by URL, and filter junk
    const seen = new Set<string>();
    const deduped: RawResult[] = [];
    for (const batch of rawBatches) {
      for (const r of batch) {
        if (!r.url || seen.has(r.url)) continue;
        const haystack = (r.url + " " + r.title).toLowerCase();
        if (JUNK.some((word) => haystack.includes(word))) {
          console.log(`[filter] skipped junk: ${r.url}`);
          continue;
        }
        seen.add(r.url);
        deduped.push(r);
      }
    }

    // Sort: priority domains first, then everything else
    deduped.sort((a, b) => domainScore(a.url) - domainScore(b.url));
    console.log(`[search] after filter+sort: ${deduped.length} results`);

    // Run Claude extraction in parallel for all results
    const extracted = await Promise.all(
      deduped.map(async (r): Promise<ExtractedResult> => {
        const meta = await extractWithClaude(apiKey, r.title, r.content);
        return {
          ...r,
          project_name: meta?.project_name ?? null,
          developer: meta?.developer ?? null,
          area: meta?.area ?? null,
          state: meta?.state ?? null,
          completion_year: meta?.completion_year ?? null,
          is_high_rise: meta?.is_high_rise ?? true,
          has_unsold_signal: meta?.has_unsold_signal ?? false,
          confidence: meta?.confidence ?? "low",
        };
      }),
    );

    // URL patterns that indicate a category/filter page rather than a specific project
    const CATEGORY_URL_PATTERNS = [
      /\/property-for-sale\/in-/,
      /\/apartment-condo-service-residence-for-sale\//,
      /\/property-listing\//,
      /\/properties-for-sale\//,
      /\/new-property\/?$/,
      /\/new-launches?\/?$/,
      /\/search\?/,
      /[?&](search|q|query|location|district|state|type|category)=/,
      /\/for-sale\/[a-z-]+\/?$/,          // e.g. /for-sale/kuala-lumpur/
      /\/new-property\/[a-z-]+\/?$/,      // e.g. /new-property/selangor/
    ];

    function isCategoryUrl(url: string): boolean {
      const lower = url.toLowerCase();
      return CATEGORY_URL_PATTERNS.some((re) => re.test(lower));
    }

    const highRise = extracted.filter((r) => {
      if (!r.is_high_rise) return false;
      // Keep if Claude extracted a project name
      if (r.project_name !== null) return true;
      // Keep if the URL looks like a specific project page
      if (isCategoryUrl(r.url)) {
        console.log(`[filter] dropped category URL (no extraction): ${r.url}`);
        return false;
      }
      return true;
    });

    // Sort: extracted project names first, no-extraction results at the bottom
    highRise.sort((a, b) => {
      const aHas = a.project_name !== null ? 0 : 1;
      const bHas = b.project_name !== null ? 0 : 1;
      return aHas - bHas;
    });

    console.log(
      `[search] deduped=${deduped.length}, high_rise=${highRise.length} (${highRise.filter((r) => r.project_name !== null).length} with extraction)`,
    );
    return highRise;
  },
});
