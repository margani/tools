# tools

A small collection of single-page browser utilities, each one a self-contained
HTML file. No framework, no build step, nothing sent to a server.

Live: https://tools.whosane.dev

| Tool | What it does | Live |
|---|---|---|
| [Persian reader](persian-reader/) | Paste Persian text (even mixed with English) and read it right-to-left in a clear font, optionally rendered as Markdown. | https://tools.whosane.dev/persian-reader/ |

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

## Hosting

https://tools.whosane.dev is a static-assets Cloudflare Worker (`wrangler.jsonc`),
deployed by Cloudflare Workers Builds on every push to `main` through
`scripts/deploy.sh`. To host a fork on your own account, change `account_id`
and the route in `wrangler.jsonc` and run `npx wrangler deploy`.

## License

[MIT](LICENSE)
