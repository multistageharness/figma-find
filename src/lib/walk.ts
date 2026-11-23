import type {
  FigmaFile,
  FigmaNode,
  NodeMatch,
  NodePathInfo,
  PageInfo,
} from "../types.js";

/** Pre-order walk entry: a node plus its canonical structural addresses. */
export interface WalkEntry {
  node: FigmaNode;
  parent: FigmaNode;
  ancestors: FigmaNode[];
  page: string | null;
  depth: number;
  xpath: string;
  namePath: string;
  idPath: string;
}

export interface BuildWalkOptions {
  /** When true, invisible nodes (and their whole subtrees) are skipped. */
  visibleOnly?: boolean;
}

/**
 * Pre-order walk of a document producing entries with canonical xpath,
 * namePath, idPath, page name, and depth. The DOCUMENT root itself is not
 * emitted — only its descendants.
 */
export function buildWalk(
  doc: FigmaNode,
  { visibleOnly }: BuildWalkOptions = {},
): WalkEntry[] {
  const out: WalkEntry[] = [];
  const seg = (node: FigmaNode, parent: FigmaNode | null): string => {
    if (!parent) return node.type;
    const sameType = (parent.children ?? []).filter(
      (c) => c.type === node.type,
    );
    if (sameType.length === 1) return node.type;
    const i = sameType.indexOf(node) + 1;
    return `${node.type}[${i}]`;
  };
  const visit = (
    node: FigmaNode,
    parent: FigmaNode | null,
    ancestors: FigmaNode[],
    page: FigmaNode | null,
    depth: number,
    xParts: string[],
    nParts: string[],
  ) => {
    if (visibleOnly && node.visible === false) return; // skip node + subtree
    const x = parent ? [...xParts, seg(node, parent)] : [];
    const n = parent ? [...nParts, node.name] : [];
    if (parent) {
      out.push({
        node,
        parent,
        ancestors,
        page: page ? page.name : null,
        depth,
        xpath: `/${x.join("/")}`,
        namePath: n.join(" / "),
        idPath: ancestors
          .map((a) => a.id)
          .concat(node.id)
          .join(" / "),
      });
    }
    const nextPage = node.type === "CANVAS" ? node : page;
    node.children?.forEach((c) => {
      visit(
        c,
        node,
        parent ? [...ancestors, node] : [],
        nextPage,
        depth + 1,
        parent ? x : [],
        parent ? n : [],
      );
    });
  };
  visit(doc, null, [], null, -1, [], []);
  return out;
}

/** Flattens one walk entry into the public {@link NodeMatch} shape. */
export function toNodeMatch(entry: WalkEntry): NodeMatch {
  const { node } = entry;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    page: entry.page,
    xpath: entry.xpath,
    namePath: entry.namePath,
    depth: entry.depth,
    characters: node.characters,
  };
}

/** Every CANVAS directly under the document root, as `{ id, name }`. */
export function listPages(file: FigmaFile): PageInfo[] {
  return (file.document.children ?? [])
    .filter((c) => c.type === "CANVAS")
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Resolves a node id to its path info; mirrors the console's path mode. */
export function resolvePath(walk: WalkEntry[], nodeId: string): NodePathInfo {
  const entry = walk.find((e) => e.node.id === nodeId);
  if (!entry) throw new Error(`NodeNotFoundError: ${nodeId}`);
  return {
    id: entry.node.id,
    name: entry.node.name,
    type: entry.node.type,
    xpath: entry.xpath,
    namePath: entry.namePath,
    idPath: entry.idPath,
    page: entry.page,
  };
}
