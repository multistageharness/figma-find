# Keychain secret store: setup and validation

`figma-find` reads its Figma token from the macOS login keychain through
[`macos-keychain-env`](https://github.com/multistageharness/macos-keychain-env), vendored at `./vendor/macos-keychain-env` relative to
`figma-find/v100/packages/ts`. The directory is git-ignored and excluded from every publish, so each checkout
fetches it once with `make vendor`. This page covers getting that store working and proving that
it works. The resolution rules themselves live in `src/secrets.ts`, a dependency-free mirror of `@internal/figma-api-fetch`'s loader.

Nothing below prints a secret value. Every check reads presence or metadata only.

## 1. Prerequisites

| Requirement | Why |
|---|---|
| macOS | Items live in the login keychain and are read through `/usr/bin/security`. |
| Node.js 20.19 or newer | Engine floor of the vendored package, and the version that lets a CLI load it synchronously (`require` of an ES module). `node --version` |
| `git` and access to github.com | `make vendor` clones the public repository over HTTPS. |
| An unlocked login keychain | Normal for an interactive session. Over SSH it may be locked; see Troubleshooting. |

Linux, CI and any other environment skip the keychain entirely: set `FIGMA_TOKEN` directly and the
loader uses it (`FIGMA_SECRETS_BACKEND=auto`).

## 2. Set up

### 2.1 Fetch the vendored package

```bash
make vendor
```

Clones `KEYCHAIN_ENV_REPO` at `KEYCHAIN_ENV_REF` (default: the repository above, branch `main`)
into `vendor/macos-keychain-env`, or fast-forwards an existing checkout. Both knobs are Makefile
variables, so a tag can be pinned:

```bash
KEYCHAIN_ENV_REF=v0.1.0 make vendor      # a branch or tag name
```

To use a checkout kept elsewhere instead of `vendor/`, point the loader at it:

```bash
FIGMA_KEYCHAIN_ENV_MODULE=/path/to/macos-keychain-env     # directory or its src/index.js
```

### 2.2 Store the token

The token is a Figma personal access token (Figma → Settings → Security). Store it through a
hidden prompt; the value never appears on the command line or in shell history.

```bash
make secret KEY=FIGMA_TOKEN
```

`make secret` wraps `keychain-env set <service> <account>`. The service is
`FIGMA_KEYCHAIN_SERVICE` (default `figma-api`) and the account is the variable name, so every
figma package on this machine shares one item. Two alternatives when a prompt is impractical:

```bash
# value is on the clipboard; cleared afterwards
node vendor/macos-keychain-env/bin/keychain-env.js set figma-api FIGMA_TOKEN --from-clipboard --clear-clipboard
# value arrives on stdin from another program
some-vault-cli read figma/token | node vendor/macos-keychain-env/bin/keychain-env.js set figma-api FIGMA_TOKEN --stdin
```

### 2.3 How the token is resolved

The CLI entry (`src/cli/index.ts`) awaits `loadFigmaSecrets()` before commander runs, so
`--token` and the three environment variables keep their precedence and the keychain only fills a
gap. A store that cannot be read is reported on stderr and the usual "no token" exit 2 follows. The
`@internal/figma-find-api` wrapper in `figma-api` runs this same entry.

Values are layered and a value already present always wins:

1. the process environment: `FIGMA_TOKEN`, `FIGMA_API_TOKEN` or `FIGMA_ACCESS_TOKEN` (CI, a
   shell export, an MCP host's `env` block);
2. the keychain item `figma-api` / `FIGMA_TOKEN`, which fills `FIGMA_TOKEN`.

Only the one item is declared, in code, so no `.env.keychain` manifest is read or needed. The
loader never prints a value; it reports sources and variable names only.

### 2.4 Choosing the backend explicitly

| `FIGMA_SECRETS_BACKEND` | Behaviour |
|---|---|
| `auto` (default) | Keychain when on macOS and the vendored module is found, otherwise the environment only. |
| `keychain` | Keychain required. The CLI reports the missing module on stderr, naming `make vendor`, and exits 2 for lack of a token. |
| `env` | Never touches the keychain. Tests use this. |

Set it in the process environment.

## 3. Validate

Run these from `figma-find/v100/packages/ts` after the setup above. Each step states what a pass looks like.

### 3.1 The vendored package is intact

```bash
git -C vendor/macos-keychain-env log --oneline -1       # the commit you expect
( cd vendor/macos-keychain-env && npm test )            # unit tests against a fake security binary
```

The test suite needs no `npm install` and never touches the real keychain. A pass ends with
`fail 0`; one test is skipped by design.

### 3.2 The expected item exists

```bash
make secrets
```

Prints the service name and one `present` or `missing` line for `FIGMA_TOKEN`, reading no value.
The same check with the exit code as the answer:

```bash
node vendor/macos-keychain-env/bin/keychain-env.js has figma-api FIGMA_TOKEN; echo $?
# 0 = present, 1 = missing
/usr/bin/security find-generic-password -s figma-api -a FIGMA_TOKEN >/dev/null 2>&1; echo $?
# 0 = present, 44 = not found (raw fallback, no package involved)
```

### 3.3 The CLI resolve through the keychain

With no token exported in the shell:

```bash
node dist/cli/index.js pages <key>                                # succeeds: token came from the keychain
FIGMA_SECRETS_BACKEND=env node dist/cli/index.js pages <key>      # exit 2, names the three env vars
```

The contrast is the proof: the only difference between the two commands is whether the keychain
may be consulted. `figma-find` writes nothing but result JSON to stdout, so there is no banner.

### 3.4 Nothing leaks into git or a publish

```bash
git check-ignore -v vendor/macos-keychain-env/package.json   # matched by .gitignore: vendor/
git status --short                                           # vendor/ must not appear
./.ci/sync.sh --dry-run                                      # copy set lists no vendor/ path (where the deploy tool is installed)
```

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `macos-keychain-env was not found ... Run make vendor` | Strict mode without the vendor | `make vendor`, or set `FIGMA_KEYCHAIN_ENV_MODULE` |
| `secrets=env (vendored macos-keychain-env not found ...)` on a Mac | Vendor missing, so `auto` fell back | `make vendor`; confirm with `ls vendor/macos-keychain-env/src/index.js` |
| `secrets=env (FIGMA_TOKEN from environment)` | A token is already exported, so the keychain is not consulted | Intended. Unset it to use the keychain item |
| `UNSUPPORTED_PLATFORM` or `needs macOS` | Keychain lookup attempted off macOS | Set `FIGMA_TOKEN` directly; `auto` already does this |
| `INTERACTION_NOT_ALLOWED` or `security` exit 36 | Login keychain locked (typical over SSH) | `/usr/bin/security unlock-keychain ~/Library/Keychains/login.keychain-db` |
| A GUI prompt, or `TIMEOUT` after 30 s | The item does not trust `/usr/bin/security` | Answer the prompt with *Always Allow*; items created by `make secret` trust it by default |
| `could not load ... synchronously (Node 20.19+ is required)` | A CLI on an older Node cannot `require` the ES-module package | Upgrade Node, or export `FIGMA_TOKEN` |
| `make secrets` shows `missing` right after `make secret` | Different service name | Check `FIGMA_KEYCHAIN_SERVICE` in the environment matches the one used to store |
| `Cannot find module` with a doubled `vendor/...` path | Command run from inside `vendor/macos-keychain-env` | Run from `figma-find/v100/packages/ts`, or use absolute paths |

Error messages from the package never contain secret values.

## 5. Update, pin, remove

```bash
make vendor                           # fast-forward to the latest commit on KEYCHAIN_ENV_REF
KEYCHAIN_ENV_REF=<tag> make vendor    # fresh checkout at a tag (remove the old one first)
rm -rf vendor/macos-keychain-env      # removes the code only; keychain items are untouched
```

Deleting a keychain item is destructive and not reversible:

```bash
node vendor/macos-keychain-env/bin/keychain-env.js delete figma-api FIGMA_TOKEN
```

## 6. Reference

| Variable | Default | Role |
|---|---|---|
| `FIGMA_SECRETS_BACKEND` | `auto` | `auto`, `keychain` or `env` |
| `FIGMA_KEYCHAIN_SERVICE` | `figma-api` | Keychain service that holds the item |
| `FIGMA_KEYCHAIN_ENV_MODULE` | `vendor/macos-keychain-env` (found walking up from the working directory, then from the running script) | Alternate location of the package |
| `KEYCHAIN_ENV_REPO`, `KEYCHAIN_ENV_REF` | the repository above, `main` | Makefile knobs for `make vendor` |

Item read from the keychain, optional at the loader level: `FIGMA_TOKEN`. Each tool then applies
its usual rule: a missing token is a skip for test runners and an error for a live command.

Package documentation: `vendor/macos-keychain-env/README.md` after `make vendor`, or the
repository linked at the top.
