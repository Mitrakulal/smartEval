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
│   └── fixtures/             Sample JSON and sample images
│
├── frontend/                 React app (Vite + TypeScript)
│   └── src/                  (created by the Vite scaffold — see below)
│
├── data/                     Runtime uploads — gitignored
│   ├── keys/                 Uploaded answer-key documents
│   └── images/               Captured answer photos, by USN
│
├── docs/                     Documentation
│   ├── SPEC.md               What we build and why
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

Not committed until scaffolded. Create it with:

```bash
npm create vite@latest frontend -- --template react-ts
```

Expected layout afterwards:

| Folder | Put here |
|---|---|
| `src/routes/` | One file per screen: `Setup.tsx`, `Evaluate.tsx`, `Marksheet.tsx` |
| `src/components/` | Reusable UI: `FlagBadge`, `MarkInput`, `KeyPointMatchList` |
| `src/api/` | Generated OpenAPI types + the axios client |
| `src/theme/` | MUI theme, layout, shared style constants |

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
| Sample JSON for mocks | `backend/fixtures/` |
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
