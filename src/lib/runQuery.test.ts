import { describe, expect, it } from "vitest";
import { SEED_FILE } from "../testing/seed.js";
import type { QueryConfig } from "../types.js";
import { runQuery } from "./query.js";
import { buildWalk } from "./walk.js";

const file = SEED_FILE;
const walk = buildWalk(file.document, { visibleOnly: true });

const cfg = (over: Partial<QueryConfig> = {}): QueryConfig => ({
  query: "",
  strMode: "contains",
  caseSensitive: false,
  types: [],
  pageScope: "",
  maxResults: 50,
  xpathExpr: "",
  author: "",
  mentions: "",
  resolved: "any",
  nodeId: "",
  ...over,
});

describe("runQuery over the seed file", () => {
  it("pages lists the canvases", () => {
    const r = runQuery("pages", file, walk, cfg());
    expect(r.kind).toBe("pages");
    expect(r.items.map((p: any) => p.name)).toContain("Marketing Site");
    expect(r.count).toBe(2);
  });

  it("find by name hits the Headline node", () => {
    const r = runQuery("find", file, walk, cfg({ query: "Headline" }));
    expect(r.kind).toBe("nodes");
    expect(r.items.map((i: any) => i.id)).toContain("3:12");
  });

  it("xpath returns TEXT children of Feature frames", () => {
    const r = runQuery(
      "xpath",
      file,
      walk,
      cfg({ xpathExpr: "//FRAME[contains(@name,'Feature')]/TEXT" }),
    );
    expect(r.kind).toBe("nodes");
    expect(r.count).toBeGreaterThan(0);
    expect(r.items.every((i: any) => i.type === "TEXT")).toBe(true);
  });

  it("path resolves a node id to its canonical address", () => {
    const r = runQuery("path", file, walk, cfg({ nodeId: "3:12" }));
    expect(r.kind).toBe("path");
    expect(r.count).toBe(1);
    const info: any = r.items[0];
    expect(info.xpath.length).toBeGreaterThan(0);
    expect(info.namePath).toContain("Headline");
    expect(info.page).toBe("Marketing Site");
  });

  it("path throws NodeNotFoundError for a bogus id", () => {
    expect(() =>
      runQuery("path", file, walk, cfg({ nodeId: "9:99" })),
    ).toThrowError(/^NodeNotFoundError:/);
  });

  it("comments filter by author, mention and resolved state", () => {
    const byAuthor = runQuery("comments", file, walk, cfg({ author: "priya" }));
    expect(byAuthor.items.map((c: any) => c.id)).toEqual(["c4"]);

    const byMention = runQuery(
      "comments",
      file,
      walk,
      cfg({ mentions: "dana" }),
    );
    expect(byMention.items.map((c: any) => c.id)).toEqual(["c1"]);

    const resolved = runQuery(
      "comments",
      file,
      walk,
      cfg({ resolved: "resolved" }),
    );
    expect(resolved.items.map((c: any) => c.id)).toEqual(["c3"]);

    const unresolved = runQuery(
      "comments",
      file,
      walk,
      cfg({ resolved: "unresolved" }),
    );
    expect(unresolved.items.map((c: any) => c.id)).not.toContain("c3");
    expect(unresolved.count).toBe(3);
  });

  it("annotations finds the Hero above-the-fold note", () => {
    const r = runQuery("annotations", file, walk, cfg({ query: "fold" }));
    expect(r.kind).toBe("annotations");
    expect(r.items.map((a: any) => a.nodeId)).toEqual(["2:4"]);
  });

  it("dev resources filter by query and node id", () => {
    const byQuery = runQuery("dev", file, walk, cfg({ query: "Storybook" }));
    expect(byQuery.items.map((d: any) => d.id)).toEqual(["d1"]);

    const byNode = runQuery("dev", file, walk, cfg({ nodeId: "2:4" }));
    expect(byNode.items.map((d: any) => d.id)).toEqual(["d1"]);
  });

  it("all federates the five groups with facets", () => {
    const r = runQuery("all", file, walk, cfg({ query: "Headline" }));
    expect(r.kind).toBe("all");
    const groups: any[] = r.items;
    expect(groups.map((g) => g.key)).toEqual([
      "names",
      "text",
      "comments",
      "annotations",
      "dev",
    ]);
    expect(r.count).toBe(groups.reduce((acc, g) => acc + g.count, 0));
    expect(r.facets).toHaveLength(5);
    const names = groups.find((g) => g.key === "names");
    expect(names.items.map((i: any) => i.id)).toContain("3:12");
    const comments = groups.find((g) => g.key === "comments");
    expect(comments.count).toBeGreaterThan(0);
  });

  it("all rejects an empty query", () => {
    expect(() => runQuery("all", file, walk, cfg())).toThrowError(
      /^ValidationError:/,
    );
  });
});
