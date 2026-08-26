const DATA_URL = `data/news.json?v=${Date.now()}`;
const DEADLINE = new Date("2026-09-01T23:00:00+01:00");
const WINDOW_OPEN = new Date("2026-06-14T00:00:00+01:00");

let allStories = [];
let currentFilter = "all";
let visibleCount = 9;

const $ = (s) => document.querySelector(s);
const esc = (v="") => String(v)
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function timeAgo(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Recently";
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function storyType(s) {
  return s.type === "done" ? "DONE DEAL" : s.type === "rumour" ? "RUMOUR" : "TRANSFER NEWS";
}

function placeholderFor(title) {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  const initials = words.slice(0,2).map(w => w[0]).join("").toUpperCase() || "DC";
  return `<div class="story-placeholder" aria-hidden="true">${esc(initials)}</div>`;
}

function imageHTML(s) {
  if (s.image) {
    return `<img src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='${placeholderFor(s.title).replaceAll("'","&#39;")}'">`;
  }
  return placeholderFor(s.title);
}

function renderTicker(stories) {
  const tickerItems = stories.slice(0, 8);
  const text = tickerItems.length
    ? tickerItems.map(s => `<span>${esc(s.title)}</span>`).join("")
    : "<span>Waiting for the next transfer update…</span>";
  $("#tickerTrack").innerHTML = text + text;
}

function colourFor(score) {
  if (score >= 75) return "#168a55";
  if (score >= 50) return "#d98200";
  if (score >= 25) return "#c5a000";
  return "#77777c";
}

function labelFor(score) {
  if (score >= 80) return "STRONG";
  if (score >= 60) return "LIKELY";
  if (score >= 40) return "LIVE RUMOUR";
  if (score >= 20) return "WEAK";
  return "TENTATIVE";
}

function renderTargets(targets=[]) {
  const root = $("#targetsGrid");
  if (!targets.length) {
    root.innerHTML = `<div class="empty-state">No credible player targets have been detected yet. The updater deliberately leaves this blank rather than filling it with club names, staff or completed signings.</div>`;
    return;
  }
  root.innerHTML = targets.slice(0,6).map((t,i) => {
    const score = Math.max(0, Math.min(100, Number(t.score) || 0));
    return `
      <article class="target-card" style="--likelihood-colour:${colourFor(score)}">
        <div class="target-rank">#${i+1} TARGET</div>
        <div class="target-name">${esc(t.name)}</div>
        <div class="target-meta">${esc(t.context || "Linked with Derby County")}</div>
        <div class="target-bottom">
          <div class="strength">${labelFor(score)}<strong>${score}%</strong></div>
          <div class="mentions"><strong>${Number(t.mentions)||1}</strong> recent mention${Number(t.mentions) === 1 ? "" : "s"}</div>
        </div>
      </article>`;
  }).join("");
}

function filteredStories() {
  if (currentFilter === "all") return allStories;
  return allStories.filter(s => s.type === currentFilter);
}

function renderNews() {
  const stories = filteredStories();
  const lead = stories[0];
  const rest = stories.slice(1, visibleCount + 1);

  if (!lead) {
    $("#leadStory").innerHTML = `<div class="empty-state">No stories are available yet. Run the GitHub Action once to populate the live feed.</div>`;
    $("#newsGrid").innerHTML = "";
    $("#loadMore").style.display = "none";
    return;
  }

  $("#leadStory").innerHTML = `
    <div class="lead-story__image">${imageHTML(lead)}</div>
    <div class="lead-story__body">
      <span class="story-tag">${storyType(lead)}</span>
      <a href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer"><h3>${esc(lead.title)}</h3></a>
      <div class="story-summary">${esc(lead.summary || "Read the latest report from the original publisher.")}</div>
      <div class="story-meta"><span>${esc(lead.source || "News source")}</span><span>•</span><span>${timeAgo(lead.published)}</span></div>
    </div>`;

  $("#newsGrid").innerHTML = rest.map(s => `
    <article class="news-card">
      <div class="news-card__image">${imageHTML(s)}</div>
      <div class="news-card__body">
        <span class="story-tag">${storyType(s)}</span>
        <a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer"><h3>${esc(s.title)}</h3></a>
        <div class="story-summary">${esc(s.summary || "")}</div>
        <div class="story-meta"><span>${esc(s.source || "News source")}</span><span>•</span><span>${timeAgo(s.published)}</span></div>
      </div>
    </article>`).join("");

  $("#loadMore").style.display = stories.length > visibleCount + 1 ? "inline-block" : "none";
}

function updateCountdown() {
  const now = new Date();
  const diff = Math.max(0, DEADLINE - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000) % 24;
  const minutes = Math.floor(diff / 60000) % 60;
  const seconds = Math.floor(diff / 1000) % 60;

  $("#days").textContent = String(days).padStart(2,"0");
  $("#hours").textContent = String(hours).padStart(2,"0");
  $("#minutes").textContent = String(minutes).padStart(2,"0");
  $("#seconds").textContent = String(seconds).padStart(2,"0");

  const total = DEADLINE - WINDOW_OPEN;
  const elapsed = now - WINDOW_OPEN;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  $("#deadlineProgress").style.width = `${pct}%`;

  if (diff <= 86400000) document.body.classList.add("deadline-day");
}
setInterval(updateCountdown, 1000);
updateCountdown();

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allStories = Array.isArray(data.stories) ? data.stories : [];
    renderTicker(allStories);
    renderTargets(Array.isArray(data.targets) ? data.targets : []);
    renderNews();

    const updated = data.updatedAt ? timeAgo(data.updatedAt) : "recently";
    $("#targetsUpdated").textContent = updated;
  } catch (err) {
    console.error(err);
    $("#targetsGrid").innerHTML = `<div class="empty-state"><strong>The feed could not load.</strong><br>Check that <code>data/news.json</code> exists and that GitHub Pages is publishing the repository root.</div>`;
    $("#leadStory").innerHTML = `<div class="empty-state">Live news is unavailable right now.</div>`;
  }
}

document.querySelectorAll(".filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter;
    visibleCount = 9;
    renderNews();
  });
});
$("#loadMore").addEventListener("click", () => {
  visibleCount += 9;
  renderNews();
});

loadData();
// Quietly check for new GitHub-generated data every 2 minutes while the page stays open.
setInterval(loadData, 120000);
