import { Command, InvalidArgumentError, Option } from "commander";
import type { QueryConfig, SearchModeId, StringMatchMode } from "../types.js";

/**
 * One parsed CLI call, normalized onto the engine's vocabulary. The grammar is
 * frozen by figma-find-console/v100/src/lib/cli.ts — whatever string that
 * console's CliPreview emits, this parser accepts.
 */
export interface Invocation {
  /** The `dev-resources` subcommand maps to mode id `"dev"`. */
  mode: SearchModeId;
  fileKey: string;
  config: QueryConfig;
  /** True unless --all-nodes. */
  visibleOnly: boolean;
  /** --input <path>: query a local FigmaFile JSON instead of the API. */
  input?: string;
  /** --token <token>: explicit Figma API token. */
  token?: string;
}

export type InvocationHandler = (inv: Invocation) => Promise<number>;

const defaultConfig = (): QueryConfig => ({
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
});

function positiveInt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new InvalidArgumentError("expected a positive integer");
  }
  return n;
}

const TOKEN_HELP =
  "Figma API token (else FIGMA_TOKEN / FIGMA_API_TOKEN / FIGMA_ACCESS_TOKEN)";

/** Options every subcommand accepts. */
function common(cmd: Command): Command {
  return cmd
    .option("--json", "output JSON (default; the only format in v100)")
    .option("--input <path>", "query a local FigmaFile JSON instead of the API")
    .option("--token <token>", TOKEN_HELP);
}

/** Builds the figma-find commander program around an injected handler. */
export function buildProgram(handler: InvocationHandler): Command {
  const program = new Command();
  program
    .name("figma-find")
    .description(
      "find, xpath, path, pages, comments, annotations, dev-resources and " +
        "federated search over a Figma file (engine ported from " +
        "figma-find-console)",
    )
    .option("--input <path>", "query a local FigmaFile JSON instead of the API")
    .option("--token <token>", TOKEN_HELP);

  const dispatch = async (
    cmd: Command,
    mode: SearchModeId,
    fileKey: string,
    config: QueryConfig,
    visibleOnly = true,
  ): Promise<void> => {
    const g = cmd.optsWithGlobals();
    process.exitCode = await handler({
      mode,
      fileKey,
      config,
      visibleOnly,
      input: g.input,
      token: g.token,
    });
  };

  common(
    program
      .command("find")
      .description("find nodes by layer name and/or type")
      .argument("<fileKey>", "Figma file key")
      .option("--name <query>", "match layer names")
      .option(
        "--type <types>",
        "comma-separated types (TEXT,FRAME,image,shape)",
      )
      .addOption(
        new Option(
          "--mode <mode>",
          "string match mode (default: contains)",
        ).choices(["exact", "startsWith", "endsWith", "regex"]),
      )
      .option("--case-sensitive", "match case-sensitively")
      .option("--page <name>", "restrict to one page")
      .option("--all-nodes", "include invisible nodes")
      .option("--max <n>", "maximum results (default: 50)", positiveInt),
  ).action(async (fileKey: string, opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.query = opts.name ?? "";
    if (opts.type) {
      config.types = String(opts.type)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    config.strMode = (opts.mode ?? "contains") as StringMatchMode;
    config.caseSensitive = Boolean(opts.caseSensitive);
    config.pageScope = opts.page ?? "";
    if (opts.max != null) config.maxResults = opts.max;
    await dispatch(cmd, "find", fileKey, config, !opts.allNodes);
  });

  common(
    program
      .command("xpath")
      .description("evaluate an XPath-subset selector")
      .argument("<fileKey>", "Figma file key")
      .argument("<expr>", "XPath expression"),
  ).action(async (fileKey: string, expr: string, _opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.xpathExpr = expr;
    await dispatch(cmd, "xpath", fileKey, config);
  });

  common(
    program
      .command("path")
      .description("canonical structural address of one node")
      .argument("<fileKey>", "Figma file key")
      .argument("<nodeId>", "node id (e.g. 3:12)"),
  ).action(
    async (fileKey: string, nodeId: string, _opts: any, cmd: Command) => {
      const config = defaultConfig();
      config.nodeId = nodeId;
      await dispatch(cmd, "path", fileKey, config);
    },
  );

  common(
    program
      .command("pages")
      .description("list the file's canvases")
      .argument("<fileKey>", "Figma file key"),
  ).action(async (fileKey: string, _opts: any, cmd: Command) => {
    await dispatch(cmd, "pages", fileKey, defaultConfig());
  });

  common(
    program
      .command("comments")
      .description("search comment threads")
      .argument("<fileKey>", "Figma file key")
      .option("--query <q>", "match message text")
      .option("--author <handle>", "filter by author handle")
      .option("--mentions <handle>", "filter by @mention")
      .addOption(
        new Option("--resolved", "only resolved threads").conflicts(
          "unresolved",
        ),
      )
      .option("--unresolved", "only unresolved threads"),
  ).action(async (fileKey: string, opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.query = opts.query ?? "";
    config.author = opts.author ?? "";
    config.mentions = opts.mentions ?? "";
    if (opts.resolved) config.resolved = "resolved";
    else if (opts.unresolved) config.resolved = "unresolved";
    await dispatch(cmd, "comments", fileKey, config);
  });

  common(
    program
      .command("annotations")
      .description("search dev-mode annotations")
      .argument("<fileKey>", "Figma file key")
      .option("--query <q>", "match annotation labels")
      .option("--page <name>", "restrict to one page"),
  ).action(async (fileKey: string, opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.query = opts.query ?? "";
    config.pageScope = opts.page ?? "";
    await dispatch(cmd, "annotations", fileKey, config);
  });

  common(
    program
      .command("dev-resources")
      .description("search dev-resource links")
      .argument("<fileKey>", "Figma file key")
      .option("--query <q>", "match resource name or url")
      .option("--node <nodeId>", "restrict to one node"),
  ).action(async (fileKey: string, opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.query = opts.query ?? "";
    config.nodeId = opts.node ?? "";
    await dispatch(cmd, "dev", fileKey, config);
  });

  common(
    program
      .command("all")
      .description(
        "federated search across names, text, comments, annotations and dev resources",
      )
      .argument("<fileKey>", "Figma file key")
      .argument("<query>", "search query"),
  ).action(async (fileKey: string, query: string, _opts: any, cmd: Command) => {
    const config = defaultConfig();
    config.query = query;
    await dispatch(cmd, "all", fileKey, config);
  });

  return program;
}

/**
 * Test helper: parses argv (commander "user" form, no node/script prefix) with
 * a capturing handler and exitOverride, so parse errors throw instead of
 * exiting the process.
 */
export function parseInvocation(argv: string[]): Invocation {
  let captured: Invocation | undefined;
  const program = buildProgram(async (inv) => {
    captured = inv;
    return 0;
  });
  program.exitOverride();
  for (const cmd of program.commands) cmd.exitOverride();
  program.parse(argv, { from: "user" });
  if (!captured) throw new Error("no invocation captured");
  return captured;
}
