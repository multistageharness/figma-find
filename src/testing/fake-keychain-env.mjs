/**
 * Stand-in for the vendored macos-keychain-env module: the two entry points the
 * secrets loader calls, recording every call on `globalThis.__fakeKeychainCalls`
 * and filling the target with an obviously fake value. Never touches the
 * real keychain.
 */
const VALUE = "fake-token-from-stub";

function apply(opts) {
  globalThis.__fakeKeychainCalls ??= [];
  globalThis.__fakeKeychainCalls.push(opts);
  const target = opts.target ?? process.env;
  const loaded = [];
  const skipped = [];
  for (const [name, ref] of Object.entries(opts.entries ?? {})) {
    if (target[name] && !opts.override) {
      skipped.push(name);
      continue;
    }
    if (ref.service === "empty-service") continue;
    target[name] = VALUE;
    loaded.push(name);
  }
  const missing = Object.keys(opts.entries ?? {}).filter(
    (n) => !loaded.includes(n) && !skipped.includes(n),
  );
  return { loaded, skipped, missing };
}

export async function loadEnv(opts) {
  return apply(opts);
}
export function loadEnvSync(opts) {
  return apply(opts);
}
