#!/usr/bin/env node
import { buildProgram } from "./program.js";
import { executeInvocation } from "./run.js";

// Action handlers set process.exitCode from executeInvocation's return value;
// commander's own usage errors keep its default stderr + exit 1 behavior.
const program = buildProgram(executeInvocation);

program.parseAsync(process.argv).catch(() => {
  process.exitCode = process.exitCode || 1;
});
