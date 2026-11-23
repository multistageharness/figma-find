import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { FigmaComment, FigmaDevResource, FigmaFile } from "../types.js";
import { FigmaRestClient } from "./client.js";

/** The client surface hydration needs (satisfied by FigmaRestClient or a stub). */
export interface HydrateClient {
  getFile(key: string): Promise<any>;
  getComments(key: string): Promise<FigmaComment[]>;
  getDevResources(key: string): Promise<FigmaDevResource[]>;
}

export interface HydrateOptions {
  /** Injected in tests; else a FigmaRestClient is built from `token`/env. */
  client?: HydrateClient;
  token?: string;
}

function settle<T>(facet: string, result: PromiseSettledResult<T[]>): T[] {
  if (result.status === "fulfilled") return result.value;
  const msg =
    result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);
  console.error(
    `figma-find: warning: could not fetch ${facet} (${msg}); continuing with []`,
  );
  return [];
}

/**
 * Assembles one FigmaFile aggregate from the three REST endpoints. The
 * document fetch is authoritative (any error propagates); comments and dev
 * resources are enrichments and degrade to `[]` with a stderr warning.
 */
export async function hydrateFigmaFile(
  fileKey: string,
  opts: HydrateOptions = {},
): Promise<FigmaFile> {
  const client = opts.client ?? new FigmaRestClient({ token: opts.token });
  const raw = await client.getFile(fileKey);
  const [comments, devResources] = await Promise.allSettled([
    client.getComments(fileKey),
    client.getDevResources(fileKey),
  ]);
  return {
    key: fileKey,
    name: raw.name,
    lastModified: raw.lastModified,
    document: raw.document,
    comments: settle("comments", comments),
    devResources: settle("dev resources", devResources),
  };
}

/** Loads a FigmaFile-shaped JSON from disk (the --input offline path). */
export async function loadFigmaFile(path: string): Promise<FigmaFile> {
  const text = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`ValidationError: ${path} is not valid JSON`);
  }
  const obj = parsed as Record<string, unknown> | null;
  if (
    typeof obj !== "object" ||
    obj === null ||
    Array.isArray(obj) ||
    typeof obj.document !== "object" ||
    obj.document === null
  ) {
    throw new Error(
      `ValidationError: ${path} does not look like a FigmaFile (missing document)`,
    );
  }
  if (obj.comments !== undefined && !Array.isArray(obj.comments)) {
    throw new Error(`ValidationError: ${path} has a non-array comments field`);
  }
  if (obj.devResources !== undefined && !Array.isArray(obj.devResources)) {
    throw new Error(
      `ValidationError: ${path} has a non-array devResources field`,
    );
  }
  return {
    key: typeof obj.key === "string" ? obj.key : "",
    name: typeof obj.name === "string" ? obj.name : basename(path),
    lastModified: typeof obj.lastModified === "string" ? obj.lastModified : "",
    document: obj.document as FigmaFile["document"],
    comments: (obj.comments ?? []) as FigmaComment[],
    devResources: (obj.devResources ?? []) as FigmaDevResource[],
  };
}
