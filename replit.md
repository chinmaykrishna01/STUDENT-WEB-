# SpecForge

SpecForge extracts and reviews academic course specifications against only the institutional evidence supplied by the user.

## Run & Operate

- `pnpm run local` — build and run the review dashboard and submission-file generator at `http://localhost:5174`
- `pnpm --filter @workspace/api-server run dev` — build and run the API server (port 5000)
- `pnpm --filter @workspace/specforge run dev` — run the SpecForge web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Production/persistent storage requires `DATABASE_URL` — Postgres connection string. Local development without it uses temporary in-memory storage; analyses are lost when the API server stops.

### Single-address local run

Run this once from the workspace root:

```powershell
corepack pnpm run local
```

Open `http://localhost:5174`. The review dashboard and submission-file generator are available on this same address. Use **Submission files** in the sidebar to generate the scoring JSON and HTML export. The generator API runs on a private loopback port and is proxied through this single browser origin. Press Ctrl+C in the terminal to stop the services. Analyses use temporary in-memory storage unless `DATABASE_URL` is configured, so they are lost when the server stops. The official buildathon sign-in and final upload portal remains externally hosted by its organizers.

For frontend hot reload during development, the API and Vite frontend can still be started separately:

```powershell
$env:PORT = "5000"
corepack pnpm --filter @workspace/api-server run dev
```

In a second terminal:

```powershell
$env:PORT = "5188"
$env:BASE_PATH = "/"
corepack pnpm --filter @workspace/specforge run dev
```

Open `http://localhost:5188`. For persistent analyses, configure `DATABASE_URL` and push the schema before starting the API.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, Vite, TypeScript, Tailwind CSS
- API: Express 5 (the existing workspace API, not FastAPI)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/specforge` — SpecForge React/Vite frontend
- `../specforge-starter` — submission generator frontend and API, mounted locally at `/generator`
- `artifacts/api-server/src/routes/specforge.ts` — upload, analysis, review, mapping, and export-data API routes
- `artifacts/api-server/src/lib/specforge-processing.ts` — deterministic extraction, validation, mapping suggestions, and HTML draft generation
- `lib/api-spec/openapi.yaml` — API contract source of truth; run codegen after changing it
- `lib/db/src/schema/specforge-analyses.ts` — persistent analysis schema

## Architecture decisions

- Uploaded document bytes are processed in memory; analysis records store extracted text and metadata in PostgreSQL, not the original files.
- Validation and mapping suggestions are deterministic and conservative. Institutional policies and mapping scores are used only when compatible evidence is supplied.
- The output preserves a supplied HTML template where supported; generated documents are always labeled as drafts and unresolved fields remain visible.
- The shared Express API is used because it is the existing workspace server; no separate FastAPI service was introduced.

## Product

Users can upload course specifications and optional blueprints, outcome definitions, institutional rules, and HTML templates; review extracted data and validation findings; edit course values; record reviewer decisions; inspect CO–PO/PSO suggestions; and export draft and validation files.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Course documents and optional evidence support PDF, DOC/DOCX, PPTX, XLSX, ODF (ODT/ODP/ODS/ODG), RTF, CSV, TSV, Markdown, TXT, HTML, JSON, EPUB, and TeX, with a 10 MB per-file limit. Legacy Word documents (.doc) are supported. The HTML-template field accepts HTML/HTM only. Legacy binary Excel/PowerPoint files (.xls/.ppt) and scanned documents requiring OCR are not supported.
- Mapping scores above zero require an explicit compatible `mappingRubric` in the supplied institutional-rules JSON.
- A template with no supported `{{PLACEHOLDER}}` or recognized section heading is preserved unchanged and flagged as unresolved rather than silently replaced.
- PDF export uses the browser print dialog; choose “Save as PDF.”

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
