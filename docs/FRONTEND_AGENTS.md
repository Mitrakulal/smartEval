# Frontend — Scope and Agent Rules

Read this before writing any frontend code. It covers what to build, what **not** to
touch, and how to commit.

Contract: [`API_CONTRACT.md`](./API_CONTRACT.md)

---

## 1. Hard boundaries

**Never modify these.** They belong to the backend pair.

```
backend/**
data/**
docs/API_CONTRACT.md        ← propose changes, don't edit unilaterally
```

Also never:

- run `npm` / `node` inside `backend/`
- create Python files anywhere
- change an API field name, add a field, or "fix" a response shape in the mock files to match what you wish the backend returned
- commit `.env`, `node_modules/`, `dist/`

If a response doesn't match the contract, that's a **bug report**, not an invitation to
adapt. See [§8](#8-when-the-contract-is-wrong).

---

## 2. What to build

**Read [`FRONTEND.md`](./FRONTEND.md) first.** It lists every screen, every element,
every state, every hook, and the F1/F2 split. This section is only the summary.

| Screen | Route | Owner | Purpose |
|---|---|---|---|
| Setup | `/setup` | **F1** | Upload key → parse → confirm questions and key points |
| Evaluate | `/evaluate` | **F2** | USN → photo per question → transcript + markers → accept/override |
| Marksheet | `/marksheet` | **F1** | All students, totals, export CSV, approve |

**F1 additionally owns the foundation:** `App.tsx`, `src/theme/`, `src/layout/`,
`src/api/`, routing, and mock mode. Nothing else starts until that exists.

**F2 owns `src/routes/Evaluate.tsx` and `src/components/evaluate/`.**

**Shared components:** `FlagBadge` and `MarkInput` are built by F2 and imported by F1.
F1 does not edit them.

---

## 3. Mock data first

The backend does not exist yet. Build against:

```
frontend/src/api/mocks/*.json
```

Mapping to endpoints is at the bottom of [`API_CONTRACT.md`](./API_CONTRACT.md).

Implement one switch in `src/api/client.ts`:

```
VITE_MOCK=1  →  return the matching JSON from src/api/mocks/
VITE_MOCK=0  →  real HTTP
```

Mock mode must survive the whole project. It is what lets you demo if the backend
breaks, and what lets the other pair work independently.

Never delete the mocks.

---

## 4. Theme and styling

**Do not design anything.** There is no design system to invent.

`src/theme/theme.ts` may contain only:

- palette (primary, secondary, background, error)
- spacing scale
- border radius
- typography scale

Everything else: **MUI defaults.**

- No `styled-components`, no CSS modules, no Tailwind
- No custom fonts
- No animations or transitions beyond MUI defaults
- No dark mode toggle
- Use `sx` for one-off margins/padding. `style={{}}` only for dynamic values (e.g. widths from data)

If a design reference (screenshot, Figma) is provided later, translate it into
`theme.ts` tokens **once**. Do not restyle components one by one.

Aim for "clean internal tool", not "product launch". Plain cards, plain tables,
default MUI buttons.

---

## 5. Code rules

| Rule | Detail |
|---|---|
| Language | TypeScript, strict. **No `any`** — use `unknown` and narrow |
| Components | Function components + hooks only. One component per file. Named exports |
| Data fetching | Always through TanStack Query hooks in `src/hooks/`. No `fetch`/`axios` inside a component |
| Types | Generated from the backend's OpenAPI. Do not hand-write response types |
| State | Query for server state, `useState`/context for UI. No Redux, no Zustand |
| Errors | Every query/mutation renders an error state. No silent catches |
| Dependencies | **Ask before adding any.** The list in `package.json` is the budget |
| Console | No `console.log` in committed code |

---

## 6. Commit protocol

**Commit as each unit finishes. Not one big commit at the end.**

### Rules

1. **One commit = one finished unit** — a component with all its states, a hook, a
   page section. Not "half of Page 2".
2. **Never commit code that doesn't build.** Run `npm run build` before every commit.
3. **Push immediately** after committing. Unpushed work does not exist.
4. **Never** commit `node_modules/`, `dist/`, `.env`, or editor files.
5. **No "final" commit.** If you catch yourself thinking "I'll commit everything when
   it's done", stop — that's the failure mode this rule exists to prevent.

### Branching

Short-lived branches, one per unit:

```
feat/f1-setup-upload
feat/f2-evaluate-polling
fix/f1-confirm-validation
```

Merge to `main` when the build passes. Delete the branch. Do not keep long-lived
branches — the two of you touch disjoint files, so merges should be trivial.

### Message format

```
feat(frontend): add key upload dropzone
feat(frontend): add question editor with validation
fix(frontend): stop job polling after error status
chore(frontend): generate api types from openapi
```

### Before every commit

```powershell
npm run build     # must pass
git status        # no node_modules, dist, .env
```

---

## 7. Definition of done

A screen is done when **all** of these are true:

- [ ] Renders with `VITE_MOCK=1`
- [ ] Renders with the real backend, if it exists
- [ ] Loading state exists
- [ ] Empty state exists (no students, no key uploaded)
- [ ] Error state exists (network fail, 409, 422)
- [ ] Every button either works or is visibly disabled
- [ ] Form validation blocks bad input
- [ ] `npm run build` passes
- [ ] No console errors
- [ ] Committed and pushed

A screen with a happy path and no error handling is **not** done. Error states are
half the work in a grading tool — the backend *will* return 409s.

---

## 8. When the contract is wrong

You will hit this. Assume the contract is right and the backend is wrong until
proven otherwise.

1. Don't change the field name locally.
2. Message the backend pair with: endpoint, expected shape, actual shape.
3. If the contract genuinely needs to change, **both** sides update together:
   edit `docs/API_CONTRACT.md`, bump the version, regenerate types.
4. Only then update the mock files.

Silent deviation is the one thing that will cost you a week.

---

## 9. Not in scope

Charts · auth · search · pagination · dark mode · i18n · animations · unit tests ·
bulk upload · mobile app · multi-exam · anything in [`SPEC.md`](./SPEC.md) §18.

If someone suggests one of these mid-project, the answer is in `SPEC.md`.
