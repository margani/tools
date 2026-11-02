# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily the owner: a personal toolbox for everyday tasks (reading Persian and English
text, making passwords, reading Azure resource logs). It is published openly at
https://tools.whosane.dev, so anyone can use it, but the owner's own work is what each
tool is designed around.

## Product Purpose

Small single-page browser utilities that each do one job well and open instantly. A
tool succeeds when it gets the job done in the page, at once, without anything leaving
the browser.

## Positioning

A Persian-first, bilingual toolbox where every tool is one self-contained page and
nothing the visitor enters (text, passwords, tokens, logs) is sent to or kept by a
server of ours.

## Operating Context

- Used on desktop and phone; tools open on their own or as tabs in the root page's tab
  workspace (several tabs of one tool side by side).
- Works from the website, from a local server, from Docker, or opened straight from disk
  (`file://`).
- Some tools talk directly to a third-party service chosen by the visitor (the Azure
  logs reader calls Azure Blob Storage with the visitor's own SAS token).

## Capabilities and Constraints

Binding promises for every tool (confirmed by the owner, 2026-11-02):

- **Nothing leaves the browser.** No server of ours, no tracking, no analytics; data and
  secrets stay in the page. `localStorage` only for small preferences, never for
  secrets.
- **Persian-first bilingual.** Persian and English are equals; RTL is done right and
  Persian text is never broken (no `letter-spacing`, correct bidi).
- **One file, no build.** Each tool is a single self-contained `index.html` with inline
  CSS and JS, no framework, no build step; only pinned CDN scripts and Google Fonts.
- **No sign-up, instant use.** A tool opens and works immediately, with no account and
  no onboarding.

Current tools: Reader (`reader/`), Password generator (`pwd-gen/`), Azure logs
(`azure-logs/`). Engineering rules live in `CLAUDE.md`.

## Brand Commitments

- Name: "Tools" / «ابزارها», at tools.whosane.dev; MIT-licensed, source on GitHub
  (margani/tools).
- Voice: plain, short, practical; the same meaning in both languages.

## Evidence on Hand

No testimonials, usage numbers or third-party endorsements exist; do not invent any.

## Product Principles

1. Privacy is structural, not a setting: a tool that needs a server is not a tool here.
2. Persian and English get the same care; neither is a translation afterthought.
3. One job per tool, usable in seconds.
4. Each tool stays a single file that works anywhere, including from disk.

## Accessibility & Inclusion

WCAG 2.2 AA is the required standard for every tool (confirmed by the owner,
2026-11-02), in both languages and directions, at desktop and phone width.
