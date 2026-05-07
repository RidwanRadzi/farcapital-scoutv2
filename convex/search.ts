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
  url: string,
  content: string,
): Promise<Omit<ExtractedResult, keyof RawResult> | null> {
  const prompt = `You are a Malaysian property analyst extracting structured data from property search snippets for a bulk acquisition firm. Extract only HIGH-RISE residential projects (condominiums, serviced apartments, SOHO, SoVo) that may have unsold developer stock.

IMPORTANT SIGNALS to detect has_unsold_signal = true:
- Active sales gallery or developer is still selling
- Take-up below 100% mentioned (e.g. "85% sold", "limited units")
- Developer offering rebates, free legal fees, zero downpayment, cashback
- Bumiputera units being released to non-bumi buyers
- "Developer unit", "direct developer", "unit pemaju", "terus pemaju"
- Completed recently (2020-2026) with listings still active

IMPORTANT SIGNALS to detect has_unsold_signal = false:
- "Fully sold", "sold out", "terjual habis"
- Only subsale listings (not developer direct)
- Government affordable housing (RUMAWIP, PR1MA, PPR, Residensi Wilayah)

Source credibility (affects confidence score):
- edgeprop.my, theedge.com.my, jll.com.my, knightfrank.com.my = HIGH confidence
- propertyguru.com.my, iproperty.com.my, nuprop.com = MEDIUM confidence
- Agent/negotiator sites, Facebook, TikTok = LOW confidence

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "project_name": string or null,
  "developer": string or null,
  "area": string or null,
  "state": string or null (KL/SEL/JOH/PEN/NS/etc),
  "completion_year": number or null,
  "is_high_rise": boolean,
  "has_unsold_signal": boolean,
  "confidence": "high" or "medium" or "low"
}

Title: ${title}
URL: ${url}
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
            `${q} kondominium OR condominium OR "serviced apartment" OR SOHO pemaju developer 2020 2021 2022 2023 2024 2025 2026 Malaysia`,
            `${q} rumah kondo apartment servis unit baru pemaju Malaysia 2020 2021 2022 2023 2024 2025`,
            `${q} new property developer high-rise condominium serviced apartment Malaysia completed 2020 2021 2022 2023 2024 2025 2026`,
            `${q} condominium OR "serviced apartment" developer unit Malaysia 2020 2021 2022 2023 2024 2025 2026 nuprop.com`,
            `${q} serviced apartment condominium new property Malaysia developer 2022 2023 2024 2025 2026`,
            `${q} projek perumahan kondominium kondo Malaysia pemaju 2022 2023 2024 2025`,
          ]
        : [
            `${q} new launch condominium OR "serviced apartment" OR SOHO developer 2025 2026 Malaysia`,
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
      "property-for-rent", "untuk-disewa", "for-rent", "sewa",
      "rumawip", "residensi wilayah", "pr1ma", "ppr ",
      "pprt", "rumah mampu milik", "rumah selangorku", "myhome",
      "residensi prihatin", "balloting", "ballot",
      "affordable housing", "kos rendah",
      "foreclosure", "pkns",
    ];

    // Domain priority: lower index = higher priority
    const DOMAIN_PRIORITY = [
      "propertyguru.com.my",
      "edgeprop.my",
      "iproperty.com.my",
      "nuprop.com",
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
        const meta = await extractWithClaude(apiKey, r.title, r.url, r.content);
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

    // Hard filter: drop results with a year clearly outside the valid acquisition window
    const yearFiltered = highRise.filter((r) => {
      const yr = r.completion_year;
      if (yr === null) return true; // unknown year — keep
      if (yr < 2020 || yr > 2027) {
        console.log(`[filter] dropped out-of-range year ${yr}: ${r.url}`);
        return false;
      }
      return true;
    });

    // Sort: extracted project names first, no-extraction results at the bottom
    yearFiltered.sort((a, b) => {
      const aHas = a.project_name !== null ? 0 : 1;
      const bHas = b.project_name !== null ? 0 : 1;
      return aHas - bHas;
    });

    // Deduplicate by project_name: keep highest confidence, then highest domain priority
    const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const byName = new Map<string, ExtractedResult>();
    for (const r of yearFiltered) {
      if (r.project_name === null) continue; // no-name results pass through unchanged
      const key = r.project_name.toLowerCase().trim();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, r);
        continue;
      }
      const rConf = CONFIDENCE_RANK[r.confidence] ?? 2;
      const eConf = CONFIDENCE_RANK[existing.confidence] ?? 2;
      if (rConf < eConf || (rConf === eConf && domainScore(r.url) < domainScore(existing.url))) {
        byName.set(key, r); // incoming is better
      }
    }
    const noName = yearFiltered.filter((r) => r.project_name === null);
    const dedupedByName = [...byName.values(), ...noName];
    const removedDupes = yearFiltered.length - dedupedByName.length;
    if (removedDupes > 0) {
      console.log(`[dedup] removed ${removedDupes} duplicate project name(s)`);
    }

    console.log(
      `[search] deduped=${deduped.length}, high_rise=${highRise.length}, after_year_filter=${yearFiltered.length}, final=${dedupedByName.length} (${byName.size} named, ${noName.length} unnamed)`,
    );
    return dedupedByName;
  },
});
