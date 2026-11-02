# tools

A small collection of single-page browser utilities, each one a self-contained
HTML file, in Persian and English. No framework, no build step, nothing sent to a
server.

Live: https://tools.whosane.dev

The home page is a small tab workspace: each tool opens in its own tab, as many
times as you like (two readers with different texts, say), with the tabs along the
top or down the side. The interface follows your browser's language (Persian or
English) and has a switch on every page.

The reader used to live at `/persian-reader/`; that address still forwards to
`/reader/`.

| Tool | What it does | Live |
|---|---|---|
| [Reader](reader/) | Paste Persian or English text (or both) and read it in the right direction and a clear font, plain or rendered as Markdown, with reading settings (font, size, spacing, width, colour themes, reading ruler, focus view). | https://tools.whosane.dev/reader/ |
| [Password generator](pwd-gen/) | A random password of the length and character sets you choose, from `crypto.getRandomValues`, with a strength bar and copy. Nothing is stored or sent. | https://tools.whosane.dev/pwd-gen/ |
| [Azure logs](azure-logs/) | Read Azure Monitor resource logs from your storage account with a SAS token, grouped by resource, with paging and filters. The browser calls Azure Blob Storage directly; the token is never stored. The page explains the CORS rule the account needs. | https://tools.whosane.dev/azure-logs/ |

## Run it yourself

The pages need no server and no Cloudflare. Pick one:

- **Open the file**: open `index.html` in a browser.
- **Local server**: `python3 -m http.server 8080`, then http://localhost:8080
- **Docker**:
  ```sh
  docker build -t tools .
  docker run --rm -p 8080:80 tools
  ```
  then http://localhost:8080

## Tests

`tests/tools.test.cjs` drives the pages in a headless browser with
[Playwright](https://playwright.dev) (Azure is mocked, nothing goes online).
Playwright is not a dependency of the site; install it anywhere and point
`NODE_PATH` at it:

```sh
npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
NODE_PATH=/tmp/pw/node_modules node tests/tools.test.cjs
```

## Hosting

https://tools.whosane.dev is a static-assets Cloudflare Worker (`wrangler.jsonc`),
deployed by Cloudflare Workers Builds on every push to `main` through
`scripts/deploy.sh`. To host a fork on your own account, change `account_id`
and the route in `wrangler.jsonc` and run `npx wrangler deploy`.

## License

[MIT](LICENSE)
