/**
 * Additional metadata describing a MailChannels API failure.
 *
 * @public
 */
export interface MailChannelsErrorOptions {
  /** HTTP status code returned by the service. */
  readonly status: number;
  /** Optional HTTP status text supplied by the upstream response. */
  readonly statusText?: string;
  /**
   * Request correlation identifier returned by MailChannels when present.
   * Many responses include `x-request-id`, which is surfaced here in a normalized form.
   */
  readonly requestId?: string;
  /**
   * Retry window expressed in seconds when a `Retry-After` header exists and can be parsed.
   */
  readonly retryAfterSeconds?: number;
  /**
   * Snapshot of all response headers keyed by lower-case header names.
   */
  readonly headers?: Record<string, string>;
  /**
   * Structured payload or raw body returned by the API.
   */
  readonly details?: unknown;
  /** Optional upstream cause preserved when available. */
  readonly cause?: unknown;
}

/**
 * Error raised when the MailChannels API responds with a non-success status.
 *
 * The class exposes additional HTTP metadata—status text, headers, retry hints, and
 * correlation identifiers—to simplify debugging and automated retries.
 *
 * @public
 */
export class MailChannelsError extends Error {
  /** HTTP status returned by the remote endpoint. */
  public readonly status: number;

  /** Optional HTTP status text returned by the service. */
  public readonly statusText?: string;

  /** Correlation identifier extracted from response headers when available. */
  public readonly requestId?: string;

  /** Parsed retry window in seconds derived from the `Retry-After` header. */
  public readonly retryAfterSeconds?: number;

  /** Snapshot of response headers keyed by lower-case header names. */
  public readonly headers: Readonly<Record<string, string>>;

  /** Structured payload or raw text describing the failure. */
  public readonly details?: unknown;

  /**
   * Creates a new MailChannels-specific error.
   *
   * @param message - Human-readable description of the failure.
   * @param init - Either the HTTP status code (legacy signature) or an options bag describing the failure context.
   * @param legacyDetails - Optional structured payload or raw text body received from the API (legacy signature only).
   */
  constructor(
    message: string,
    init: number | MailChannelsErrorOptions,
    legacyDetails?: unknown
  ) {
    if (typeof init === "number") {
      super(message);
      this.name = "MailChannelsError";
      this.status = init;
      this.statusText = undefined;
      this.requestId = undefined;
      this.retryAfterSeconds = undefined;
      this.headers = Object.freeze({});
      this.details = legacyDetails;
      return;
    }

    const { cause, headers, details, ...rest } = init;
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "MailChannelsError";
    this.status = rest.status;
    this.statusText = rest.statusText;
    this.requestId = rest.requestId;
    this.retryAfterSeconds = rest.retryAfterSeconds;
    this.headers = Object.freeze({ ...(headers ?? {}) });
    this.details = details;
  }
}
