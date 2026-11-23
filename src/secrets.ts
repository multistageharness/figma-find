// Mirror of `@internal/figma-api-fetch`'s secrets loader
// (figma-api/v100/packages/ts/figma-fetch/src/secrets/index.ts). Dependency-free on
// purpose, so this package resolves its token the same way without depending on
// the SDK; keep the two in step.
/**
 * Secret store for the Figma token.
 *
 * Values are layered; a value already present always wins:
 *   1. process environment — FIGMA_TOKEN / FIGMA_API_TOKEN / FIGMA_ACCESS_TOKEN
 *      (CI, a shell export, an MCP host's `env` block)
 *   2. macOS login keychain — through `macos-keychain-env`, vendored at
 *      `./vendor/macos-keychain-env` (`make vendor` fetches it), as the generic
 *      password item service = FIGMA_KEYCHAIN_SERVICE (default "figma-api"),
 *      account = FIGMA_TOKEN. `make secret KEY=FIGMA_TOKEN` stores it.
 *
 * FIGMA_SECRETS_BACKEND chooses the store that fills the gap:
 *   auto      (default) keychain when on macOS and the vendored module is found, else env;
 *             a store that cannot be read (locked keychain, timeout) also falls back to env
 *             and the result says why, so a CLI still runs with --token or offline
 *   keychain  require the keychain; fail if the module is missing
 *   env       never touch the keychain (tests, CI, Linux)
 *
 * The vendored module is looked up, most specific first, at
 * FIGMA_KEYCHAIN_ENV_MODULE (a directory or its src/index.js), then
 * `vendor/macos-keychain-env` walking up from the working directory, then from
 * the directory of the running script, then as an installed `macos-keychain-env`
 * package. Nothing in this module prints or logs a secret value.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

export type SecretsBackend = "keychain" | "env";

/** Variables that may carry the token, in the SDK's precedence order. */
const TOKEN_VARS = ["FIGMA_TOKEN", "FIGMA_API_TOKEN", "FIGMA_ACCESS_TOKEN"];

/** Variables looked up in the keychain (account = name). Optional at this level. */
export const KEYCHAIN_KEYS = ["FIGMA_TOKEN"] as const;
export const DEFAULT_KEYCHAIN_SERVICE = "figma-api";
export const VENDORED_MODULE_RELATIVE =
  "vendor/macos-keychain-env/src/index.js";

/** The slice of macos-keychain-env used here (full API: vendor/macos-keychain-env/index.d.ts). */
interface KeychainEnvModule {
  loadEnv(opts: LoadEnvArgs): Promise<LoadEnvResult>;
  loadEnvSync(opts: LoadEnvArgs): LoadEnvResult;
}
interface LoadEnvArgs {
  entries: Record<
    string,
    { service: string; account: string; optional?: boolean }
  >;
  service?: string;
  manifest?: string | false;
  override?: boolean;
  target?: Record<string, string | undefined>;
  timeoutMs?: number;
}
interface LoadEnvResult {
  loaded: string[];
  skipped: string[];
  missing: string[];
}

export interface SecretsInfo {
  backend: SecretsBackend;
  /** Keychain service in use (keychain backend only). */
  service?: string;
  /** Module the keychain was read through (keychain backend only). */
  modulePath?: string;
  /** Variable names filled from the keychain. Names only, never values. */
  loaded: string[];
  /** Variables left alone because the environment already had them. */
  skipped: string[];
  /** Keychain items that were looked up and not found. */
  missing: string[];
  /** Why the env backend was used, when it was not asked for. */
  reason?: string;
}

export interface LoadSecretsOptions {
  /** Environment to read knobs from and write the token into (default process.env). */
  env?: Record<string, string | undefined>;
  /** Start of the working-directory walk (default process.cwd()). */
  cwd?: string;
  /** Running script whose directory is walked too (default process.argv[1]). */
  entry?: string;
  /** Platform under test (default process.platform). */
  platform?: NodeJS.Platform;
  /** Per-lookup timeout, covering a keychain access prompt (default 30 s). */
  timeoutMs?: number;
  /** Also try an installed `macos-keychain-env` package when ./vendor is absent (default true). */
  installedFallback?: boolean;
}

type Plan =
  | { kind: "env"; info: SecretsInfo }
  | {
      kind: "keychain";
      file: string | undefined;
      service: string;
      env: Record<string, string | undefined>;
    };

function requestedBackend(
  env: Record<string, string | undefined>,
): "auto" | SecretsBackend {
  const raw = env.FIGMA_SECRETS_BACKEND?.trim().toLowerCase() || "auto";
  if (raw === "auto" || raw === "keychain" || raw === "env") return raw;
  throw new Error(
    `FIGMA_SECRETS_BACKEND must be "auto", "keychain" or "env" (got "${raw}").`,
  );
}

/** Directories from `start` up to the filesystem root. */
function ancestors(start: string): string[] {
  const out: string[] = [];
  let dir = resolve(start);
  for (;;) {
    out.push(dir);
    const parent = dirname(dir);
    if (parent === dir) return out;
    dir = parent;
  }
}

/** Candidate module files, most specific first. An explicit override must exist. */
export function candidateModules(opts: LoadSecretsOptions = {}): string[] {
  const env = opts.env ?? process.env;
  const explicit = env.FIGMA_KEYCHAIN_ENV_MODULE?.trim();
  if (explicit) {
    const p = resolve(explicit);
    const isFile = existsSync(p) && statSync(p).isFile();
    const file = isFile ? p : resolve(p, "src/index.js");
    if (!existsSync(file)) {
      throw new Error(
        `FIGMA_KEYCHAIN_ENV_MODULE points at ${file}, which does not exist.`,
      );
    }
    return [file];
  }
  const starts = [opts.cwd ?? process.cwd()];
  const entry = opts.entry ?? process.argv[1];
  if (entry && existsSync(entry)) starts.push(dirname(realpathSync(entry)));
  const seen = new Set<string>();
  const files: string[] = [];
  for (const start of starts) {
    for (const dir of ancestors(start)) {
      const file = resolve(dir, VENDORED_MODULE_RELATIVE);
      if (!seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }
  return files;
}

function findVendoredModule(opts: LoadSecretsOptions): string | undefined {
  return candidateModules(opts).find((file) => existsSync(file));
}

function plan(opts: LoadSecretsOptions): Plan {
  const env = opts.env ?? process.env;
  const requested = requestedBackend(env);
  const present = TOKEN_VARS.filter((name) => env[name]);
  const envInfo = (reason: string): Plan => ({
    kind: "env",
    info: { backend: "env", loaded: [], skipped: present, missing: [], reason },
  });

  if (requested === "env") return envInfo("FIGMA_SECRETS_BACKEND=env");
  if (present.length)
    return envInfo(`${present.join(", ")} already set in the environment`);
  const platform = opts.platform ?? process.platform;
  if (platform !== "darwin") {
    if (requested === "keychain") {
      throw new Error(
        "FIGMA_SECRETS_BACKEND=keychain needs macOS (secrets are read through /usr/bin/security).",
      );
    }
    return envInfo(`no keychain on ${platform}`);
  }
  const service =
    env.FIGMA_KEYCHAIN_SERVICE?.trim() || DEFAULT_KEYCHAIN_SERVICE;
  return { kind: "keychain", file: findVendoredModule(opts), service, env };
}

function missingModuleError(opts: LoadSecretsOptions): Error {
  const where = resolve(opts.cwd ?? process.cwd(), VENDORED_MODULE_RELATIVE);
  return new Error(
    `FIGMA_SECRETS_BACKEND=keychain but macos-keychain-env was not found (looked for ${where} and upwards). ` +
      "Run `make vendor`, or set FIGMA_KEYCHAIN_ENV_MODULE to a checkout.",
  );
}

function unwrap(mod: unknown): KeychainEnvModule {
  const m = mod as KeychainEnvModule & { default?: KeychainEnvModule };
  return typeof m.loadEnv === "function" ? m : (m.default as KeychainEnvModule);
}

function loadArgs(
  service: string,
  env: Record<string, string | undefined>,
  timeoutMs?: number,
): LoadEnvArgs {
  return {
    entries: Object.fromEntries(
      KEYCHAIN_KEYS.map((name) => [
        name,
        { service, account: name, optional: true },
      ]),
    ),
    service,
    // No manifest: the one item this needs is declared right here, so a
    // `.env.keychain` in the working directory is neither required nor read.
    manifest: false,
    override: false,
    target: env,
    ...(timeoutMs ? { timeoutMs } : {}),
  };
}

/** A store that cannot be read: fatal in strict mode, otherwise the env backend with the reason. */
function lookupFailed(
  err: unknown,
  p: Extract<Plan, { kind: "keychain" }>,
  modulePath: string,
): SecretsInfo {
  const wrapped = wrapLookupError(err, p.service, modulePath);
  if (requestedBackend(p.env) === "keychain") throw wrapped;
  return {
    backend: "env",
    loaded: [],
    skipped: [],
    missing: [],
    reason: wrapped.message,
  };
}

function wrapLookupError(
  err: unknown,
  service: string,
  modulePath: string,
): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(
    `keychain lookup failed (service "${service}", module ${modulePath}): ${msg}`,
  );
}

/**
 * Fill the token into the environment from the active secret store.
 * Call once at startup, before anything reads FIGMA_TOKEN.
 */
export async function loadFigmaSecrets(
  opts: LoadSecretsOptions = {},
): Promise<SecretsInfo> {
  const p = plan(opts);
  if (p.kind === "env") return p.info;

  let mod: KeychainEnvModule;
  let modulePath = p.file;
  if (p.file) {
    mod = unwrap(await import(p.file));
  } else {
    try {
      if (opts.installedFallback === false)
        throw new Error("installed fallback disabled");
      // Installed as a package instead of vendored. A non-literal specifier keeps
      // TypeScript from requiring the package (and its types) at build time.
      const installed = "macos-keychain-env";
      mod = unwrap(await import(installed));
      modulePath = installed;
    } catch {
      if (requestedBackend(p.env) === "keychain")
        throw missingModuleError(opts);
      return {
        backend: "env",
        loaded: [],
        skipped: [],
        missing: [],
        reason: "vendored macos-keychain-env not found (run `make vendor`)",
      };
    }
  }
  let result: LoadEnvResult;
  try {
    result = await mod.loadEnv(loadArgs(p.service, p.env, opts.timeoutMs));
  } catch (err) {
    return lookupFailed(err, p, modulePath ?? "macos-keychain-env");
  }
  return { backend: "keychain", service: p.service, modulePath, ...result };
}

/**
 * Synchronous variant for CLIs that read the token at module scope. Loads the
 * vendored module with `require`, which needs Node 20.19+ (require of ESM).
 */
export function loadFigmaSecretsSync(
  opts: LoadSecretsOptions = {},
): SecretsInfo {
  const p = plan(opts);
  if (p.kind === "env") return p.info;

  const file = p.file;
  if (!file) {
    if (requestedBackend(p.env) === "keychain") throw missingModuleError(opts);
    return {
      backend: "env",
      loaded: [],
      skipped: [],
      missing: [],
      reason: "vendored macos-keychain-env not found (run `make vendor`)",
    };
  }
  let mod: KeychainEnvModule;
  try {
    mod = unwrap(createRequire(file)(file));
  } catch (err) {
    if (requestedBackend(p.env) === "keychain") {
      throw new Error(
        `could not load ${file} synchronously (Node 20.19+ is required): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {
      backend: "env",
      loaded: [],
      skipped: [],
      missing: [],
      reason: `could not load ${file} synchronously (Node 20.19+ is required)`,
    };
  }
  let result: LoadEnvResult;
  try {
    result = mod.loadEnvSync(loadArgs(p.service, p.env, opts.timeoutMs));
  } catch (err) {
    return lookupFailed(err, p, file);
  }
  return {
    backend: "keychain",
    service: p.service,
    modulePath: file,
    ...result,
  };
}

/** One line for a startup log. Names only, never values. */
export function describeSecrets(info: SecretsInfo): string {
  if (info.backend === "keychain") {
    const from = info.loaded.length
      ? `from keychain: ${info.loaded.join(", ")}`
      : `nothing stored for ${KEYCHAIN_KEYS.join(", ")}`;
    return `secrets=keychain (service "${info.service}"; ${from})`;
  }
  const detail = info.skipped.length
    ? `${info.skipped.join(", ")} from environment`
    : (info.reason ?? "no token");
  return `secrets=env (${detail})`;
}
