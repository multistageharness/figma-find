/**
 * The secrets loader mirror: environment first, then the macOS keychain through
 * a vendored macos-keychain-env. Runs against the stub next to it, never the
 * real keychain, and prints no values. The canonical suite (figma-fetch,
 * tests/unit/secrets.test.mjs) covers the sync variant and ./vendor discovery.
 */
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYCHAIN_SERVICE,
  describeSecrets,
  loadFigmaSecrets,
} from "./secrets.js";

const STUB = fileURLToPath(
  new URL("./testing/fake-keychain-env.mjs", import.meta.url),
);

/** A directory with no vendor/ anywhere above it. */
function emptyDir(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "figma-secrets-")), "a", "b");
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("loadFigmaSecrets", () => {
  it("never loads a module when FIGMA_SECRETS_BACKEND=env", async () => {
    const env = {
      FIGMA_SECRETS_BACKEND: "env",
      FIGMA_KEYCHAIN_ENV_MODULE: "/nowhere",
    };
    expect(await loadFigmaSecrets({ env })).toMatchObject({
      backend: "env",
      reason: "FIGMA_SECRETS_BACKEND=env",
    });
  });

  it("lets a token already in the environment win, whatever its alias", async () => {
    const env = {
      FIGMA_ACCESS_TOKEN: "env-token",
      FIGMA_KEYCHAIN_ENV_MODULE: STUB,
    };
    const info = await loadFigmaSecrets({ env });
    expect(info).toMatchObject({
      backend: "env",
      skipped: ["FIGMA_ACCESS_TOKEN"],
    });
    expect(env).not.toHaveProperty("FIGMA_TOKEN");
  });

  it("falls back to env without a vendored module and names make vendor", async () => {
    const dir = emptyDir();
    const info = await loadFigmaSecrets({
      env: {},
      cwd: dir,
      entry: dir,
      installedFallback: false,
    });
    expect(info.backend).toBe("env");
    expect(info.reason).toContain("make vendor");
    await expect(
      loadFigmaSecrets({
        env: { FIGMA_SECRETS_BACKEND: "keychain" },
        cwd: dir,
        entry: dir,
        installedFallback: false,
      }),
    ).rejects.toThrow(/make vendor/);
  });

  it("skips the keychain off macOS", async () => {
    const info = await loadFigmaSecrets({
      env: { FIGMA_KEYCHAIN_ENV_MODULE: STUB },
      platform: "linux",
    });
    expect(info).toMatchObject({
      backend: "env",
      reason: "no keychain on linux",
    });
  });

  it("fills FIGMA_TOKEN through the module, honouring FIGMA_KEYCHAIN_SERVICE", async () => {
    const env: Record<string, string | undefined> = {
      FIGMA_KEYCHAIN_ENV_MODULE: STUB,
    };
    const info = await loadFigmaSecrets({ env });
    expect(info).toMatchObject({
      backend: "keychain",
      service: DEFAULT_KEYCHAIN_SERVICE,
      loaded: ["FIGMA_TOKEN"],
      missing: [],
    });
    expect(env.FIGMA_TOKEN).toBe("fake-token-from-stub");

    const named = {
      FIGMA_KEYCHAIN_ENV_MODULE: STUB,
      FIGMA_KEYCHAIN_SERVICE: "my-figma",
    };
    expect((await loadFigmaSecrets({ env: named })).service).toBe("my-figma");

    const absent = {
      FIGMA_KEYCHAIN_ENV_MODULE: STUB,
      FIGMA_KEYCHAIN_SERVICE: "empty-service",
    };
    expect(await loadFigmaSecrets({ env: absent })).toMatchObject({
      backend: "keychain",
      loaded: [],
      missing: ["FIGMA_TOKEN"],
    });
  });

  it("describes sources by name only", () => {
    expect(
      describeSecrets({
        backend: "keychain",
        service: "figma-api",
        loaded: ["FIGMA_TOKEN"],
        skipped: [],
        missing: [],
      }),
    ).toBe(
      'secrets=keychain (service "figma-api"; from keychain: FIGMA_TOKEN)',
    );
    expect(
      describeSecrets({
        backend: "env",
        loaded: [],
        skipped: ["FIGMA_TOKEN"],
        missing: [],
      }),
    ).toBe("secrets=env (FIGMA_TOKEN from environment)");
  });
});
