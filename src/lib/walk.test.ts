import { describe, expect, it } from "vitest";
import type { FigmaFile, FigmaNode } from "../types.js";
import { buildWalk, listPages, resolvePath, toNodeMatch } from "./walk.js";

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
      name: "Page One",
      type: "CANVAS",
      children: [
        nd({
          id: "2:1",
          name: "Alpha",
          type: "FRAME",
          children: [
            nd({
              id: "3:1",
              name: "Alpha Title",
              type: "TEXT",
              characters: "Hello",
            }),
          ],
        }),
        nd({
          id: "2:2",
          name: "Beta",
          type: "FRAME",
          children: [
            nd({
              id: "3:2",
              name: "Beta Title",
              type: "TEXT",
              characters: "World",
            }),
          ],
        }),
        nd({
          id: "2:3",
          name: "Ghost",
          type: "FRAME",
          visible: false,
          children: [nd({ id: "3:9", name: "Ghost Text", type: "TEXT" })],
        }),
      ],
    }),
    nd({
      id: "1:2",
      name: "Page Two",
      type: "CANVAS",
      children: [nd({ id: "2:4", name: "Gamma", type: "FRAME" })],
    }),
  ],
});

const file: FigmaFile = {
  key: "TESTKEY",
  name: "Walk Fixture",
  lastModified: "2026-01-01T00:00:00Z",
  document: doc,
  comments: [],
  devResources: [],
};

describe("buildWalk", () => {
  it("emits every descendant but not the DOCUMENT root", () => {
    const walk = buildWalk(doc);
    expect(walk).toHaveLength(9);
    expect(walk.find((e) => e.node.id === "0:0")).toBeUndefined();
  });

  it("computes depth, parent and ancestors for a leaf", () => {
    const walk = buildWalk(doc);
    const leaf = walk.find((e) => e.node.id === "3:1");
    expect(leaf).toBeDefined();
    expect(leaf?.depth).toBe(2);
    expect(leaf?.parent.id).toBe("2:1");
    expect(leaf?.ancestors.map((a) => a.id)).toEqual(["1:1", "2:1"]);
    expect(leaf?.idPath).toBe("1:1 / 2:1 / 3:1");
    expect(leaf?.namePath).toBe("Page One / Alpha / Alpha Title");
  });

  it("adds [n] xpath indices only when siblings share a type", () => {
    const walk = buildWalk(doc);
    const alpha = walk.find((e) => e.node.id === "2:1");
    const beta = walk.find((e) => e.node.id === "2:2");
    const text = walk.find((e) => e.node.id === "3:1");
    expect(alpha?.xpath).toBe("/CANVAS[1]/FRAME[1]");
    expect(beta?.xpath).toBe("/CANVAS[1]/FRAME[2]");
    expect(text?.xpath).toBe("/CANVAS[1]/FRAME[1]/TEXT");
  });

  it("visibleOnly prunes a hidden node and its whole subtree", () => {
    const visible = buildWalk(doc, { visibleOnly: true });
    expect(visible).toHaveLength(7);
    expect(visible.find((e) => e.node.id === "2:3")).toBeUndefined();
    expect(visible.find((e) => e.node.id === "3:9")).toBeUndefined();
    const all = buildWalk(doc, { visibleOnly: false });
    expect(all.find((e) => e.node.id === "2:3")).toBeDefined();
    expect(all.find((e) => e.node.id === "3:9")).toBeDefined();
  });

  it("attributes each node to its nearest CANVAS ancestor", () => {
    const walk = buildWalk(doc);
    expect(walk.find((e) => e.node.id === "3:2")?.page).toBe("Page One");
    expect(walk.find((e) => e.node.id === "2:4")?.page).toBe("Page Two");
    expect(walk.find((e) => e.node.id === "1:1")?.page).toBeNull();
  });
});

describe("toNodeMatch", () => {
  it("flattens a walk entry to the NodeMatch shape", () => {
    const walk = buildWalk(doc);
    const entry = walk.find((e) => e.node.id === "3:1");
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(toNodeMatch(entry)).toEqual({
      id: "3:1",
      name: "Alpha Title",
      type: "TEXT",
      page: "Page One",
      xpath: "/CANVAS[1]/FRAME[1]/TEXT",
      namePath: "Page One / Alpha / Alpha Title",
      depth: 2,
      characters: "Hello",
    });
  });
});

describe("listPages", () => {
  it("returns the CANVAS children of the document in order", () => {
    expect(listPages(file)).toEqual([
      { id: "1:1", name: "Page One" },
      { id: "1:2", name: "Page Two" },
    ]);
  });
});

describe("resolvePath", () => {
  it("returns the path info for a known id", () => {
    const walk = buildWalk(doc);
    expect(resolvePath(walk, "3:2")).toEqual({
      id: "3:2",
      name: "Beta Title",
      type: "TEXT",
      xpath: "/CANVAS[1]/FRAME[2]/TEXT",
      namePath: "Page One / Beta / Beta Title",
      idPath: "1:1 / 2:2 / 3:2",
      page: "Page One",
    });
  });

  it("throws a NodeNotFoundError-prefixed error for an unknown id", () => {
    const walk = buildWalk(doc);
    expect(() => resolvePath(walk, "nope")).toThrowError(/^NodeNotFoundError:/);
  });
});
