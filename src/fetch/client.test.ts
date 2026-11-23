import { afterEach, describe, expect, it, vi } from "vitest";
import { FigmaRestClient } from "./client.js";
import {
  FigmaAuthError,
  FigmaHttpError,
  FigmaNetworkError,
  FigmaNotFoundError,
} from "./errors.js";
import { resolveFigmaToken } from "./token.js";

interface Call {
  url: string;
  init?: RequestInit;
}

function makeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: any, init?: any) => {
    calls.push({ url: String(url), init });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

const clearTokenEnv = () => {
  vi.stubEnv("FIGMA_TOKEN", "");
  vi.stubEnv("FIGMA_API_TOKEN", "");
  vi.stubEnv("FIGMA_ACCESS_TOKEN", "");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveFigmaToken", () => {
  it("explicit argument beats every env var", () => {
    vi.stubEnv("FIGMA_TOKEN", "env-token");
    expect(resolveFigmaToken("explicit")).toBe("explicit");
  });

  it("walks FIGMA_TOKEN -> FIGMA_API_TOKEN -> FIGMA_ACCESS_TOKEN", () => {
    vi.stubEnv("FIGMA_TOKEN", "a");
    vi.stubEnv("FIGMA_API_TOKEN", "b");
    vi.stubEnv("FIGMA_ACCESS_TOKEN", "c");
    expect(resolveFigmaToken()).toBe("a");
    vi.stubEnv("FIGMA_TOKEN", "");
    expect(resolveFigmaToken()).toBe("b");
    vi.stubEnv("FIGMA_API_TOKEN", "");
    expect(resolveFigmaToken()).toBe("c");
    vi.stubEnv("FIGMA_ACCESS_TOKEN", "");
    expect(resolveFigmaToken()).toBeUndefined();
  });
});

describe("FigmaRestClient construction", () => {
  it("throws FigmaAuthError naming all three env vars when no token resolves", () => {
    clearTokenEnv();
    expect(() => new FigmaRestClient()).toThrowError(FigmaAuthError);
    try {
      new FigmaRestClient();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("FIGMA_TOKEN");
      expect(message).toContain("FIGMA_API_TOKEN");
      expect(message).toContain("FIGMA_ACCESS_TOKEN");
    }
  });
});

describe("requests", () => {
  it("sends X-Figma-Token to the files endpoint", async () => {
    const { impl, calls } = makeFetch(json({ name: "F" }));
    const client = new FigmaRestClient({ token: "tok", fetchImpl: impl });
    const body = await client.getFile("KEY");
    expect(body).toEqual({ name: "F" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.figma.com/v1/files/KEY");
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["X-Figma-Token"]).toBe("tok");
  });

  it("appends depth as a query string when provided", async () => {
    const { impl, calls } = makeFetch(json({}));
    const client = new FigmaRestClient({ token: "tok", fetchImpl: impl });
    await client.getFile("KEY", { depth: 2 });
    expect(calls[0].url).toBe("https://api.figma.com/v1/files/KEY?depth=2");
  });

  it("unwraps comments, defaulting a missing key to []", async () => {
    const canned: unknown[] = [{ comments: [{ id: "c1" }] }, {}];
    const { impl, calls } = makeFetch(
      () => new Response(JSON.stringify(canned.shift()), { status: 200 }),
    );
    const client = new FigmaRestClient({ token: "tok", fetchImpl: impl });
    await expect(client.getComments("KEY")).resolves.toEqual([{ id: "c1" }]);
    expect(calls[0].url).toBe("https://api.figma.com/v1/files/KEY/comments");
    await expect(client.getComments("KEY")).resolves.toEqual([]);
  });

  it("unwraps dev_resources, defaulting a missing key to []", async () => {
    const canned: unknown[] = [{ dev_resources: [{ id: "d1" }] }, {}];
    const { impl, calls } = makeFetch(
      () => new Response(JSON.stringify(canned.shift()), { status: 200 }),
    );
    const client = new FigmaRestClient({ token: "tok", fetchImpl: impl });
    await expect(client.getDevResources("KEY")).resolves.toEqual([
      { id: "d1" },
    ]);
    expect(calls[0].url).toBe(
      "https://api.figma.com/v1/files/KEY/dev_resources",
    );
    await expect(client.getDevResources("KEY")).resolves.toEqual([]);
  });
});

describe("error mapping", () => {
  const clientWith = (status: number) => {
    const { impl } = makeFetch(json({ err: true }, status));
    return new FigmaRestClient({ token: "tok", fetchImpl: impl });
  };

  it("401 and 403 map to FigmaAuthError", async () => {
    await expect(clientWith(401).getFile("KEY")).rejects.toBeInstanceOf(
      FigmaAuthError,
    );
    await expect(clientWith(403).getFile("KEY")).rejects.toBeInstanceOf(
      FigmaAuthError,
    );
  });

  it("404 maps to FigmaNotFoundError carrying the key", async () => {
    const err = await clientWith(404)
      .getFile("MISSING")
      .catch((e) => e);
    expect(err).toBeInstanceOf(FigmaNotFoundError);
    expect(err.fileKey).toBe("MISSING");
  });

  it("other non-2xx maps to FigmaHttpError with the status", async () => {
    const err = await clientWith(500)
      .getFile("KEY")
      .catch((e) => e);
    expect(err).toBeInstanceOf(FigmaHttpError);
    expect(err.status).toBe(500);
  });

  it("a rejecting fetch maps to FigmaNetworkError with the original cause", async () => {
    const boom = new Error("ECONNREFUSED");
    const impl = (async () => {
      throw boom;
    }) as typeof fetch;
    const client = new FigmaRestClient({ token: "tok", fetchImpl: impl });
    const err = await client.getFile("KEY").catch((e) => e);
    expect(err).toBeInstanceOf(FigmaNetworkError);
    expect(err.cause).toBe(boom);
  });
});
