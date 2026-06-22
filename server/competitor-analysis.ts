export interface CompetitorDomain {
  domain: string;
  score: number;
  sharedKeywords: number;
  avgPosition: number;
  sharedKeywordList: string[];
}

export interface KeywordInsight {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  relatedKeywords: string[];
  competitorCount: number;
  competitorDomains: string[];
}

export interface CompetitorAnalysisResult {
  targetDomain: string;
  discoveredCompetitors: CompetitorDomain[];
  keywordInsights: KeywordInsight[];
}

function getDataForSEOCredentials(): { login: string; password: string } {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables are required");
  }
  return { login, password };
}

function buildAuthHeader(login: string, password: string): string {
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

function normalizeDomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function extractBrandName(domain: string): string {
  return domain.split(".")[0].toLowerCase().trim();
}

function isBrandedKeyword(keyword: string, brandNames: Set<string>): boolean {
  const words = keyword.toLowerCase().trim().split(/\s+/);
  if (words.length === 1 && brandNames.has(words[0])) return true;
  if (words.every(w => brandNames.has(w))) return true;
  if (words.some(w => w.length > 3 && brandNames.has(w))) return true;
  return false;
}

// Domains that are mega-platforms, aggregators, or consumer brands —
// not genuine niche competitors for any business.
const EXCLUDED_DOMAINS = new Set([
  // Search / portals
  "google.com", "bing.com", "yahoo.com", "duckduckgo.com", "baidu.com", "ask.com",
  // Social & UGC
  "youtube.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
  "linkedin.com", "tiktok.com", "pinterest.com", "reddit.com", "quora.com",
  "tumblr.com", "snapchat.com", "discord.com", "twitch.tv", "vimeo.com",
  "medium.com", "substack.com", "beehiiv.com",
  // Reference / wiki
  "wikipedia.org", "britannica.com", "merriam-webster.com", "dictionary.com",
  "thesaurus.com", "wordreference.com",
  // Big tech
  "apple.com", "microsoft.com", "google.com", "amazon.com", "meta.com",
  "github.com", "stackoverflow.com", "developer.mozilla.org", "docs.microsoft.com",
  // Consumer cloud & productivity
  "canva.com", "figma.com", "notion.com", "airtable.com", "trello.com",
  "asana.com", "monday.com", "clickup.com", "basecamp.com", "dropbox.com",
  "box.com", "onedrive.com", "drive.google.com", "docs.google.com",
  "zoho.com", "zendesk.com", "freshdesk.com", "intercom.com",
  // Streaming / music / entertainment
  "spotify.com", "netflix.com", "hulu.com", "disneyplus.com", "hbomax.com",
  "primevideo.com", "peacocktv.com", "pandora.com", "soundcloud.com",
  "deezer.com", "tidal.com", "applemusic.com", "music.amazon.com",
  // News & media
  "bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "washingtonpost.com",
  "wsj.com", "bloomberg.com", "reuters.com", "apnews.com", "theatlantic.com",
  "forbes.com", "inc.com", "entrepreneur.com", "hbr.org", "businessinsider.com",
  "techcrunch.com", "wired.com", "theverge.com", "zdnet.com", "pcmag.com",
  "techradar.com", "tomsguide.com", "cnet.com", "venturebeat.com", "mashable.com",
  "technologyreview.com", "engadget.com", "arstechnica.com", "gizmodo.com",
  // Software review / discovery
  "capterra.com", "g2.com", "getapp.com", "softwareadvice.com", "trustradius.com",
  "gartner.com", "crunchbase.com", "producthunt.com", "alternativeto.net",
  "slashdot.org", "sourceforge.net",
  // E-commerce mega-platforms
  "amazon.com", "ebay.com", "walmart.com", "target.com", "etsy.com",
  "alibaba.com", "aliexpress.com", "shopify.com", "rakuten.com", "wayfair.com",
  "bestbuy.com", "homedepot.com", "lowes.com", "costco.com", "samsclub.com",
  "poshmark.com", "mercari.com", "depop.com", "thredup.com",
  // Travel
  "tripadvisor.com", "booking.com", "hotels.com", "airbnb.com", "expedia.com",
  "vrbo.com", "kayak.com", "priceline.com", "hotwire.com", "travelocity.com",
  "orbitz.com", "mapquest.com", "google.com/maps",
  // Food & delivery
  "doordash.com", "ubereats.com", "grubhub.com", "opentable.com", "seamless.com",
  "postmates.com", "instacart.com", "yelp.com", "zomato.com",
  "allrecipes.com", "food.com", "foodnetwork.com", "epicurious.com", "seriouseats.com",
  "tasteofhome.com", "delish.com",
  // Job boards / HR
  "indeed.com", "glassdoor.com", "monster.com", "ziprecruiter.com",
  "simplyhired.com", "careerbuilder.com", "dice.com", "hired.com", "lever.co",
  "greenhouse.io", "workday.com",
  // Real estate
  "zillow.com", "trulia.com", "realtor.com", "redfin.com", "homes.com", "movoto.com",
  // Automotive
  "cars.com", "autotrader.com", "carmax.com", "edmunds.com", "kbb.com", "cargurus.com",
  // Health / medical
  "healthline.com", "webmd.com", "mayoclinic.org", "medicalnewstoday.com",
  "everydayhealth.com", "verywellhealth.com", "drugs.com", "rxlist.com",
  // Finance / legal
  "investopedia.com", "nerdwallet.com", "bankrate.com", "creditkarma.com",
  "mint.com", "quicken.com", "turbotax.com", "hrblock.com",
  // Education mega-sites
  "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "skillshare.com",
  "linkedin.com/learning", "pluralsight.com", "udacity.com",
  // Adobe & creative suites
  "adobe.com", "behance.net", "dribbble.com",
]);

async function discoverCompetitorsByDomain(
  targetDomain: string,
  authHeader: string
): Promise<CompetitorDomain[]> {
  const tasks = [
    {
      target: targetDomain,
      location_code: 2840,
      language_code: "en",
      limit: 30,
    },
  ];

  const response = await fetch(
    "https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live",
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tasks),
    }
  );

  if (!response.ok) {
    throw new Error(`DataForSEO Domain Competitors API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const competitors: CompetitorDomain[] = [];

  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.status_code !== 20000) {
        console.warn(`[competitor-analysis] competitors_domain error: ${task.status_code} ${task.status_message}`);
        continue;
      }
      if (task.result && task.result[0]?.items) {
        for (const item of task.result[0].items) {
          const domain = item.domain;
          if (!domain || domain === targetDomain) continue;

          const normalized = domain.replace(/^www\./, "").toLowerCase().trim();
          if (normalized === targetDomain) continue;
          if (EXCLUDED_DOMAINS.has(normalized)) continue;

          // Skip if the intersection count is < 5% of the domain's avg_position overlap
          // meaning it barely shares anything with target
          const sharedKeywords = item.intersections || item.relevant_serp_items || 0;
          const avgPosition = item.avg_position || 0;

          competitors.push({
            domain: normalized,
            score: sharedKeywords,
            sharedKeywords,
            avgPosition,
            sharedKeywordList: [],
          });
        }
      }
    }
  }

  competitors.sort((a, b) => b.score - a.score);
  return competitors.slice(0, 10);
}

interface IntersectionKeyword {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
}

interface IntersectionRankItem {
  domain?: string;
  rank_absolute?: number;
}

async function fetchDomainIntersection(
  target1: string,
  target2: string,
  authHeader: string
): Promise<IntersectionKeyword[]> {
  const tasks = [
    {
      target1,
      target2,
      location_code: 2840,
      language_code: "en",
      limit: 100,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
    },
  ];

  const response = await fetch(
    "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live",
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tasks),
    }
  );

  if (!response.ok) {
    console.warn(`[competitor-analysis] domain_intersection failed for ${target1}/${target2}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const results: IntersectionKeyword[] = [];

  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.status_code !== 20000) {
        console.warn(`[competitor-analysis] domain_intersection task error: ${task.status_code} ${task.status_message}`);
        continue;
      }
      if (task.result && task.result[0]?.items) {
        for (const item of task.result[0].items) {
          const kwData = item.keyword_data;
          const kw = kwData?.keyword;
          if (!kw || typeof kw !== "string" || kw.trim().length < 2) continue;

          const normalized = kw.toLowerCase().trim();
          const keywordInfo = kwData?.keyword_info || {};
          const searchVolume = keywordInfo.search_volume || 0;
          const cpc = keywordInfo.cpc || 0;
          const difficulty = kwData?.keyword_properties?.keyword_difficulty ?? 0;
          const rawIntent = kwData?.search_intent_info?.main_intent || "informational";
          const intent = typeof rawIntent === "string" ? rawIntent.toLowerCase().trim() : "informational";

          // Log rank positions for both domains when available
          if (item.items && Array.isArray(item.items) && item.items.length >= 2) {
            const rankItems = item.items as IntersectionRankItem[];
            const r1 = rankItems.find((r) => r.domain === target1)?.rank_absolute;
            const r2 = rankItems.find((r) => r.domain === target2)?.rank_absolute;
            if (r1 != null && r2 != null) {
              console.log(`[competitor-analysis]   "${normalized}" — ${target1}:#${r1} / ${target2}:#${r2}`);
            }
          }

          results.push({ keyword: normalized, searchVolume, cpc, difficulty, intent });
        }
      }
    }
  }

  console.log(`[competitor-analysis] ${target1} ∩ ${target2}: ${results.length} shared keywords`);
  return results;
}

async function fetchKeywordSuggestions(
  keywords: string[],
  authHeader: string
): Promise<Record<string, string[]>> {
  const topKeywords = keywords.slice(0, 5);
  if (topKeywords.length === 0) return {};

  const tasks = topKeywords.map((kw) => ({
    keyword: kw,
    location_code: 2840,
    language_code: "en",
    limit: 6,
  }));

  try {
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tasks),
      }
    );

    if (!response.ok) {
      console.warn(`DataForSEO Keyword Suggestions API warning: ${response.status} ${response.statusText}`);
      return {};
    }

    const data = await response.json();
    const result: Record<string, string[]> = {};

    if (data.tasks) {
      for (const task of data.tasks) {
        const sourceKeyword = (task.data?.keyword as string | undefined)?.toLowerCase().trim();
        if (!sourceKeyword || !topKeywords.includes(sourceKeyword)) continue;

        const suggestions: string[] = [];
        if (task.result && task.result[0]?.items) {
          for (const item of task.result[0].items) {
            const kw = item.keyword_data?.keyword || item.keyword;
            if (kw && typeof kw === "string" && kw.toLowerCase().trim() !== sourceKeyword) {
              suggestions.push(kw.toLowerCase().trim());
            }
            if (suggestions.length >= 5) break;
          }
        }
        result[sourceKeyword] = suggestions;
      }
    }

    return result;
  } catch (err) {
    console.warn("Keyword suggestions fetch failed (non-critical):", err);
    return {};
  }
}

export async function runCompetitorAnalysis(
  targetDomain: string
): Promise<CompetitorAnalysisResult> {
  const { login, password } = getDataForSEOCredentials();
  const authHeader = buildAuthHeader(login, password);

  const normalizedDomain = normalizeDomain(targetDomain);
  if (!normalizedDomain || !normalizedDomain.includes(".")) {
    throw new Error("Invalid domain. Please enter a valid website domain (e.g., example.com)");
  }

  const discoveredCompetitors = await discoverCompetitorsByDomain(normalizedDomain, authHeader);
  if (discoveredCompetitors.length === 0) {
    return { targetDomain: normalizedDomain, discoveredCompetitors: [], keywordInsights: [] };
  }

  const top5Competitors = discoveredCompetitors.slice(0, 5);

  const allDomains = [normalizedDomain, ...discoveredCompetitors.map(c => c.domain)];
  const brandNames = new Set(allDomains.map(extractBrandName));

  // Aggregate shared keywords across all competitors for keywordInsights
  const keywordAggMap = new Map<string, {
    data: IntersectionKeyword;
    competitorDomains: string[];
  }>();

  const enrichedCompetitors: CompetitorDomain[] = [];
  for (const competitor of top5Competitors) {
    const intersection = await fetchDomainIntersection(normalizedDomain, competitor.domain, authHeader);

    for (const kw of intersection) {
      if (isBrandedKeyword(kw.keyword, brandNames)) continue;
      if (kw.intent === "navigational") continue;

      if (keywordAggMap.has(kw.keyword)) {
        const existing = keywordAggMap.get(kw.keyword)!;
        if (!existing.competitorDomains.includes(competitor.domain)) {
          existing.competitorDomains.push(competitor.domain);
        }
      } else {
        keywordAggMap.set(kw.keyword, { data: kw, competitorDomains: [competitor.domain] });
      }
    }

    const filteredIntersection = intersection.filter(
      k => !isBrandedKeyword(k.keyword, brandNames) && k.intent !== "navigational"
    );
    const sharedKeywordList = filteredIntersection.slice(0, 10).map(k => k.keyword);
    const actualSharedCount = filteredIntersection.length;

    enrichedCompetitors.push({
      ...competitor,
      sharedKeywords: actualSharedCount,
      score: actualSharedCount,
      sharedKeywordList,
    });
  }

  const keywordInsights: KeywordInsight[] = [];
  for (const [kw, { data, competitorDomains }] of keywordAggMap) {
    keywordInsights.push({
      keyword: kw,
      searchVolume: data.searchVolume,
      difficulty: data.difficulty,
      cpc: Math.round(data.cpc * 100) / 100,
      intent: data.intent,
      relatedKeywords: [],
      competitorCount: competitorDomains.length,
      competitorDomains,
    });
  }

  keywordInsights.sort((a, b) => {
    if (b.competitorCount !== a.competitorCount) return b.competitorCount - a.competitorCount;
    return b.searchVolume - a.searchVolume;
  });

  const topInsights = keywordInsights.slice(0, 30);

  if (topInsights.length > 0) {
    const topForSuggestions = [...topInsights]
      .sort((a, b) => b.searchVolume - a.searchVolume)
      .slice(0, 5)
      .map(k => k.keyword);
    const suggestions = await fetchKeywordSuggestions(topForSuggestions, authHeader);
    for (const insight of topInsights) {
      insight.relatedKeywords = suggestions[insight.keyword] || [];
    }
  }

  return {
    targetDomain: normalizedDomain,
    discoveredCompetitors: enrichedCompetitors,
    keywordInsights: topInsights,
  };
}
