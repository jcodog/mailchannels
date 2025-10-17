/**
 * Custom error representing an unexpected response from the MailChannels API.
 */
export class MailChannelsError extends Error {
  /** HTTP status returned by the remote endpoint. */
  public readonly status: number;

  /** Optional structured error payload returned by the API. */
  public readonly details?: unknown;

  /**
   * Creates a new MailChannels-specific error.
   *
   * @param message - Human-readable description of the failure.
   * @param status - HTTP status code returned by the MailChannels API.
   * @param details - Optional structured payload or raw text body received from the API.
   */
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "MailChannelsError";
    this.status = status;
    this.details = details;
  }
}
