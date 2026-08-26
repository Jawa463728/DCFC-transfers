# Derby County Transfer Hub v3

A static, supporter-made Derby County transfer news site designed for GitHub Pages.

## What changed

- Removed the pink completely.
- Black/white Derby identity with yellow breaking-news treatment.
- White LIVE pill with a pulsating red dot.
- Original heritage-style 1884 ram mark rather than reproducing a modern club logo.
- Deadline countdown is deliberately prominent, with seconds highlighted and a progress bar.
- Large sticky breaking-news ticker.
- No explanatory sidebar: the page is entirely targets + transfer journalism.
- BBC/Sky-style lead story and news-card layout.
- Images are used when the RSS item supplies one; otherwise the site creates a clean yellow story tile rather than showing a broken image.
- Top targets are ranked by the strength/frequency of recent transfer language.
- Completed signings remain in the news feed but are excluded from the targets list.
- Explicit blocklists stop club names and staff such as John Eustace from becoming targets.
- Browser rechecks the generated JSON every two minutes; GitHub Actions attempts a source refresh every five minutes.

## Upload these files

Keep the folder structure exactly as supplied:

```
index.html
styles.css
app.js
data/news.json
scripts/update-news.mjs
.github/workflows/update-news.yml
```

## GitHub setup

1. Open the existing Transfer Hub repository.
2. Replace your old `index.html`, `styles.css` and `app.js` with these versions.
3. Replace `scripts/update-news.mjs`.
4. Replace `.github/workflows/update-news.yml`.
5. Add/replace `data/news.json`.
6. Commit the changes to your default branch.
7. Go to **Settings → Pages**.
8. Under **Build and deployment**, select **Deploy from a branch**.
9. Choose your default branch (normally `main`) and `/ (root)`, then Save.
10. Go to **Actions → Update transfer news → Run workflow** and run it once manually.

After the first successful run, `data/news.json` should contain real stories instead of the supplied demo story.

## The setting that previously causes the updater to fail most often

The workflow needs permission to push the refreshed JSON file.

Go to:

**Settings → Actions → General → Workflow permissions**

Select:

**Read and write permissions**

and save it.

The workflow file also declares `contents: write`, but repository-level restrictions can still prevent the push.

## If it says "waiting for first scan" / no news appears

Open **Actions → Update transfer news**.

A healthy run should finish green and contain a line similar to:

`Wrote 25 stories and 4 targets.`

If the action is red, open it and read the failed step. The two most likely causes are:
- workflow write permission is disabled;
- one of the files/folders is in the wrong place.

## Target false positives

Open `scripts/update-news.mjs`.

Three lists control this:

- `STAFF_BLOCKLIST` — Derby staff/non-player people you never want ranked.
- `PHRASE_BLOCKLIST` — clubs, competitions and publishers.
- `SIGNED_PLAYERS` — players who have already completed a move and therefore must disappear from targets.

The normal news feed does **not** hide completed-transfer coverage.

If an actual target is missed by automatic headline detection, use `MANUAL_TARGETS`, e.g.

```js
const MANUAL_TARGETS = [
  { name: "Joe Bloggs", score: 68, context: "Multiple recent reports" }
];
```

## About the badge

The header uses a newly drawn, generic heritage-style ram/1884 mark created for this project. It does **not** copy the current Derby County badge. Historical club marks can still involve trademark or other rights questions, so this avoids assuming that an old crest is automatically unrestricted.

## Images

Google News RSS does not guarantee article imagery. When a feed item includes an image, the site displays it. When it does not, the site uses a branded story tile. This is intentionally more reliable than scraping publishers' pages for copyrighted images.

## Deadline

The countdown is currently set in `app.js` to:

`1 September 2026, 23:00 BST`

Change the `DEADLINE` value if the official deadline differs.
