import type { FigmaComment, FigmaDevResource } from "../types.js";
import {
  FigmaAuthError,
  FigmaHttpError,
  FigmaNetworkError,
  FigmaNotFoundError,
} from "./errors.js";
import { resolveFigmaToken, TOKEN_ENV_VARS } from "./token.js";

export interface FigmaRestClientOptions {
  token?: string;
  /** Default `https://api.figma.com`. */
  baseUrl?: string;
  /** Injectable for tests; default `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/** Thin native-fetch client over the three endpoints the aggregate needs. */
export class FigmaRestClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FigmaRestClientOptions = {}) {
    const token = resolveFigmaToken(opts.token);
    if (!token) {
      throw new FigmaAuthError(
        `FigmaAuthError: no Figma token found; set one of ${TOKEN_ENV_VARS.join(" / ")}`,
      );
    }
    this.token = token;
    this.baseUrl = opts.baseUrl ?? "https://api.figma.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** `GET /v1/files/{key}` — the raw file JSON. */
  async getFile(key: string, params?: { depth?: number }): Promise<any> {
    const qs = params?.depth != null ? `?depth=${params.depth}` : "";
    return this.request(`/v1/files/${key}${qs}`, key);
  }

  /** `GET /v1/files/{key}/comments` — unwrapped to the array. */
  async getComments(key: string): Promise<FigmaComment[]> {
    const body = await this.request(`/v1/files/${key}/comments`, key);
    return body.comments ?? [];
  }

  /** `GET /v1/files/{key}/dev_resources` — unwrapped to the array. */
  async getDevResources(key: string): Promise<FigmaDevResource[]> {
    const body = await this.request(`/v1/files/${key}/dev_resources`, key);
    return body.dev_resources ?? [];
  }

  private async request(path: string, fileKey: string): Promise<any> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { "X-Figma-Token": this.token },
      });
    } catch (err) {
      throw new FigmaNetworkError(err);
    }
    if (res.status === 401 || res.status === 403) {
      throw new FigmaAuthError(
        `FigmaAuthError: HTTP ${res.status} — the token was rejected or lacks access`,
      );
    }
    if (res.status === 404) throw new FigmaNotFoundError(fileKey);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new FigmaHttpError(res.status, text.slice(0, 200));
    }
    return res.json();
  }
}
