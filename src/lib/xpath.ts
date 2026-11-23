import type { FigmaNode } from "../types.js";

/*
 * Faithful subset of the figma-find spec's XPath engine: '/' / '//' + implicit
 * descendant, node test = TYPE | '*', predicates with position re-numbering,
 * attr comparisons (dotted paths), contains/starts-with/ends-with, and/or/not,
 * position()/last()/text()/name()/type(), integer = position shorthand.
 */

export class XPathSyntaxError extends Error {}

interface Token {
  t: string;
  v: any;
  pos: number;
}

interface PredicateContext {
  node: FigmaNode;
  position: number;
  size: number;
}

type Operand = (ctx: PredicateContext) => any;

function tokenizeExpr(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const push = (t: string, v: any) => toks.push({ t, v, pos: i });
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      let s = "";
      i++;
      while (i < src.length) {
        if (src[i] === q) {
          if (src[i + 1] === q) {
            s += q;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      push("str", s);
      continue;
    }
    if (c === "@") {
      let j = i + 1;
      let s = "";
      while (j < src.length && /[\w.]/.test(src[j])) s += src[j++];
      i = j;
      push("attr", s);
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      let s = "";
      while (j < src.length && /[0-9.]/.test(src[j])) s += src[j++];
      i = j;
      push("num", parseFloat(s));
      continue;
    }
    if (/[\w-]/.test(c)) {
      let j = i;
      let s = "";
      while (j < src.length && /[\w-]/.test(src[j])) s += src[j++];
      i = j;
      push("name", s);
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["!=", "<=", ">="].includes(two)) {
      i += 2;
      push("op", two);
      continue;
    }
    if ("=<>".includes(c)) {
      i++;
      push("op", c);
      continue;
    }
    if ("(),".includes(c)) {
      i++;
      push(c, c);
      continue;
    }
    throw new XPathSyntaxError(`Unexpected '${c}' at ${i}`);
  }
  return toks;
}

function getAttr(node: FigmaNode, path: string): any {
  return path
    .split(".")
    .reduce<any>((o, k) => (o == null ? undefined : o[k]), node);
}

function num(v: any): number | null {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function compare(a: any, op: string, b: any): boolean {
  const na = num(a);
  const nb = num(b);
  if (na != null && nb != null) {
    switch (op) {
      case "=":
        return na === nb;
      case "!=":
        return na !== nb;
      case "<":
        return na < nb;
      case "<=":
        return na <= nb;
      case ">":
        return na > nb;
      case ">=":
        return na >= nb;
    }
  }
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);
  if (op === "=") return sa === sb;
  if (op === "!=") return sa !== sb;
  return false;
}

function callFunc(fn: string, args: any[], ctx: PredicateContext): any {
  const lc = (s: any) => (s == null ? "" : String(s)).toLowerCase();
  switch (fn) {
    case "contains":
      return String(args[0] ?? "").includes(String(args[1] ?? ""));
    case "icontains":
      return lc(args[0]).includes(lc(args[1]));
    case "starts-with":
      return String(args[0] ?? "").startsWith(String(args[1] ?? ""));
    case "ends-with":
      return String(args[0] ?? "").endsWith(String(args[1] ?? ""));
    case "matches":
      return new RegExp(args[1], args[2] || "").test(String(args[0] ?? ""));
    case "position":
      return ctx.position;
    case "last":
      return ctx.size;
    case "text":
      return ctx.node.characters ?? "";
    case "name":
      return ctx.node.name ?? "";
    case "type":
      return ctx.node.type ?? "";
    default:
      throw new XPathSyntaxError(`unknown function ${fn}()`);
  }
}

export function parsePredicate(
  src: string,
): (ctx: PredicateContext) => boolean {
  const toks = tokenizeExpr(src);
  let p = 0;
  const peek = () => toks[p];
  const isName = (v: string) => peek() && peek().t === "name" && peek().v === v;

  function parseExpr(): Operand {
    // or
    let l = parseAnd();
    while (isName("or")) {
      p++;
      const r = parseAnd();
      const a = l;
      const b = r;
      l = (ctx) => !!a(ctx) || !!b(ctx);
    }
    return l;
  }
  function parseAnd(): Operand {
    let l = parseUnary();
    while (isName("and")) {
      p++;
      const r = parseUnary();
      const a = l;
      const b = r;
      l = (ctx) => !!a(ctx) && !!b(ctx);
    }
    return l;
  }
  function parseUnary(): Operand {
    if (isName("not")) {
      p++;
      if (peek()?.t !== "(") throw new XPathSyntaxError("expected ( after not");
      p++;
      const inner = parseExpr();
      if (peek()?.t !== ")") throw new XPathSyntaxError("expected )");
      p++;
      return (ctx) => !inner(ctx);
    }
    return parseComparison();
  }
  function parseComparison(): Operand {
    const left = parseOperand();
    if (peek() && peek().t === "op") {
      const op = peek().v;
      p++;
      const right = parseOperand();
      return (ctx) => compare(left(ctx), op, right(ctx));
    }
    return left;
  }
  function parseOperand(): Operand {
    const tk = peek();
    if (!tk) throw new XPathSyntaxError("unexpected end of predicate");
    if (tk.t === "num") {
      p++;
      return () => tk.v;
    }
    if (tk.t === "str") {
      p++;
      return () => tk.v;
    }
    if (tk.t === "attr") {
      p++;
      return (ctx) => getAttr(ctx.node, tk.v);
    }
    if (tk.t === "name") {
      const fn = tk.v;
      p++;
      if (peek()?.t === "(") {
        // function call
        p++;
        const args: Operand[] = [];
        if (peek()?.t !== ")") {
          args.push(parseOperand());
          while (peek()?.t === ",") {
            p++;
            args.push(parseOperand());
          }
        }
        if (peek()?.t !== ")") throw new XPathSyntaxError("expected )");
        p++;
        return (ctx) =>
          callFunc(
            fn,
            args.map((a) => a(ctx)),
            ctx,
          );
      }
      return () => fn; // bare identifier as string
    }
    throw new XPathSyntaxError(`unexpected token '${tk.v}'`);
  }

  const root = parseExpr();
  if (p < toks.length)
    throw new XPathSyntaxError(`trailing input near '${toks[p].v}'`);
  return (ctx) => {
    const v = root(ctx);
    if (typeof v === "number") return v === ctx.position; // number => position test
    return !!v;
  };
}

interface Step {
  axis: "child" | "desc";
  raw: string;
}

function splitSteps(expr: string): Step[] {
  // split on / and //, preserving axis; ignore slashes inside [ ] and quotes.
  const steps: Step[] = [];
  let i = 0;
  let depth = 0;
  let buf = "";
  let q: string | null = null;
  let leading: "child" | "desc" = "desc"; // bare leading step = implicit descendant
  if (expr.startsWith("//")) {
    leading = "desc";
    i = 2;
  } else if (expr.startsWith("/")) {
    leading = "child";
    i = 1;
  }
  let axis: "child" | "desc" = leading;
  for (; i < expr.length; i++) {
    const c = expr[i];
    if (q) {
      buf += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      buf += c;
      continue;
    }
    if (c === "[") depth++;
    if (c === "]") depth--;
    if (c === "/" && depth === 0) {
      steps.push({ axis, raw: buf });
      buf = "";
      if (expr[i + 1] === "/") {
        axis = "desc";
        i++;
      } else {
        axis = "child";
      }
      continue;
    }
    buf += c;
  }
  if (buf.trim()) steps.push({ axis, raw: buf });
  return steps;
}

function parseStep(raw: string): { test: string; preds: string[] } {
  const m = raw.match(/^\s*(\*|[A-Za-z_][\w-]*)\s*((?:\[[^\]]*\])*)\s*$/);
  if (!m) throw new XPathSyntaxError(`malformed step '${raw}'`);
  const test = m[1];
  const preds: string[] = [];
  const pre = m[2];
  let i = 0;
  while (i < pre.length) {
    if (pre[i] === "[") {
      const j = pre.indexOf("]", i);
      preds.push(pre.slice(i + 1, j));
      i = j + 1;
    } else {
      i++;
    }
  }
  return { test, preds: preds.map((p) => p.trim()) };
}

function descendants(node: FigmaNode, out: FigmaNode[]): FigmaNode[] {
  node.children?.forEach((c) => {
    out.push(c);
    descendants(c, out);
  });
  return out;
}

/** Evaluates an XPath-subset expression against a document root. */
export function evaluateXPath(
  documentRoot: FigmaNode,
  expr: string,
): FigmaNode[] {
  const steps = splitSteps(expr).map((s) => ({
    axis: s.axis,
    ...parseStep(s.raw),
  }));
  let context: FigmaNode[] = [documentRoot];
  for (const step of steps) {
    let cand: FigmaNode[] = [];
    for (const ctx of context) {
      const pool =
        step.axis === "child" ? ctx.children || [] : descendants(ctx, []);
      for (const n of pool) {
        if (step.test === "*" || n.type === step.test.toUpperCase())
          cand.push(n);
      }
    }
    // dedupe, preserve order
    const seen = new Set<string>();
    cand = cand.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    for (const predSrc of step.preds) {
      const intMatch = /^\d+$/.test(predSrc);
      const fn = intMatch
        ? (ctx: PredicateContext) => ctx.position === parseInt(predSrc, 10)
        : parsePredicate(predSrc);
      const size = cand.length;
      cand = cand.filter((node, idx) => fn({ node, position: idx + 1, size }));
    }
    context = cand;
  }
  return context;
}
