import { describe, expect, it } from "vitest";
import type { FigmaComment, FigmaDevResource, FigmaNode } from "../types.js";
import {
  compileStringQuery,
  compileTypeFilter,
  hasImageFill,
  runFind,
  searchAnnotations,
  searchComments,
  searchDev,
} from "./query.js";
import { buildWalk } from "./walk.js";

const nd = (
  o: Partial<FigmaNode> & { id: string; name: string; type: string },
): FigmaNode => ({ visible: true, children: [], ...o });

const doc: FigmaNode = nd({
  id: "0:0",
  name: "Document",
  type: "DOCUMENT",
  children: [
    nd({
      id: "1:1",
      name: "Home",
      type: "CANVAS",
      children: [
        nd({
          id: "2:1",
          name: "Hero",
          type: "FRAME",
          annotations: [{ label: "Above the fold", categoryId: "content" }],
          children: [
            nd({
              id: "3:1",
              name: "Headline",
              type: "TEXT",
              characters: "Build apps fast",
            }),
            nd({
              id: "3:2",
              name: "Shot",
              type: "RECTANGLE",
              fills: [{ type: "IMAGE" }],
            }),
          ],
        }),
        nd({ id: "2:2", name: "Blob", type: "ELLIPSE" }),
      ],
    }),
    nd({
      id: "1:2",
      name: "Pricing",
      type: "CANVAS",
      children: [
        nd({
          id: "2:3",
          name: "Plans",
          type: "FRAME",
          annotations: [{ label: "Keep pricing simple", categoryId: "note" }],
          children: [
            nd({ id: "3:3", name: "Price", type: "TEXT", characters: "$20" }),
          ],
        }),
      ],
    }),
  ],
});

const walk = buildWalk(doc);

const findDefaults = {
  query: "",
  strMode: "contains" as const,
  caseSensitive: false,
  types: [] as string[],
  pageScope: "",
  maxResults: 50,
  against: "name" as const,
};

describe("compileStringQuery", () => {
  it("contains / exact / startsWith / endsWith / regex, case-insensitive", () => {
    expect(compileStringQuery("ell", "contains", false)("Hello")).toBe(true);
    expect(compileStringQuery("hello", "exact", false)("Hello")).toBe(true);
    expect(compileStringQuery("he", "startsWith", false)("Hello")).toBe(true);
    expect(compileStringQuery("lo", "endsWith", false)("Hello")).toBe(true);
    expect(compileStringQuery("^h.l+o$", "regex", false)("Hello")).toBe(true);
  });

  it("case sensitivity flips matches per mode", () => {
    expect(compileStringQuery("hello", "exact", true)("Hello")).toBe(false);
    expect(compileStringQuery("ELL", "contains", true)("Hello")).toBe(false);
    expect(compileStringQuery("HE", "startsWith", true)("Hello")).toBe(false);
    expect(compileStringQuery("LO", "endsWith", true)("Hello")).toBe(false);
    expect(compileStringQuery("^H", "regex", true)("Hello")).toBe(true);
    expect(compileStringQuery("^h", "regex", true)("Hello")).toBe(false);
  });

  it("empty or null query is always true", () => {
    expect(compileStringQuery("", "exact", true)("anything")).toBe(true);
    expect(compileStringQuery(null, "contains", false)(undefined)).toBe(true);
  });

  it("invalid regex throws at compile time", () => {
    expect(() => compileStringQuery("(", "regex", false)).toThrowError();
  });
});

describe("compileTypeFilter and hasImageFill", () => {
  const shot = nd({
    id: "x:1",
    name: "Shot",
    type: "RECTANGLE",
    fills: [{ type: "IMAGE" }],
  });
  const bg = nd({
    id: "x:2",
    name: "Bg",
    type: "FRAME",
    background: [{ type: "IMAGE" }],
  });
  const text = nd({ id: "x:3", name: "T", type: "TEXT" });

  it("empty list is always true", () => {
    expect(compileTypeFilter([])(text)).toBe(true);
  });

  it("matches exact node types", () => {
    const f = compileTypeFilter(["TEXT"]);
    expect(f(text)).toBe(true);
    expect(f(shot)).toBe(false);
  });

  it("IMAGE alias matches image fills and backgrounds", () => {
    expect(hasImageFill(shot)).toBe(true);
    expect(hasImageFill(bg)).toBe(true);
    expect(hasImageFill(text)).toBe(false);
    const f = compileTypeFilter(["image"]);
    expect(f(shot)).toBe(true);
    expect(f(text)).toBe(false);
  });

  it("SHAPE alias covers the SHAPE_TYPES list", () => {
    const f = compileTypeFilter(["shape"]);
    expect(f(nd({ id: "s:1", name: "E", type: "ELLIPSE" }))).toBe(true);
    expect(f(nd({ id: "s:2", name: "R", type: "RECTANGLE" }))).toBe(true);
    expect(f(text)).toBe(false);
  });
});

describe("runFind", () => {
  it("searches names by default and text when against=text", () => {
    const byName = runFind(walk, { ...findDefaults, query: "headline" });
    expect(byName.items.map((i) => i.id)).toEqual(["3:1"]);
    const byText = runFind(walk, {
      ...findDefaults,
      query: "apps",
      against: "text",
    });
    expect(byText.items.map((i) => i.id)).toEqual(["3:1"]);
  });

  it("text search only considers TEXT nodes", () => {
    const r = runFind(walk, {
      ...findDefaults,
      query: "",
      types: ["TEXT"],
      against: "text",
    });
    expect(r.items.every((i) => i.type === "TEXT")).toBe(true);
  });

  it("pageScope restricts hits to one page", () => {
    const r = runFind(walk, {
      ...findDefaults,
      query: "price",
      pageScope: "Pricing",
    });
    expect(r.items.map((i) => i.id)).toEqual(["3:3"]);
    const none = runFind(walk, {
      ...findDefaults,
      query: "price",
      pageScope: "Home",
    });
    expect(none.items).toEqual([]);
  });

  it("truncates to maxResults while reporting the true total", () => {
    const r = runFind(walk, {
      ...findDefaults,
      types: ["FRAME"],
      maxResults: 1,
    });
    expect(r.items).toHaveLength(1);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(2);
  });

  it("throws ValidationError when query and types are both empty", () => {
    expect(() => runFind(walk, { ...findDefaults })).toThrowError(
      /^ValidationError: at least one of name\/text\/types\/where is required/,
    );
  });
});

const comments: FigmaComment[] = [
  {
    id: "c1",
    message: "Fix the header spacing @dana",
    user: { handle: "miles" },
    created_at: "2026-01-02T10:00:00Z",
    resolved_at: null,
    client_meta: { node_id: "3:1" },
    parent_id: "",
  },
  {
    id: "c2",
    message: "On it.",
    user: { handle: "dana" },
    created_at: "2026-01-02T11:00:00Z",
    resolved_at: null,
    parent_id: "c1",
  },
  {
    id: "c3",
    message: "Old thread, closing.",
    user: { handle: "dana" },
    created_at: "2026-01-01T09:00:00Z",
    resolved_at: "2026-01-01T10:00:00Z",
    parent_id: "",
  },
];

describe("searchComments", () => {
  const base = {
    query: "",
    author: "",
    mentions: "",
    resolved: "any" as const,
  };

  it("filters by message query", () => {
    expect(
      searchComments(comments, { ...base, query: "header" }).map((c) => c.id),
    ).toEqual(["c1"]);
  });

  it("filters by author substring", () => {
    expect(
      searchComments(comments, { ...base, author: "dana" }).map((c) => c.id),
    ).toEqual(["c2", "c3"]);
  });

  it("matches @mentions with or without the leading @", () => {
    expect(
      searchComments(comments, { ...base, mentions: "dana" }).map((c) => c.id),
    ).toEqual(["c1"]);
    expect(
      searchComments(comments, { ...base, mentions: "@dana" }).map((c) => c.id),
    ).toEqual(["c1"]);
  });

  it("resolved tristate follows resolved_at presence", () => {
    expect(
      searchComments(comments, { ...base, resolved: "resolved" }).map(
        (c) => c.id,
      ),
    ).toEqual(["c3"]);
    expect(
      searchComments(comments, { ...base, resolved: "unresolved" }).map(
        (c) => c.id,
      ),
    ).toEqual(["c1", "c2"]);
    expect(searchComments(comments, { ...base })).toHaveLength(3);
  });

  it("maps thread metadata from parent_id", () => {
    const [root, reply] = searchComments(comments, { ...base }).slice(0, 2);
    expect(root.isRoot).toBe(true);
    expect(root.threadId).toBe("c1");
    expect(root.nodeId).toBe("3:1");
    expect(reply.isRoot).toBe(false);
    expect(reply.threadId).toBe("c1");
  });
});

describe("searchAnnotations", () => {
  it("filters by label query", () => {
    const hits = searchAnnotations(walk, { query: "fold", pageScope: "" });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      label: "Above the fold",
      nodeId: "2:1",
      page: "Home",
    });
  });

  it("filters by pageScope and skips nodes without annotations", () => {
    const hits = searchAnnotations(walk, { query: "", pageScope: "Pricing" });
    expect(hits.map((h) => h.nodeId)).toEqual(["2:3"]);
  });
});

const resources: FigmaDevResource[] = [
  {
    id: "d1",
    name: "Storybook spec",
    url: "https://storybook.example.dev/hero",
    node_id: "2:1",
  },
  {
    id: "d2",
    name: "Design tokens",
    url: "https://github.com/acme/tokens",
    node_id: "0:0",
  },
];

describe("searchDev", () => {
  it("query matches the resource name", () => {
    expect(
      searchDev(resources, { query: "storybook", nodeId: "" }).map((d) => d.id),
    ).toEqual(["d1"]);
  });

  it("query matches the url too", () => {
    expect(
      searchDev(resources, { query: "github", nodeId: "" }).map((d) => d.id),
    ).toEqual(["d2"]);
  });

  it("nodeId scopes results, alone and combined with a query", () => {
    expect(
      searchDev(resources, { query: "", nodeId: "2:1" }).map((d) => d.id),
    ).toEqual(["d1"]);
    expect(searchDev(resources, { query: "tokens", nodeId: "2:1" })).toEqual(
      [],
    );
  });
});
