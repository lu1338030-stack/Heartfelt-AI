# AGENTS.md

A [Mastra](https://mastra.ai/) TypeScript project. Bootstrapped scaffold with one
example domain ("weather") spanning an agent, tool, workflow, and scorers.

## CRITICAL: Load the `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge —
the `@mastra/*` APIs change between versions and this repo tracks `@mastra/core@^1.50`.

## Commands

```bash
npm run dev      # mastra dev — Studio at http://localhost:4111, hot reload
npm run build    # mastra build — compile to .mastra/output
npm start        # mastra start — run the built server
```

Use the npm scripts above, NOT `mastra dev` / `mastra build` directly.

- **No test framework is configured.** `npm test` is a placeholder that exits 1.
  If you add tests, pick a runner (vitest recommended for ESM/TS), add it to
  `devDependencies`, and create a real `test` script. Until then, verify changes
  via `npm run build` and exercising the agent in Studio.
- **No `tsconfig.json` at the repo root.** The Mastra CLI supplies TypeScript
  defaults during `dev`/`build`. Do not add a `tsconfig.json` unless you also
  wire it into the build — it will not be picked up automatically.
- **Node >= 22.13.0** required (`engines` in `package.json`).
- **ESM only** — `"type": "module"`. Top-level `await` is permitted (used in
  `src/mastra/index.ts`).

## Project layout

```
src/mastra/
  index.ts            # Mastra registry — wire EVERYTHING here
  agents/<name>.ts    # one Agent per file
  tools/<name>.ts     # one tool per file
  workflows/<name>.ts # one workflow per file; call .commit() at the end
  scorers/<name>.ts   # scorers; also export a `scorers` bag object
```

- Every new agent, tool, workflow, and scorer MUST be registered in
  `src/mastra/index.ts` (pass to `new Mastra({ agents, tools, workflows,
  scorers, storage, logger, observability })`).
- Re-export related scorers as a grouped `scorers` object from the scorer file
  (see `weather-scorer.ts`) so agents can spread them in.

## Code style

These reflect the actual conventions in `src/mastra/**`. Follow them.

### Imports

1. External packages first (`@mastra/core/...`, `@mastra/memory`, `zod`), then
   relative imports.
2. Use the documented sub-path imports — e.g. `@mastra/core/mastra`,
   `@mastra/core/agent`, `@mastra/core/tools`, `@mastra/core/workflows`,
   `@mastra/core/storage`, `@mastra/core/evals`, `@mastra/evals/scorers/*`.
3. Prefer **single quotes**; double quotes appear in places — match the file
   you are editing.
4. Named imports only. No default imports from `@mastra/*`.

### Naming

| Element | Convention | Example |
|---|---|---|
| File | `kebab-case.ts` | `weather-agent.ts` |
| Exported const | `camelCase` | `weatherAgent`, `weatherTool` |
| Agent/tool/workflow `id` | `kebab-case` string | `'weather-agent'`, `'get-weather'` |
| Agent `name` (display) | Title Case | `'Weather Agent'` |
| Interface / type | `PascalCase` | `GeocodingResponse` |
| Local function | `camelCase` | `getWeatherCondition` |
| Zod schema | `camelCase` + `Schema` suffix | `forecastSchema` |

### Exports

- **Named exports only.** No `export default` anywhere in the codebase.
- Each domain file exports its primary object plus any sibling helpers it owns
  (e.g. the `scorers` bag).

### Formatting

- **No semicolons** (a couple of files have strays — remove them when you touch
  the line; do not mass-reformat unrelated code).
- 2-space indentation.
- Trailing commas in multi-line objects/arrays are inconsistent — keep what the
  surrounding file does.
- Template literals (backticks) for any string that includes interpolation or
  spans multiple lines (prompt text, URLs with `${var}`).

### TypeScript

- Target: modern Node ESM. Use `interface` for object shapes, `type` for unions.
- **Define Zod schemas for ALL tool and workflow input/output** —
  `inputSchema` / `outputSchema` are mandatory, not optional. Add `.describe()`
  on each field so the model gets field semantics.
- Type external API JSON with an `interface` and cast via `as` after `.json()`
  (see `weather-tool.ts`).
- **Never use `as any`, `@ts-ignore`, or `@ts-expect-error` to suppress errors.**
  Fix the type. (One `as any` exists in `weather-scorer.ts` for a prebuilt
  scorer result — treat it as tech debt to remove, not a pattern to copy.)
- Prefer `async`/`await`. Never `.then()`/`.catch()` chains.
- Exported functions that hit the network are `async` and return typed data.

### Error handling

- Validate with `if (!x) throw new Error(...)` guards at the top of `execute`.
- Throw `new Error('...')` with a descriptive message (template literal when
  interpolating values). Example: `throw new Error(\`Location '${location}' not found\`)`.
- Do **not** wrap scaffolds in try/catch unless you can meaningfully recover —
  Mastra surfaces thrown errors through its own pipeline.

### Agents

- Construct with `new Agent({ id, name, instructions, model, tools, memory, scorers })`.
- `model` is a `'provider/model-name'` string (e.g. `'openai/gpt-5-mini'`),
  not a model object.
- `instructions` is a backtick template literal; keep the bulleted "When
  responding" style for new agents.
- Default memory: `new Memory()` unless you need a custom config.
- Wire scorers via the `{ [key]: { scorer, sampling: { type: 'ratio', rate } } }` shape.

### Tools

- Build with `createTool({ id, description, inputSchema, outputSchema, execute })`.
- `execute: async ({ inputData }) => ...` for workflows, or
  `execute: async (inputData) => ...` for tools — destructure per the call site.
- Keep the tool pure: fetch + transform + return a typed object. No logging.

### Workflows

- Build with `createWorkflow(...).then(stepA).then(stepB)` and end with
  **`workflow.commit()`** — forgetting this silently breaks the workflow.
- Steps via `createStep({ id, description, inputSchema, outputSchema, execute })`.
- Reach an agent inside a step with `mastra?.getAgent('<id>')`; guard for
  `undefined` and throw a clear error if missing.
- Stream an agent's output with `for await (const chunk of response.textStream)`.

### Scorers

- Prefer prebuilt scorers from `@mastra/evals/scorers/prebuilt` before writing
  a custom one.
- Custom scorers: `createScorer(...)` chained with `.preprocess()`,
  `.analyze({ outputSchema, createPrompt })`, `.generateScore()`,
  `.generateReason()`. Score must be a number in `[0, 1]`.

## Environment

- Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. `.env` is gitignored.
- Storage: LibSQL at `./mastra.db` (default domain) + DuckDB for observability.
  Both DB files (`*.db`, `*.duckdb`, `*.duckdb.wal`) are gitignored — safe to delete.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- Studio: http://localhost:4111 while `npm run dev` is active.
