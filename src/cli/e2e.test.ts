// Black-box coverage of the built binary. beforeAll builds the package
// (tsc -p tsconfig.json) so the suite is self-sufficient under `npm test`.
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_FILE } from "../testing/seed.js";

const pExecFile = promisify(execFile);
const pkgRoot = new URL("../..", import.meta.url).pathname;
const KEY = SEED_FILE.key;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await pExecFile(
      "node",
      [join(pkgRoot, "dist/cli/index.js"), ...args],
      { cwd: pkgRoot, env: { ...process.env, ...env } },
    );
    return { code: 0, stdout, stderr };
  } catch (err: any) {
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

let seedPath: string;

beforeAll(async () => {
  await pExecFile("npx", ["tsc", "-p", "tsconfig.json"], { cwd: pkgRoot });
  const dir = await mkdtemp(join(tmpdir(), "figma-find-e2e-"));
  seedPath = join(dir, "seed.json");
  await writeFile(seedPath, JSON.stringify(SEED_FILE));
}, 120_000);

describe("figma-find e2e", () => {
  it("pages --input lists Marketing Site", async () => {
    const r = await runCli(["pages", KEY, "--input", seedPath, "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kind).toBe("pages");
    expect(out.items.map((p: any) => p.name)).toContain("Marketing Site");
  });

  it("xpath returns the Feature frames' TEXT children", async () => {
    const r = await runCli([
      "xpath",
      KEY,
      "//FRAME[contains(@name,'Feature')]/TEXT",
      "--input",
      seedPath,
      "--json",
    ]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kind).toBe("nodes");
    expect(out.count).toBeGreaterThanOrEqual(1);
    expect(out.items.every((i: any) => i.type === "TEXT")).toBe(true);
  });

  it("find by name hits node 3:12", async () => {
    const r = await runCli([
      "find",
      KEY,
      "--name",
      "Headline",
      "--input",
      seedPath,
      "--json",
    ]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.items.map((i: any) => i.id)).toContain("3:12");
  });

  it("path with a bogus id exits 1 with NodeNotFoundError", async () => {
    const r = await runCli(["path", KEY, "bogus:id", "--input", seedPath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("NodeNotFoundError");
    expect(r.stdout).toBe("");
  });

  it("a malformed xpath exits 1", async () => {
    const r = await runCli(["xpath", KEY, "//FRAME[", "--input", seedPath]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("find with neither --name nor --type exits 1 with ValidationError", async () => {
    const r = await runCli(["find", KEY, "--input", seedPath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("ValidationError");
    expect(r.stdout).toBe("");
  });

  it("no token and no --input exits 2 naming the three env vars", async () => {
    const r = await runCli(["find", KEY, "--name", "x"], {
      FIGMA_TOKEN: "",
      FIGMA_API_TOKEN: "",
      FIGMA_ACCESS_TOKEN: "",
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("FIGMA_TOKEN");
    expect(r.stderr).toContain("FIGMA_API_TOKEN");
    expect(r.stderr).toContain("FIGMA_ACCESS_TOKEN");
    expect(r.stdout).toBe("");
  });
});
