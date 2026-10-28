# Folder Structure

This file describes **where things live**. It does not describe behaviour, features, or
requirements — those are in [`SPEC.md`](./SPEC.md).

> **Keep this file current.** If you add, rename, move, or remove a folder, or add a new
> module inside `backend/app/` or `frontend/src/`, update this file **in the same commit**.
> A stale structure file is worse than none.

---

## Tree

```
smartEval/
├── backend/                  Python API + ML pipeline
│   ├── app/
│   │   ├── api/              FastAPI routes and Pydantic models
│   │   ├── core/             Config, database, job worker
│   │   └── ml/               Vision, extraction, embeddings, scoring
│   ├── tests/                pytest tests
│   ├── fixtures/             Sample JSON and sample images
│   └── requirements.txt      Python dependencies (.venv/ is gitignored)
│
├── frontend/                 React app (Vite 8, React 19, TypeScript 5.9)
│   ├── src/                  Application code
│   ├── vite.config.ts        Dev server + /api proxy → localhost:8000
│   └── .env.example          Frontend env template
│
├── data/                     Runtime uploads — gitignored
│   ├── keys/                 Uploaded answer-key documents
│   └── images/               Captured answer photos, by USN
│
├── docs/                     Documentation
│   ├── SPEC.md               What we build and why
│   ├── API_CONTRACT.md       Frontend ↔ backend agreement (frozen)
│   ├── FRONTEND.md           Every screen, element, state and owner (F1/F2)
│   ├── FRONTEND_AGENTS.md    Rules for frontend coding agents
│   ├── FOLDER_STRUCTURE.md   This file
│   └── poster.jpg            Project poster
│
├── spike/                    Throwaway experiments and notebooks
│
├── README.md
└── .gitignore
```

---

## What goes in each folder

### `backend/`

| Folder | Put here | Do **not** put here |
|---|---|---|
| `app/api/` | Route handlers, request/response Pydantic models | Business logic, SQL, model calls |
| `app/core/` | Settings, DB connection + queries, background job worker | ML code, route handlers |
| `app/ml/` | Pure functions: `transcribe(image)`, `score(transcript, key_points)` | `import fastapi`, anything HTTP |
| `tests/` | pytest tests, especially for scoring math | Fixtures, sample data |
| `fixtures/` | `eval_result.json`, sample images used by tests and frontend mock mode | Real student data |

### `frontend/`

Scaffolded with **Vite 8 + React 19 + TypeScript 5.9**. Install with `npm install` inside the folder.

| Path | Purpose |
|---|---|
| `src/main.tsx` | Entry point |
| `src/App.tsx` | Router + layout shell — keep it thin |
| `src/routes/` | One file per screen: `Setup.tsx`, `Evaluate.tsx`, `Marksheet.tsx` *(create when needed)* |
| `src/components/` | Reusable UI: `FlagBadge`, `MarkInput`, `KeyPointMatchList` *(create when needed)* |
| `src/api/` | Generated OpenAPI types + the axios client *(create when needed)* |
| `src/api/mocks/` | **Committed.** Fake responses matching `docs/API_CONTRACT.md`, used when `VITE_MOCK=1` |
| `src/theme/` | MUI theme, layout, shared style constants *(create when needed)* |
| `vite.config.ts` | Dev server config; `/api` proxies to `http://localhost:8000` |
| `.env.example` | Committed template. Real `.env` is gitignored |

> **TypeScript is pinned to 5.9**, not the version the Vite template ships.
> `openapi-typescript` needs the TypeScript 5 compiler API; TypeScript 7 breaks it.

### `data/`

Runtime state only. **Never committed** — only the `.gitkeep` files are tracked so the
folders exist on clone. Wiped freely; nothing here is source code.

### `docs/`

Everything a human or another agent needs to understand the project. New documentation
goes here, never loose in the root.

### `spike/`

Notebooks and one-off scripts to answer a question ("how accurate is extraction?"). Not
imported by the app. Delete or ignore once the question is answered.

---

## Where does a new file go?

| You are writing… | It goes in |
|---|---|
| A new API endpoint | `backend/app/api/` |
| A new scoring rule | `backend/app/ml/score.py` |
| A new database query | `backend/app/core/db.py` |
| A new job type | `backend/app/core/` |
| A new screen | `frontend/src/routes/` |
| A component used by two screens | `frontend/src/components/` |
| A component used by one screen | Inside that screen's file until it's reused |
| An experiment or notebook | `spike/` |
| Sample JSON for mocks | `frontend/src/api/mocks/` (frontend) or `backend/fixtures/` (backend tests) |
| A decision or design note | `docs/` |

---

## Conventions

- **Python:** `snake_case` files and functions. One concern per module.
- **TypeScript:** `PascalCase.tsx` for components, `camelCase.ts` for helpers.
- **One route file per screen.** No screen logic in `App.tsx`.
- **`.gitkeep`** holds empty folders in git. Leave them in place.
- **Imports flow one way:** `api/` → `core/` and `ml/`; `ml/` imports neither.

---

## Change checklist

When you change the structure, also:

1. Update the tree and the tables in this file.
2. Update `.gitignore` if the new path holds generated or runtime files.
3. Add `.gitkeep` if the folder would otherwise be empty.
