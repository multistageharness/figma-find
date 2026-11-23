# figma-find

CLI + TypeScript SDK for querying Figma files: layer-name search, an
XPath-subset engine, canonical node paths, pages, comments, dev-mode
annotations, dev-resource links, and a federated all-category search.

This is the engine behind
[`figma-find-console`](../../../../figma-find-console/v100/) made
runnable: that console always displayed `figma-find …` command previews, but no
such binary existed anywhere —
[the findings report](../../../../.ai/findings/RCM-figma/figma-find-command-references-20260823-u086q01i4gv9/FINDINGS.md)
established it was fictional. This package implements exactly the grammar those
previews emit.

## Install & quick start

```bash
make install    # npm install
make audit      # typecheck + unit tests + biome (offline, token-free)
npm run build   # tsc → dist/
npx figma-find --help
```

## Commands

All eight subcommands print a JSON result envelope (`--json` is the default and
only format in v100). Examples use the seed validation file via `--input`; drop
`--input` to query the live API instead.

| Command | Example |
| --- | --- |
| `find` | `figma-find find P7gZnWH3DvPDE217ZKcBXU --name Button --input seed.json --json` |
| `xpath` | `figma-find xpath P7gZnWH3DvPDE217ZKcBXU "//FRAME[contains(@name,'Feature')]/TEXT" --input seed.json --json` |
| `path` | `figma-find path P7gZnWH3DvPDE217ZKcBXU 3:12 --input seed.json --json` |
| `pages` | `figma-find pages P7gZnWH3DvPDE217ZKcBXU --input seed.json --json` |
| `comments` | `figma-find comments P7gZnWH3DvPDE217ZKcBXU --query "off-brand" --author dana --unresolved --input seed.json --json` |
| `annotations` | `figma-find annotations P7gZnWH3DvPDE217ZKcBXU --query fold --input seed.json --json` |
| `dev-resources` | `figma-find dev-resources P7gZnWH3DvPDE217ZKcBXU --query storybook --node 2:4 --input seed.json --json` |
| `all` | `figma-find all P7gZnWH3DvPDE217ZKcBXU Headline --input seed.json --json` |

`find` options: `--name <q>`, `--type <a,b>` (raw types plus the `image`/`shape`
aliases), `--mode exact|startsWith|endsWith|regex` (default contains),
`--case-sensitive`, `--page <name>`, `--all-nodes` (include invisible nodes),
`--max <n>` (default 50).

## Auth

Tokens are resolved in this order: `--token <token>`, then the env vars
`FIGMA_TOKEN` → `FIGMA_API_TOKEN` → `FIGMA_ACCESS_TOKEN`. The token is sent as
the `X-Figma-Token` header. Live hydration calls `GET /v1/files/:key`, then
`/comments` and `/dev_resources` (those two degrade to `[]` with a warning if
inaccessible).

When none of those is set, the CLI fills `FIGMA_TOKEN` from the macOS keychain through
[`macos-keychain-env`](https://github.com/multistageharness/macos-keychain-env), vendored at `./vendor/macos-keychain-env`
(`make vendor`, then `make secret KEY=FIGMA_TOKEN`). Setup, validation and troubleshooting:
[docs/keychain-env.md](docs/keychain-env.md).

## Offline mode

`--input <path>` queries a local JSON file — no token, no network. Expected
shape: an object with a `document` node tree (required); `comments`,
`devResources`, `key`, `name`, `lastModified` are optional and default sanely.
Any `GET /v1/files/:key` payload works once wrapped this way; annotations
already ride inside the node tree.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success; result JSON on stdout |
| 1 | Query/user error: validation, XPath syntax, unknown node id |
| 2 | Transport error: missing/rejected token, 404, HTTP, network |

Nothing but result JSON is ever written to stdout.

## XPath subset

- Axes: `/child`, `//descendant`; a bare leading step is an implicit `//`.
- Node test: a node `type` (case-insensitive) or `*`.
- Predicates `[...]`, chained, with position renumbering per step.
- Attributes: `@name`, dotted paths like `@absoluteBoundingBox.width`.
- Comparisons `=` `!=` `<` `<=` `>` `>=` with numeric coercion.
- Functions: `contains`, `icontains`, `starts-with`, `ends-with`, `matches`,
  `position`, `last`, `text`, `name`, `type`.
- Booleans `and` / `or` / `not(...)`; integer predicate = position shorthand.
- Strings quoted with `'` or `"`; double the quote to escape it (`'it''s'`).

## Testing

```bash
npm test                  # offline unit + CLI e2e suites (vitest)
npm run test:integration  # live, manifest-gated: no token ⇒ prints the
                          # commands it would run and exits 0 (skip, not fail)
```

Live keys come only from the repo's `figma-test-manifest`
resolvers — never hardcoded.

## SDK usage

```ts
import {
  buildWalk,
  hydrateFigmaFile, // or loadFigmaFile("./seed.json") for offline
  runQuery,
} from "@internal/figma-find";

const file = await hydrateFigmaFile("<fileKey>");
const walk = buildWalk(file.document, { visibleOnly: true });
const results = runQuery("find", file, walk, {
  query: "Button", strMode: "contains", caseSensitive: false, types: [],
  pageScope: "", maxResults: 50, xpathExpr: "", author: "", mentions: "",
  resolved: "any", nodeId: "",
});
console.log(results.kind, results.count);
```
