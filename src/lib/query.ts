import type {
  AnnotationMatch,
  CommentMatch,
  DevResourceMatch,
  FigmaComment,
  FigmaDevResource,
  FigmaFile,
  FigmaNode,
  NodeMatch,
  QueryConfig,
  QueryResults,
  ResolvedFilter,
  SearchModeId,
  StringMatchMode,
} from "../types.js";
import type { WalkEntry } from "./walk.js";
import { listPages, resolvePath, toNodeMatch } from "./walk.js";
import { evaluateXPath } from "./xpath.js";

export const SHAPE_TYPES = [
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "LINE",
  "VECTOR",
  "REGULAR_POLYGON",
  "BOOLEAN_OPERATION",
];

/** Compiles a string query into a predicate over an optional haystack. */
export function compileStringQuery(
  q: string | null | undefined,
  mode: StringMatchMode,
  caseSensitive: boolean,
): (s?: string | null) => boolean {
  if (q == null || q === "") return () => true;
  if (mode === "regex") {
    const re = new RegExp(q, caseSensitive ? "" : "i");
    return (s) => re.test(s ?? "");
  }
  const norm = (s?: string | null) =>
    caseSensitive ? (s ?? "") : (s ?? "").toLowerCase();
  const needle = norm(q);
  return (s) => {
    const hay = norm(s);
    if (mode === "exact") return hay === needle;
    if (mode === "startsWith") return hay.startsWith(needle);
    if (mode === "endsWith") return hay.endsWith(needle);
    return hay.includes(needle); // contains
  };
}

export const hasImageFill = (n: FigmaNode): boolean =>
  [...(n.fills || []), ...(n.background || [])].some(
    (p) => p?.type === "IMAGE",
  );

/** Compiles a type filter; `image` and `shape` are aliases, not raw types. */
export function compileTypeFilter(types: string[]): (n: FigmaNode) => boolean {
  if (!types || types.length === 0) return () => true;
  const set = types.map((t) => t.toUpperCase());
  return (n) =>
    set.some((t) => {
      if (t === "IMAGE") return hasImageFill(n);
      if (t === "SHAPE") return SHAPE_TYPES.includes(n.type);
      return n.type === t;
    });
}

interface RunFindArgs {
  query: string;
  strMode: StringMatchMode;
  caseSensitive: boolean;
  types: string[];
  pageScope: string;
  maxResults: number;
  against: "name" | "text";
}

export function runFind(
  walk: WalkEntry[],
  {
    query,
    strMode,
    caseSensitive,
    types,
    pageScope,
    maxResults,
    against,
  }: RunFindArgs,
): { items: NodeMatch[]; truncated: boolean; total: number } {
  if (!query && (!types || types.length === 0)) {
    throw new Error(
      "ValidationError: at least one of name/text/types/where is required",
    );
  }
  const matchStr = compileStringQuery(query, strMode, caseSensitive);
  const matchType = compileTypeFilter(types);
  const hits = walk.filter((e) => {
    if (pageScope && e.page !== pageScope) return false;
    if (!matchType(e.node)) return false;
    if (!query) return true;
    const field = against === "text" ? e.node.characters : e.node.name;
    if (against === "text" && e.node.type !== "TEXT") return false;
    return matchStr(field);
  });
  const truncated = hits.length > maxResults;
  return {
    items: hits.slice(0, maxResults).map(toNodeMatch),
    truncated,
    total: hits.length,
  };
}

export function searchComments(
  comments: FigmaComment[],
  {
    query,
    author,
    mentions,
    resolved,
  }: {
    query: string;
    author: string;
    mentions: string;
    resolved: ResolvedFilter;
  },
): CommentMatch[] {
  const matchMsg = compileStringQuery(query, "contains", false);
  const a = (author || "").toLowerCase();
  const men = (mentions || "").replace(/^@/, "").toLowerCase();
  return comments
    .filter((c) => {
      if (query && !matchMsg(c.message)) return false;
      if (a && !c.user.handle.toLowerCase().includes(a)) return false;
      if (men && !c.message.toLowerCase().includes(`@${men}`)) return false;
      const isResolved = c.resolved_at != null;
      if (resolved === "resolved" && !isResolved) return false;
      if (resolved === "unresolved" && isResolved) return false;
      return true;
    })
    .map((c) => ({
      id: c.id,
      message: c.message,
      author: c.user.handle,
      resolved: c.resolved_at != null,
      createdAt: c.created_at,
      threadId: c.parent_id || c.id,
      isRoot: !c.parent_id,
      nodeId: c.client_meta?.node_id,
    }));
}

export function searchAnnotations(
  walk: WalkEntry[],
  { query, pageScope }: { query: string; pageScope: string },
): AnnotationMatch[] {
  const matchLabel = compileStringQuery(query, "contains", false);
  const out: AnnotationMatch[] = [];
  walk.forEach((e) => {
    (e.node.annotations || []).forEach((an) => {
      if (query && !matchLabel(an.label)) return;
      if (pageScope && e.page !== pageScope) return;
      out.push({
        label: an.label,
        categoryId: an.categoryId,
        nodeId: e.node.id,
        nodeName: e.node.name,
        nodeType: e.node.type,
        page: e.page,
        xpath: e.xpath,
      });
    });
  });
  return out;
}

export function searchDev(
  resources: FigmaDevResource[],
  { query, nodeId }: { query: string; nodeId: string },
): DevResourceMatch[] {
  const m = compileStringQuery(query, "contains", false);
  return resources
    .filter((d) => {
      if (query && !(m(d.name) || m(d.url))) return false;
      if (nodeId && d.node_id !== nodeId) return false;
      return true;
    })
    .map((d) => ({ id: d.id, name: d.name, url: d.url, nodeId: d.node_id }));
}

/**
 * Executes one console query against a cached file. Throws `Error` with a
 * `ValidationError:` / `NodeNotFoundError:` prefix, or {@link XPathSyntaxError}
 * for malformed selectors.
 */
export function runQuery(
  mode: SearchModeId,
  file: FigmaFile,
  walk: WalkEntry[],
  cfg: QueryConfig,
): QueryResults {
  const {
    query,
    strMode,
    caseSensitive,
    types,
    pageScope,
    maxResults,
    xpathExpr,
    author,
    mentions,
    resolved,
    nodeId,
  } = cfg;

  if (mode === "pages") {
    const pages = listPages(file);
    return { kind: "pages", items: pages, count: pages.length };
  }

  if (mode === "find") {
    const r = runFind(walk, {
      query,
      strMode,
      caseSensitive,
      types,
      pageScope,
      maxResults,
      against: "name",
    });
    return {
      kind: "nodes",
      items: r.items,
      count: r.total,
      truncated: r.truncated,
    };
  }

  if (mode === "xpath") {
    if (!xpathExpr.trim())
      throw new Error("ValidationError: empty XPath expression");
    const matched = evaluateXPath(file.document, xpathExpr.trim());
    const byId = new Map(walk.map((e) => [e.node.id, e]));
    const items = matched
      .map((n) => byId.get(n.id))
      .filter((e): e is WalkEntry => Boolean(e))
      .map(toNodeMatch);
    return { kind: "nodes", items, count: items.length };
  }

  if (mode === "path") {
    return { kind: "path", count: 1, items: [resolvePath(walk, nodeId)] };
  }

  if (mode === "comments") {
    const items = searchComments(file.comments, {
      query,
      author,
      mentions,
      resolved,
    });
    return { kind: "comments", items, count: items.length };
  }

  if (mode === "annotations") {
    const items = searchAnnotations(walk, { query, pageScope });
    return { kind: "annotations", items, count: items.length };
  }

  if (mode === "dev") {
    const items = searchDev(file.devResources, { query, nodeId });
    return { kind: "dev", items, count: items.length };
  }

  if (mode === "all") {
    if (!query) throw new Error("ValidationError: searchAll requires a query");
    const base = {
      query,
      strMode: "contains" as const,
      caseSensitive: false,
      pageScope: "",
      maxResults: 999,
    };
    const names = runFind(walk, { ...base, types: [], against: "name" }).items;
    const text = runFind(walk, {
      ...base,
      types: ["TEXT"],
      against: "text",
    }).items;
    const comments = searchComments(file.comments, {
      query,
      author: "",
      mentions: "",
      resolved: "any",
    });
    const annotations = searchAnnotations(walk, { query, pageScope: "" });
    const dev = searchDev(file.devResources, { query, nodeId: "" });
    const groups = [
      {
        key: "names" as const,
        icon: "find" as const,
        label: "Layer names",
        items: names,
      },
      {
        key: "text" as const,
        icon: "find" as const,
        label: "Text content",
        items: text,
      },
      {
        key: "comments" as const,
        icon: "comments" as const,
        label: "Comments",
        items: comments,
      },
      {
        key: "annotations" as const,
        icon: "annotations" as const,
        label: "Annotations",
        items: annotations,
      },
      {
        key: "dev" as const,
        icon: "dev" as const,
        label: "Dev resources",
        items: dev,
      },
    ].map((g) => ({ ...g, count: g.items.length }));
    const total = groups.reduce((acc, g) => acc + g.count, 0);
    return {
      kind: "all",
      items: groups,
      count: total,
      facets: groups.map((g) => ({
        label: g.label.split(" ")[0],
        value: g.count,
      })),
    };
  }

  throw new Error("unknown mode");
}
