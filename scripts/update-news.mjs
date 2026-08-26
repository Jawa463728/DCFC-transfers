import fs from "node:fs/promises";

const OUTPUT = new URL("../data/news.json", import.meta.url);

const FEEDS = [
  {
    name: "Derby County transfer search",
    url: "https://news.google.com/rss/search?q=%22Derby+County%22+transfer+OR+signing+OR+loan+OR+bid+OR+target&hl=en-GB&gl=GB&ceid=GB:en"
  },
  {
    name: "Derby County rumours",
    url: "https://news.google.com/rss/search?q=%22Derby+County%22+rumour+OR+linked+OR+interest&hl=en-GB&gl=GB&ceid=GB:en"
  }
];

// Names that must NEVER become a target.
// Add former/current managers, executives, journalists, etc. here.
const STAFF_BLOCKLIST = [
  "John Eustace", "David Clowes", "Stephen Pearce"
];

// Common club/location/media terms that a naïve name detector can otherwise mistake for players.
const PHRASE_BLOCKLIST = [
  "Derby County", "Blackburn Rovers", "Sheffield United", "Sheffield Wednesday",
  "West Bromwich Albion", "Birmingham City", "Stoke City", "Norwich City",
  "Preston North End", "Bristol City", "Queens Park Rangers", "Wrexham",
  "Middlesbrough", "Southampton", "Wolverhampton Wanderers", "Wolves",
  "Bolton Wanderers", "Portsmouth", "Swansea City", "Cardiff City",
  "Charlton Athletic", "Millwall", "Watford", "Lincoln City", "Burnley",
  "West Ham United", "BBC Sport", "Sky Sports", "Football League World",
  "Derbyshire Live", "Pride Park", "Championship", "League One", "Premier League"
];

// Once a transfer is completed, add the player here.
// They can still appear in normal news; they are simply removed from Targets.
const SIGNED_PLAYERS = [
  // "Player Name"
];

// Optional manual target fixes. Use this when you know a real player is being linked
// but automatic headline extraction has not picked them up.
const MANUAL_TARGETS = [
  // { name: "Player Name", score: 65, context: "Multiple reports" }
];

function decodeXml(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(s = "") {
  return decodeXml(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeXml(m[1]).trim() : "";
}

function atomLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return href?.[1] || tag(block, "link");
}

function parseItems(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map(block => ({
    title: stripHtml(tag(block, "title")),
    link: stripHtml(tag(block, "link")) || atomLink(block),
    description: tag(block, "description"),
    published: tag(block, "pubDate"),
    source: stripHtml(tag(block, "source"))
  }));
}

function cleanGoogleTitle(title) {
  // Google News titles often end " - Publisher".
  return title.replace(/\s+-\s+[^-]{2,55}$/, "").trim();
}

function summaryFromDescription(desc) {
  const clean = stripHtml(desc);
  // Google descriptions can repeat title/source. Keep it short.
  return clean.length > 220 ? clean.slice(0, 217).trimEnd() + "…" : clean;
}

function storyType(title) {
  const t = title.toLowerCase();
  if (/\b(signs|signed|signing confirmed|completes|completed|joins|joined|announces|announced|done deal)\b/.test(t)) return "done";
  if (/\b(linked|target|interest|interested|rumour|rumor|bid|talks|move|deal|eyeing|chasing|pursuit)\b/.test(t)) return "rumour";
  return "news";
}

function extractImage(description = "") {
  // Some RSS descriptions carry a thumbnail. We only use it when present.
  const m = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] || "";
}

function normalizeName(s) {
  return s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function blockedName(name) {
  const n = normalizeName(name).toLowerCase();
  const blocked = [...STAFF_BLOCKLIST, ...PHRASE_BLOCKLIST, ...SIGNED_PLAYERS]
    .map(x => normalizeName(x).toLowerCase());
  if (blocked.includes(n)) return true;
  if (/^(Derby|County|Rams|Transfer|Deadline|Championship)$/i.test(name)) return true;
  return false;
}

function titleCaseCandidateWords(title) {
  // Extract 2–4 consecutive capitalised words. This is deliberately conservative.
  const stop = new Set(["The","A","An","Derby","County","Rams","BBC","Sky","EFL","FC"]);
  const tokens = title
    .replace(/[|:–—()[\],]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const candidates = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2 && run.length <= 4) candidates.push(run.join(" "));
    run = [];
  };

  for (const token of tokens) {
    const word = token.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ'-]+|[^A-Za-zÀ-ÖØ-öø-ÿ'-]+$/g, "");
    const looksNamed = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(word) && !stop.has(word);
    if (looksNamed) run.push(word);
    else flush();
    if (run.length === 4) flush();
  }
  flush();
  return candidates;
}

function targetSignal(story) {
  const t = story.title.toLowerCase();
  let score = 0;
  if (/\badvanced talks|close to|set to sign|agreed terms|medical\b/.test(t)) score += 35;
  if (/\bbid|offer|talks|negotiations\b/.test(t)) score += 25;
  if (/\btarget|interest|interested|keen|chasing|eyeing\b/.test(t)) score += 16;
  if (/\blinked|rumour|rumor|considering|monitoring\b/.test(t)) score += 9;
  if (story.type === "done") score -= 100;
  return score;
}

function buildTargets(stories) {
  const map = new Map();

  for (const story of stories) {
    if (story.type === "done") continue;
    const signal = targetSignal(story);
    if (signal <= 0) continue;

    for (const raw of titleCaseCandidateWords(story.title)) {
      const name = normalizeName(raw);
      if (blockedName(name)) continue;

      // Player names are normally 2–3 words; avoid sentence fragments.
      const words = name.split(" ");
      if (words.length < 2 || words.length > 3) continue;
      if (words.some(w => w.length < 2)) continue;

      const existing = map.get(name) || { name, mentions: 0, points: 0 };
      existing.mentions += 1;
      existing.points += signal;
      map.set(name, existing);
    }
  }

  let auto = [...map.values()]
    .filter(x => x.mentions >= 1)
    .map(x => ({
      name: x.name,
      mentions: x.mentions,
      score: Math.min(92, Math.round(18 + x.points + (x.mentions - 1) * 8)),
      context: x.mentions >= 3 ? "Multiple recent reports" : x.mentions === 2 ? "More than one recent link" : "Fresh media link"
    }))
    .sort((a,b) => b.score - a.score || b.mentions - a.mentions);

  // Manual entries win over auto entries of the same name.
  const manualNames = new Set(MANUAL_TARGETS.map(x => normalizeName(x.name).toLowerCase()));
  auto = auto.filter(x => !manualNames.has(normalizeName(x.name).toLowerCase()));
  return [...MANUAL_TARGETS, ...auto].slice(0, 6);
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DerbyTransferHub/3.0; supporter project)"
    }
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.text();
}

async function main() {
  const items = [];
  for (const feed of FEEDS) {
    try {
      const xml = await fetchText(feed.url);
      items.push(...parseItems(xml));
    } catch (err) {
      console.error(`Feed failed: ${feed.name}`, err);
    }
  }

  const seen = new Set();
  const stories = items
    .map(item => ({
      title: cleanGoogleTitle(item.title),
      link: item.link,
      source: item.source || "Google News",
      published: item.published ? new Date(item.published).toISOString() : new Date().toISOString(),
      summary: summaryFromDescription(item.description),
      image: extractImage(item.description),
      type: storyType(item.title)
    }))
    .filter(s => /derby county/i.test(s.title + " " + s.summary))
    .filter(s => {
      const key = s.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b) => new Date(b.published) - new Date(a.published))
    .slice(0, 60);

  const targets = buildTargets(stories);

  const data = {
    updatedAt: new Date().toISOString(),
    targets,
    stories
  };

  await fs.writeFile(OUTPUT, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${stories.length} stories and ${targets.length} targets.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
