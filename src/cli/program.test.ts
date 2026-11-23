import { describe, expect, it } from "vitest";
import { SEED_FILE } from "../testing/seed.js";
import { parseInvocation } from "./program.js";

const KEY = SEED_FILE.key;

describe("find", () => {
  it("parses the console's basic find command with defaults", () => {
    const inv = parseInvocation(["find", KEY, "--name", "Button", "--json"]);
    expect(inv.mode).toBe("find");
    expect(inv.fileKey).toBe(KEY);
    expect(inv.config.query).toBe("Button");
    expect(inv.config.strMode).toBe("contains");
    expect(inv.config.caseSensitive).toBe(false);
    expect(inv.config.types).toEqual([]);
    expect(inv.config.pageScope).toBe("");
    expect(inv.config.maxResults).toBe(50);
    expect(inv.visibleOnly).toBe(true);
  });

  it("maps every find flag", () => {
    const inv = parseInvocation([
      "find",
      KEY,
      "--name",
      "Label",
      "--type",
      "TEXT,FRAME",
      "--mode",
      "exact",
      "--case-sensitive",
      "--page",
      "Home",
      "--all-nodes",
      "--max",
      "10",
      "--json",
    ]);
    expect(inv.config.types).toEqual(["TEXT", "FRAME"]);
    expect(inv.config.strMode).toBe("exact");
    expect(inv.config.caseSensitive).toBe(true);
    expect(inv.config.pageScope).toBe("Home");
    expect(inv.config.maxResults).toBe(10);
    expect(inv.visibleOnly).toBe(false);
  });
});

describe("xpath / path / pages", () => {
  it("keeps the xpath expression verbatim", () => {
    const expr = "//FRAME[contains(@name,'Feature')]/TEXT";
    const inv = parseInvocation(["xpath", KEY, expr, "--json"]);
    expect(inv.mode).toBe("xpath");
    expect(inv.config.xpathExpr).toBe(expr);
  });

  it("maps path positionals", () => {
    const inv = parseInvocation(["path", KEY, "3:12", "--json"]);
    expect(inv.mode).toBe("path");
    expect(inv.config.nodeId).toBe("3:12");
  });

  it("maps pages", () => {
    const inv = parseInvocation(["pages", KEY, "--json"]);
    expect(inv.mode).toBe("pages");
    expect(inv.fileKey).toBe(KEY);
  });
});

describe("comments", () => {
  it("maps query, author, mentions and --unresolved", () => {
    const inv = parseInvocation([
      "comments",
      KEY,
      "--query",
      "off-brand",
      "--author",
      "dana",
      "--mentions",
      "brandteam",
      "--unresolved",
      "--json",
    ]);
    expect(inv.mode).toBe("comments");
    expect(inv.config.query).toBe("off-brand");
    expect(inv.config.author).toBe("dana");
    expect(inv.config.mentions).toBe("brandteam");
    expect(inv.config.resolved).toBe("unresolved");
  });

  it("--resolved maps to resolved; neither maps to any", () => {
    expect(
      parseInvocation(["comments", KEY, "--resolved"]).config.resolved,
    ).toBe("resolved");
    expect(parseInvocation(["comments", KEY]).config.resolved).toBe("any");
  });
});

describe("annotations / dev-resources / all", () => {
  it("maps annotations query and page", () => {
    const inv = parseInvocation([
      "annotations",
      KEY,
      "--query",
      "fold",
      "--page",
      "Marketing Site",
    ]);
    expect(inv.mode).toBe("annotations");
    expect(inv.config.query).toBe("fold");
    expect(inv.config.pageScope).toBe("Marketing Site");
  });

  it("dev-resources maps to mode dev", () => {
    const inv = parseInvocation([
      "dev-resources",
      KEY,
      "--query",
      "storybook",
      "--node",
      "2:4",
    ]);
    expect(inv.mode).toBe("dev");
    expect(inv.config.query).toBe("storybook");
    expect(inv.config.nodeId).toBe("2:4");
  });

  it("all takes the query positionally", () => {
    const inv = parseInvocation(["all", KEY, "Headline", "--json"]);
    expect(inv.mode).toBe("all");
    expect(inv.config.query).toBe("Headline");
  });
});

describe("global options", () => {
  it("--input and --token land on the invocation after the subcommand", () => {
    const inv = parseInvocation([
      "pages",
      KEY,
      "--input",
      "./x.json",
      "--token",
      "t",
    ]);
    expect(inv.input).toBe("./x.json");
    expect(inv.token).toBe("t");
  });

  it("--input and --token also work before the subcommand", () => {
    const inv = parseInvocation([
      "--input",
      "./x.json",
      "--token",
      "t",
      "pages",
      KEY,
    ]);
    expect(inv.input).toBe("./x.json");
    expect(inv.token).toBe("t");
  });
});

describe("parse errors", () => {
  it("rejects --resolved with --unresolved", () => {
    expect(() =>
      parseInvocation(["comments", KEY, "--resolved", "--unresolved"]),
    ).toThrowError();
  });

  it("rejects an unknown --mode choice", () => {
    expect(() =>
      parseInvocation(["find", KEY, "--name", "x", "--mode", "bogus"]),
    ).toThrowError();
  });

  it("rejects --max 0", () => {
    expect(() =>
      parseInvocation(["find", KEY, "--name", "x", "--max", "0"]),
    ).toThrowError();
  });

  it("rejects an unknown subcommand", () => {
    expect(() => parseInvocation(["frobnicate", KEY])).toThrowError();
  });
});
