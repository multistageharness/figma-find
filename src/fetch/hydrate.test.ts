import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEED_FILE } from "../testing/seed.js";
import { FigmaNotFoundError } from "./errors.js";
import type { HydrateClient } from "./hydrate.js";
import { hydrateFigmaFile, loadFigmaFile } from "./hydrate.js";

const rawFile = {
  name: "Stub File",
  lastModified: "2026-08-01T00:00:00Z",
  document: { id: "0:0", name: "Document", type: "DOCUMENT", children: [] },
};

function stubClient(over: Partial<HydrateClient> = {}): HydrateClient {
  return {
    getFile: vi.fn().mockResolvedValue(rawFile),
    getComments: vi.fn().mockResolvedValue([{ id: "c1" }]),
    getDevResources: vi.fn().mockResolvedValue([{ id: "d1" }]),
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hydrateFigmaFile", () => {
  it("assembles the aggregate from the three endpoints", async () => {
    const client = stubClient();
    const file = await hydrateFigmaFile("KEY", { client });
    expect(file).toEqual({
      key: "KEY",
      name: "Stub File",
      lastModified: "2026-08-01T00:00:00Z",
      document: rawFile.document,
      comments: [{ id: "c1" }],
      devResources: [{ id: "d1" }],
    });
    for (const fn of [
      client.getFile,
      client.getComments,
      client.getDevResources,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("KEY");
    }
  });

  it("degrades comments to [] with one warning when that fetch fails", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = stubClient({
      getComments: vi.fn().mockRejectedValue(new Error("403 scoped token")),
    });
    const file = await hydrateFigmaFile("KEY", { client });
    expect(file.comments).toEqual([]);
    expect(file.devResources).toEqual([{ id: "d1" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("comments");
  });

  it("degrades dev resources symmetrically", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = stubClient({
      getDevResources: vi.fn().mockRejectedValue(new Error("500")),
    });
    const file = await hydrateFigmaFile("KEY", { client });
    expect(file.devResources).toEqual([]);
    expect(file.comments).toEqual([{ id: "c1" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("dev resources");
  });

  it("fails hard when the file fetch itself fails", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new FigmaNotFoundError("KEY");
    const client = stubClient({
      getFile: vi.fn().mockRejectedValue(boom),
    });
    await expect(hydrateFigmaFile("KEY", { client })).rejects.toBe(boom);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("loadFigmaFile", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "figma-find-test-"));
  });

  it("round-trips the seed file", async () => {
    const path = join(dir, "seed.json");
    await writeFile(path, JSON.stringify(SEED_FILE));
    const file = await loadFigmaFile(path);
    expect(file.key).toBe(SEED_FILE.key);
    expect(file.document).toEqual(SEED_FILE.document);
    expect(file.comments).toEqual(SEED_FILE.comments);
    expect(file.devResources).toEqual(SEED_FILE.devResources);
  });

  it("applies defaults when only a document is present", async () => {
    const path = join(dir, "bare.json");
    await writeFile(path, JSON.stringify({ document: { id: "0:0" } }));
    const file = await loadFigmaFile(path);
    expect(file.key).toBe("");
    expect(file.name).toBe("bare.json");
    expect(file.lastModified).toBe("");
    expect(file.comments).toEqual([]);
    expect(file.devResources).toEqual([]);
  });

  it("rejects non-JSON input", async () => {
    const path = join(dir, "not-json.json");
    await writeFile(path, "definitely {not json");
    await expect(loadFigmaFile(path)).rejects.toThrowError(
      /^ValidationError: .* is not valid JSON/,
    );
  });

  it("rejects a JSON array", async () => {
    const path = join(dir, "array.json");
    await writeFile(path, "[1,2,3]");
    await expect(loadFigmaFile(path)).rejects.toThrowError(
      /^ValidationError: .*missing document/,
    );
  });

  it("rejects an object without a document", async () => {
    const path = join(dir, "no-doc.json");
    await writeFile(path, JSON.stringify({ name: "x" }));
    await expect(loadFigmaFile(path)).rejects.toThrowError(
      /^ValidationError: .*missing document/,
    );
  });
});
