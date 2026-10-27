# tools

Single-page browser utilities, public and MIT-licensed (github.com/margani/tools).
Plain static HTML: no frameworks, no build step, no npm, no CI workflows.

## Rules

- One tool = one folder with a single self-contained `index.html`: inline CSS and JS.
  The only external resources allowed are Google Fonts and CDN scripts pinned to an
  exact version.
- UI text is Persian and RTL (`<html lang="fa" dir="rtl">`).
- Every Persian line must start with a Persian letter, not an emoji, number or Latin
  word, so the bidi algorithm picks RTL. Put emoji at the end of the line.
- Code, comments and file names are in English.
- Light and dark theme through CSS custom properties on `:root`, switched by
  `prefers-color-scheme`. No hard-coded colours inside components; use the tokens.
  Reuse the token names from the existing pages (`--bg`, `--surface`, `--text`,
  `--muted`, `--border`, `--accent`, `--focus`, `--code-bg`) and the Vazirmatn font.
- Must work at phone width (390px) with no horizontal scroll.
- `localStorage` only for small conveniences (e.g. a font size), every access wrapped
  in try/catch. No tracking, no analytics, nothing sent to a server.
- Write non-ASCII characters in JS regexes and strings as `\uXXXX` escapes when they
  matter (Arabic vs Persian ی/ک look identical). In Claude Code sessions, escapes typed
  into a tool call arrive decoded; generate them with a script (`chr(92) + 'u%04X'`) and
  check with `LC_ALL=C grep '[^ -~]'` (2026-10-27).
- Never use `letter-spacing` on Persian text: it breaks the joins between letters. Offer
  `word-spacing` instead (persian-reader's reading settings, #8).
- Links between pages point at `…/index.html` files, so the site also works opened
  straight from disk (`file://`).

## Tabs (root page)

The root `index.html` is a tab workspace: a plain click on a tool card opens the tool
in a new in-page tab (an iframe), so one tool can be open several times next to
others; Ctrl/Shift/middle click still opens a real browser tab. Tabs can be laid out
horizontally or vertically (remembered in localStorage). Open tabs are not restored
after a reload, since their content lives only inside each tab.

Every tool must behave inside a tab:
- When `window.parent !== window`, add the class `embedded` to `<html>` and hide its
  link back to `../index.html` (`.embedded .back { display: none; }`); otherwise that
  link loads the whole workspace inside the tab.
- Optionally name its tab after its content with
  `parent.postMessage({ type: 'tools:title', title }, targetOrigin)`, where
  `targetOrigin` is `location.origin`, or `'*'` only under `file://` (no origin to
  name). An empty title restores the tool's name. See `persian-reader/index.html`.

## Adding a tool

1. Create `<tool-name>/index.html`, with a `.back` link to `../index.html` that is
   hidden when embedded (see Tabs).
2. Add a card for it to the root `index.html`; the card's `<h2>` is the tab name.
3. Add a row for it to the table in `README.md`, with its live URL.

## Hosting and running

- Production: https://tools.whosane.dev, Worker `tools` on the Cloudflare **Hossein**
  account (`cbaf7c8b254ee4af435b9d6e32d2c6f1`), custom domain on zone `whosane.dev`
  (same account). Static assets only, no Worker script. No sandbox.
- The repo root is the site. `.assetsignore` (Cloudflare) and `.dockerignore` (Docker)
  keep docs and config out of it; keep the two files identical, and add any new
  non-site file to both.
- Deploys: a Workers Builds trigger on branch `main`, no build command, deploy command
  `bash scripts/deploy.sh`. It writes `version.json` with the commit and runs
  `wrangler deploy`. Verify a deploy with `https://tools.whosane.dev/version.json`,
  which must name the merged commit. Never deploy by hand.
- Locally: open `index.html`, or `python3 -m http.server 8080`, or
  `docker build -t tools . && docker run --rm -p 8080:80 tools`.
