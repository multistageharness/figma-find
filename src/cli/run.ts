import {
  FigmaAuthError,
  FigmaHttpError,
  FigmaNetworkError,
  FigmaNotFoundError,
} from "../fetch/errors.js";
import { hydrateFigmaFile, loadFigmaFile } from "../fetch/hydrate.js";
import { runQuery } from "../lib/query.js";
import { buildWalk } from "../lib/walk.js";
import { XPathSyntaxError } from "../lib/xpath.js";
import type { Invocation } from "./program.js";

/**
 * Bridges a parsed Invocation to engine output: acquire the file (--input or
 * live hydration), build the walk, run the query, print JSON. Returns the exit
 * code: 0 ok; 1 query/user error; 2 transport/unexpected error. Nothing but
 * result JSON is ever written to stdout.
 */
export async function executeInvocation(inv: Invocation): Promise<number> {
  try {
    const file = inv.input
      ? await loadFigmaFile(inv.input)
      : await hydrateFigmaFile(inv.fileKey, { token: inv.token });
    const walk = buildWalk(file.document, { visibleOnly: inv.visibleOnly });
    const results = runQuery(inv.mode, file, walk, inv.config);
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof XPathSyntaxError ||
      /^(ValidationError|NodeNotFoundError):/.test(message)
    ) {
      process.stderr.write(`figma-find: ${message}\n`);
      return 1;
    }
    if (
      err instanceof FigmaAuthError ||
      err instanceof FigmaNotFoundError ||
      err instanceof FigmaHttpError ||
      err instanceof FigmaNetworkError
    ) {
      process.stderr.write(`figma-find: ${message}\n`);
      return 2;
    }
    process.stderr.write(`figma-find: unexpected error: ${message}\n`);
    return 2;
  }
}
