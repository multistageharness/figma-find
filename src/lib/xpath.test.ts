import { describe, expect, it } from "vitest";
import type { FigmaNode } from "../types.js";
import { evaluateXPath, XPathSyntaxError } from "./xpath.js";

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
      name: "Page",
      type: "CANVAS",
      children: [
        nd({
          id: "2:1",
          name: "Hero",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 720 },
          children: [
            nd({
              id: "3:1",
              name: "Title",
              type: "TEXT",
              characters: "Build fast",
            }),
          ],
        }),
        nd({
          id: "2:2",
          name: "Feature Card",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 720, width: 480, height: 320 },
          children: [
            nd({
              id: "3:2",
              name: "Feature Title",
              type: "TEXT",
              characters: "Automations",
            }),
          ],
        }),
        nd({
          id: "2:3",
          name: "Feature Grid",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 1040, width: 960, height: 640 },
          children: [
            nd({
              id: "3:3",
              name: "Grid Label",
              type: "TEXT",
              characters: "Stuff",
            }),
          ],
        }),
        nd({ id: "2:4", name: "it's", type: "RECTANGLE" }),
      ],
    }),
  ],
});

const ids = (nodes: FigmaNode[]) => nodes.map((n) => n.id);

describe("axes and node tests", () => {
  it("child axis walks direct children only", () => {
    expect(ids(evaluateXPath(doc, "/CANVAS/FRAME"))).toEqual([
      "2:1",
      "2:2",
      "2:3",
    ]);
  });

  it("descendant axis finds nodes at any depth", () => {
    expect(ids(evaluateXPath(doc, "//TEXT"))).toEqual(["3:1", "3:2", "3:3"]);
  });

  it("bare leading step is an implicit descendant axis", () => {
    expect(ids(evaluateXPath(doc, "TEXT"))).toEqual(["3:1", "3:2", "3:3"]);
  });

  it("* wildcard matches any type", () => {
    expect(ids(evaluateXPath(doc, "/CANVAS/*"))).toEqual([
      "2:1",
      "2:2",
      "2:3",
      "2:4",
    ]);
  });
});

describe("position predicates", () => {
  it("integer predicate is position shorthand", () => {
    expect(ids(evaluateXPath(doc, "//FRAME[2]"))).toEqual(["2:2"]);
  });

  it("position()=last() selects the final candidate", () => {
    expect(ids(evaluateXPath(doc, "//FRAME[position()=last()]"))).toEqual([
      "2:3",
    ]);
  });

  it("renumbers positions across chained predicates", () => {
    expect(
      ids(evaluateXPath(doc, "//FRAME[contains(@name,'Feature')][2]")),
    ).toEqual(["2:3"]);
  });
});

describe("attribute comparisons", () => {
  it("matches string attribute equality", () => {
    expect(ids(evaluateXPath(doc, "//FRAME[@name='Hero']"))).toEqual(["2:1"]);
  });

  it("resolves dotted attribute paths numerically", () => {
    expect(
      ids(evaluateXPath(doc, "//FRAME[@absoluteBoundingBox.width>1000]")),
    ).toEqual(["2:1"]);
  });

  it("supports >= and != with numeric coercion", () => {
    expect(
      ids(evaluateXPath(doc, "//FRAME[@absoluteBoundingBox.width>=960]")),
    ).toEqual(["2:1", "2:3"]);
    expect(
      ids(evaluateXPath(doc, "//FRAME[@absoluteBoundingBox.width!=480]")),
    ).toEqual(["2:1", "2:3"]);
  });
});

describe("predicate functions", () => {
  it("contains / icontains", () => {
    expect(ids(evaluateXPath(doc, "//FRAME[contains(@name,'ero')]"))).toEqual([
      "2:1",
    ]);
    expect(ids(evaluateXPath(doc, "//FRAME[icontains(@name,'HERO')]"))).toEqual(
      ["2:1"],
    );
  });

  it("starts-with / ends-with", () => {
    expect(
      ids(evaluateXPath(doc, "//FRAME[starts-with(@name,'Feature')]")),
    ).toEqual(["2:2", "2:3"]);
    expect(ids(evaluateXPath(doc, "//FRAME[ends-with(@name,'Card')]"))).toEqual(
      ["2:2"],
    );
  });

  it("matches() runs a regex over the operand", () => {
    expect(ids(evaluateXPath(doc, "//FRAME[matches(@name,'^H','')]"))).toEqual([
      "2:1",
    ]);
  });

  it("text() / name() / type() context functions", () => {
    expect(ids(evaluateXPath(doc, "//TEXT[text()='Build fast']"))).toEqual([
      "3:1",
    ]);
    expect(ids(evaluateXPath(doc, "//*[name()='Hero']"))).toEqual(["2:1"]);
    expect(ids(evaluateXPath(doc, "//*[type()='RECTANGLE']"))).toEqual(["2:4"]);
  });
});

describe("boolean operators", () => {
  it("and narrows, or widens", () => {
    expect(
      ids(
        evaluateXPath(
          doc,
          "//FRAME[contains(@name,'Feature') and ends-with(@name,'Card')]",
        ),
      ),
    ).toEqual(["2:2"]);
    expect(
      ids(evaluateXPath(doc, "//FRAME[@name='Hero' or @name='Feature Grid']")),
    ).toEqual(["2:1", "2:3"]);
  });

  it("not(...) inverts, including nested expressions", () => {
    expect(
      ids(evaluateXPath(doc, "//FRAME[not(contains(@name,'Feature'))]")),
    ).toEqual(["2:1"]);
    expect(
      ids(
        evaluateXPath(
          doc,
          "//FRAME[not(@name='Hero' or @name='Feature Card')]",
        ),
      ),
    ).toEqual(["2:3"]);
  });
});

describe("string literals", () => {
  it("doubled quotes escape inside quoted strings", () => {
    expect(ids(evaluateXPath(doc, "//RECTANGLE[@name='it''s']"))).toEqual([
      "2:4",
    ]);
  });
});

describe("the flagship selector", () => {
  it("//FRAME[contains(@name,'Feature')]/TEXT returns TEXT children of matching frames", () => {
    const out = evaluateXPath(doc, "//FRAME[contains(@name,'Feature')]/TEXT");
    expect(ids(out)).toEqual(["3:2", "3:3"]);
    expect(out.every((n) => n.type === "TEXT")).toBe(true);
  });
});

describe("syntax errors", () => {
  it("throws XPathSyntaxError for an unknown function", () => {
    expect(() => evaluateXPath(doc, "//FRAME[foo(@name)]")).toThrowError(
      XPathSyntaxError,
    );
  });

  it("throws XPathSyntaxError for trailing predicate input", () => {
    expect(() => evaluateXPath(doc, "//FRAME[1 2]")).toThrowError(
      XPathSyntaxError,
    );
  });

  it("throws XPathSyntaxError for a malformed step", () => {
    expect(() => evaluateXPath(doc, "//123abc")).toThrowError(XPathSyntaxError);
  });

  it("throws XPathSyntaxError for an unexpected character", () => {
    expect(() => evaluateXPath(doc, "//FRAME[#]")).toThrowError(
      XPathSyntaxError,
    );
  });
});
