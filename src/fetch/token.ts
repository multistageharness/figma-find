/** Env vars consulted for a Figma token, in precedence order. */
export const TOKEN_ENV_VARS = [
  "FIGMA_TOKEN",
  "FIGMA_API_TOKEN",
  "FIGMA_ACCESS_TOKEN",
] as const;

/** Explicit arg wins; otherwise first non-empty env var; undefined when none. */
export function resolveFigmaToken(explicit?: string): string | undefined {
  if (explicit) return explicit;
  for (const name of TOKEN_ENV_VARS) {
    const v = process.env[name];
    if (v) return v;
  }
  return undefined;
}
