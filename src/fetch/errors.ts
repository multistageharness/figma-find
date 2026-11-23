/** Missing token, or the API answered 401/403. */
export class FigmaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FigmaAuthError";
  }
}

/** The file key does not resolve (HTTP 404). */
export class FigmaNotFoundError extends Error {
  readonly fileKey: string;

  constructor(fileKey: string) {
    super(`FigmaNotFoundError: file '${fileKey}' not found (404)`);
    this.name = "FigmaNotFoundError";
    this.fileKey = fileKey;
  }
}

/** Any other non-2xx response. */
export class FigmaHttpError extends Error {
  readonly status: number;

  constructor(status: number, detail = "") {
    super(`FigmaHttpError: HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "FigmaHttpError";
    this.status = status;
  }
}

/** The fetch itself rejected (DNS, refused connection, timeout, ...). */
export class FigmaNetworkError extends Error {
  constructor(cause: unknown) {
    super(
      `FigmaNetworkError: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "FigmaNetworkError";
  }
}
