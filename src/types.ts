/** A single paint entry on a node (only `type` matters for the IMAGE alias). */
export interface FigmaPaint {
  type: string;
}

/** A dev-mode annotation attached to a node. */
export interface FigmaAnnotation {
  label: string;
  categoryId: string;
}

/** One node of a Figma document tree (REST-API shape, loosely typed). */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  characters?: string;
  fills?: FigmaPaint[];
  background?: FigmaPaint[];
  annotations?: FigmaAnnotation[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  /** XPath attribute predicates resolve arbitrary dotted paths. */
  [key: string]: unknown;
}

export interface FigmaCommentUser {
  handle: string;
  img_url?: string;
}

/** One comment as returned by the Figma comments endpoint. */
export interface FigmaComment {
  id: string;
  message: string;
  user: FigmaCommentUser;
  created_at: string;
  resolved_at: string | null;
  client_meta?: { node_id?: string };
  parent_id?: string;
}

/** One dev-resource link anchored to a node. */
export interface FigmaDevResource {
  id: string;
  name: string;
  url: string;
  node_id: string;
}

/** The cached file the console searches against. */
export interface FigmaFile {
  key: string;
  name: string;
  lastModified: string;
  document: FigmaNode;
  comments: FigmaComment[];
  devResources: FigmaDevResource[];
}

/** The eight console modes. */
export type SearchModeId =
  | "find"
  | "xpath"
  | "comments"
  | "annotations"
  | "dev"
  | "all"
  | "path"
  | "pages";

export type StringMatchMode =
  | "contains"
  | "exact"
  | "startsWith"
  | "endsWith"
  | "regex";

export type ResolvedFilter = "any" | "resolved" | "unresolved";

export interface PageInfo {
  id: string;
  name: string;
}

/** Normalized node hit returned by find / xpath queries. */
export interface NodeMatch {
  id: string;
  name: string;
  type: string;
  page: string | null;
  xpath: string;
  namePath: string;
  depth: number;
  characters?: string;
}

export interface CommentMatch {
  id: string;
  message: string;
  author: string;
  resolved: boolean;
  createdAt: string;
  threadId: string;
  isRoot: boolean;
  nodeId?: string;
}

export interface AnnotationMatch {
  label: string;
  categoryId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  page: string | null;
  xpath: string;
}

export interface DevResourceMatch {
  id: string;
  name: string;
  url: string;
  nodeId: string;
}

/** Canonical structural address of one node (the `path` mode result). */
export interface NodePathInfo {
  id: string;
  name: string;
  type: string;
  xpath: string;
  namePath: string;
  idPath: string;
  page: string | null;
}

/** One category bucket of a federated `all` search. */
export interface FederatedGroup {
  key: "names" | "text" | "comments" | "annotations" | "dev";
  icon: string;
  label: string;
  items: any[];
  count: number;
  degraded?: boolean;
}

export interface ResultFacet {
  label: string;
  value: number;
}

/** Discriminated result envelope rendered by the results panel. */
export type QueryResults =
  | {
      kind: "nodes";
      items: NodeMatch[];
      count: number;
      truncated?: boolean;
      facets?: ResultFacet[];
    }
  | {
      kind: "comments";
      items: CommentMatch[];
      count: number;
      facets?: ResultFacet[];
    }
  | {
      kind: "annotations";
      items: AnnotationMatch[];
      count: number;
      facets?: ResultFacet[];
    }
  | {
      kind: "dev";
      items: DevResourceMatch[];
      count: number;
      facets?: ResultFacet[];
    }
  | { kind: "pages"; items: PageInfo[]; count: number; facets?: ResultFacet[] }
  | {
      kind: "path";
      items: NodePathInfo[];
      count: number;
      facets?: ResultFacet[];
    }
  | {
      kind: "all";
      items: FederatedGroup[];
      count: number;
      facets?: ResultFacet[];
    };

/** Everything a query run needs besides the file itself. */
export interface QueryConfig {
  query: string;
  strMode: StringMatchMode;
  caseSensitive: boolean;
  types: string[];
  pageScope: string;
  maxResults: number;
  xpathExpr: string;
  author: string;
  mentions: string;
  resolved: ResolvedFilter;
  nodeId: string;
}

/** Type filters offered in find mode; lowercase entries are aliases. */
export const NODE_TYPE_FILTERS = [
  "TEXT",
  "FRAME",
  "INSTANCE",
  "RECTANGLE",
  "VECTOR",
  "image",
  "shape",
];

/** Coarse "n days ago" qualifier for an ISO timestamp. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const d = (now - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  return `${Math.round(d)}d ago`;
}
