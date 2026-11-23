#!/usr/bin/env node
import { loadFigmaSecrets } from "../secrets.js";
import { buildProgram } from "./program.js";
import { executeInvocation } from "./run.js";

// Fill FIGMA_TOKEN from the macOS keychain when the environment has none
// (vendored macos-keychain-env; docs/keychain-env.md). A store that cannot be
// read is reported, never fatal: the usual "no token" path then applies.
try {
  await loadFigmaSecrets();
} catch (err) {
  process.stderr.write(
    `figma-find: ${err instanceof Error ? err.message : String(err)}\n`,
  );
}

// Action handlers set process.exitCode from executeInvocation's return value;
// commander's own usage errors keep its default stderr + exit 1 behavior.
const program = buildProgram(executeInvocation);

program.parseAsync(process.argv).catch(() => {
  process.exitCode = process.exitCode || 1;
});
