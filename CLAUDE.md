# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

J.A.R.V.I.S. is Riccardo's personal PWA (Progressive Web App) for managing household/personal admin data — contracts, subscriptions, vehicles, documents, credentials, contacts, and a family car-related expense tracker ("AutoPapà"). It's a single-user (or small family), Iron-Man-HUD-themed dashboard, in Italian.

It is a **static, buildless site**: plain HTML/CSS/JS with no bundler, no package manager, and no build step. Deployed as-is (e.g. GitHub Pages) at `jarvis.costariccardo.com` (see `CNAME`).

## Commands

There is no build/lint/test tooling in this repo (no `package.json`). To develop:

- Serve the directory with any static file server and open `index.html`, e.g. `npx serve .` or `python -m http.server`.
- A plain `file://` open mostly works but the service worker (`sw.js`) and some fetches behave better over `http://`.
- There is no automated test suite — verify changes manually in the browser (login flow, each section's CRUD, PDF export).

## Architecture

### Files

- `index.html` — the entire UI: login screen + app shell (topbar, sidebar nav, one `#view-*` div per section) + all CSS, inlined in `<style>`. Loads Leaflet, jsPDF/jspdf-autotable, and the Supabase JS client from CDNs, then `config.js` and `app.js`.
- `config.js` — Supabase project URL + anon key (client-side, public by design for the anon key).
- `app.js` — all application logic (~1400 lines), organized by `// ---------- SECTION ----------` comment banners (see below).
- `sw.js` — service worker: network-first fetch strategy with cache fallback, for offline PWA support. Cache list (`CORE_ASSETS`) must be kept in sync if core file names change.
- `manifest.json` — PWA manifest (icons, theme colors, standalone display).
- `compilatore.js` — a large, **self-contained** contract-transfer ("Cessione Contratto") PDF form-filler: signature pad, drag-and-drop signature/stamp placement over a rendered PDF template, pdf-lib-based PDF generation, autofill memory via `localStorage`, embeds a base64 handwriting font. It is **not currently loaded by `index.html` or referenced by `app.js`** — treat it as a standalone/WIP module, not dead code to delete without checking with the user first.
- `welcome_riccardo.mp3` — per-user login greeting audio (see Voice welcome below).

### Data model: generic "sections" over Supabase

The app is built around a generic pattern for CRUD sections, defined by the `SECTIONS` registry in `app.js`:

```js
SECTIONS = {
  contratti:    { table: "contratti",            camposTable: "contratti_campi", ... },
  abbonamenti:  { table: "abbonamenti",           camposTable: "abbonamenti_campi", ... },
  veicoli:      { table: "veicoli",               camposTable: "veicoli_campi", ... },
  documenti:    { table: "documenti",             camposTable: "documenti_campi", ... },
  accessi:      { table: "accessi",               camposTable: "accessi_campi", ... },
  contatti:     { table: "anagrafica_contatti",    camposTable: "contatti_campi", ... },
  autopapa:     { table: "autopapa_pagamenti",     camposTable: "autopapa_campi", ... },
}
```

Each section has two Supabase tables:
- a **records** table (`table`) with a JSON `dati` column holding the actual field values, plus `user_id`, `id`, `created_at`;
- a **field-definitions** table (`camposTable`, e.g. `contratti_campi`) describing the dynamic schema for that section (`chiave`, `etichetta`, `tipo`, `ordine`, `mostra_in_tabella`), seeded from `DEFAULT_CAMPI_*` constants on first load via `ensureCampi()`.

This means most sections are **not hardcoded forms** — the table columns, record modal fields, and CSV/PDF export columns are all driven by the `campi` (fields) row data, rendered generically (`renderTable`, `openRecordModal`, `openCampiModal`, `buildCampoRow`). When adding a new field to an existing section, prefer adding/editing a row in the relevant `DEFAULT_CAMPI_*` array (or via the in-app "manage fields" modal) rather than special-casing it in render code — unless it needs special behavior (see `computedField`, `periodicityField`, `birthdayField`, `sortField`, `notaOptions` per-section options).

`autopapa` is the one section with extra bespoke logic (`autopapa_impostazioni` table for settings, `renderAutopapaSummary`, financing/installment calculations).

### Key subsystems in `app.js`

- **Auth**: Supabase email/password auth (`sb.auth.signInWithPassword`), no signup UI wired currently despite the function name `handleLoginOrSignup`. Session is not persisted (`persistSession: false` in `config.js`) — reauth on every load.
- **Core animation**: `renderCoreAnim` builds a shared SVG "arc reactor" HUD animation (used in both login and home), driven by CSS classes (`assembling`, `charging`, `bursting`) toggled during `playLoginTransition`.
- **Voice welcome**: `VOICE_FILES` maps known user emails to a personal `.mp3` greeting; unmapped users fall back to `speechSynthesis` (Italian male voice heuristic in `getBestItalianMaleVoice`).
- **Weather/radar**: `loadWeather` uses Open-Meteo (geolocation-based, no API key); `fetchRadarFrames`/`initRadar` overlay RainViewer precipitation radar on a Leaflet map.
- **Deadlines & birthdays**: on login, scans all sections' records for date-typed fields to surface upcoming birthdays (`contatti.compleanno`) and expiring items (30-day window) as startup popups/banners.
- **PDF export**: `exportSectionPDF` uses jsPDF + jspdf-autotable to export a section's table.
- **Modals**: `openRecordModal`/`saveRecord`/`deleteRecord` (generic record CRUD) and `openCampiModal`/`saveCampi` (generic field-schema editor) are reused across all sections via the `SECTIONS` config rather than per-section modal code.

### Conventions

- Italian throughout: variable names, UI copy, comments. Keep new code/UI consistent with this (e.g. `chiave`/`etichetta`/`tipo` not `key`/`label`/`type`).
- No frameworks — direct DOM manipulation (`document.getElementById`, template strings for HTML), no virtual DOM/JSX.
- Supabase is the only backend; there is no server-side code in this repo — RLS/policies live in the Supabase project, not here.
