/**
 * Core type definitions for the MailChannels Email API wrapper.
 *
 * @see https://docs.mailchannels.net/email-api/sending-email/email-structure
 * @see https://docs.mailchannels.net/email-api/sending-email/personalizations
 * @see https://docs.mailchannels.net/email-api/sending-email/attachments
 */

/**
 * Represents a single email address with optional display name.
 *
 * @example
 * ```ts
 * const sender: EmailAddress = {
 *   email: "sender@example.com",
 *   name: "Sender Name",
 * };
 * ```
 */
export interface EmailAddress {
  /** RFC 5321 compliant email address, for example `sender@example.com`. */
  readonly email: string;

  /** Optional raw-text display name that MailChannels encodes on send. */
  readonly name?: string;
}

/**
 * Describes an individual recipient segment that can override metadata per user.
 *
 * @example
 * ```ts
 * const personalization: Personalization = {
 *   to: [{ email: "recipient@example.com" }],
 *   subject: "Hello",
 *   dynamic_template_data: { firstName: "Alex" },
 * };
 * ```
 */
export interface Personalization {
  /** Array containing at least one primary recipient. */
  readonly to: EmailAddress[];

  /** Optional carbon copy recipients. */
  readonly cc?: EmailAddress[];

  /** Optional blind carbon copy recipients. */
  readonly bcc?: EmailAddress[];

  /** Overrides the global subject for this recipient group when provided. */
  readonly subject?: string;

  /** Overrides or augments message headers for this recipient group. */
  readonly headers?: Record<string, string>;

  /**
   * Domain name used when applying per-message DKIM signing.
   * @see https://docs.mailchannels.net/email-api/dkim/
   */
  readonly dkim_domain?: string;

  /**
   * Base64-encoded private key used for per-message DKIM signing.
   * @see https://docs.mailchannels.net/email-api/dkim/
   */
  readonly dkim_private_key?: string;

  /** Selector used alongside {@link Personalization.dkim_domain}. */
  readonly dkim_selector?: string;

  /** Template merge values corresponding to placeholders in stored templates. */
  readonly dynamic_template_data?: Record<string, unknown>;
}

/**
 * Represents a single content block that MailChannels delivers via multipart/alternative.
 *
 * @example
 * ```ts
 * const html: ContentBlock = { type: "text/html", value: "<p>Hello</p>" };
 * ```
 */
export interface ContentBlock {
  /** MIME type, such as `text/plain` or `text/html`. */
  readonly type: string;

  /** Raw body contents for the specified {@link ContentBlock.type}. */
  readonly value: string;
}

/**
 * Represents an email attachment encoded according to MailChannels requirements.
 *
 * @example
 * ```ts
 * const attachment: Attachment = {
 *   type: "application/pdf",
 *   filename: "invoice.pdf",
 *   content: base64Pdf,
 * };
 * ```
 */
export interface Attachment {
  /** MIME type of the attachment, as described in the MailChannels documentation. */
  readonly type: string;

  /** File name displayed to the recipient. */
  readonly filename: string;

  /** Base64-encoded payload for the attachment. */
  readonly content: string;
}

/**
 * Core payload accepted by the MailChannels `/send` endpoint.
 *
 * @see https://docs.mailchannels.net/email-api/sending-email/email-structure
 * @see https://docs.mailchannels.net/email-api/sending-email/personalizations
 *
 * @example
 * ```ts
 * const payload: SendEmailRequest = {
 *   personalizations: [{ to: [{ email: "recipient@example.com" }] }],
 *   from: { email: "sender@example.com" },
 *   subject: "Welcome",
 *   content: [
 *     { type: "text/plain", value: "Welcome to our service." },
 *     { type: "text/html", value: "<p>Welcome to our service.</p>" },
 *   ],
 * };
 * ```
 */
export interface SendEmailRequest {
  /** Recipient definitions describing who should receive the message. */
  readonly personalizations: Personalization[];

  /** Global sender address used if not overridden per personalization. */
  readonly from: EmailAddress;

  /** Optional reply-to envelope address. */
  readonly reply_to?: EmailAddress;

  /**
   * Message subject line. Can be omitted when every personalization overrides it.
   */
  readonly subject?: string;

  /**
   * Ordered list of content blocks comprising the message body.
   * The recommended order is text/plain followed by text/html.
   */
  readonly content: ContentBlock[];

  /** Global headers applied to the message prior to sending. */
  readonly headers?: Record<string, string>;

  /** Optional attachments encoded as documented by MailChannels. */
  readonly attachments?: Attachment[];

  /** Domain used when applying DKIM at the request body level. */
  readonly dkim_domain?: string;

  /** Selector used when applying DKIM at the request body level. */
  readonly dkim_selector?: string;

  /** Base64-encoded private key applied when signing via the request body. */
  readonly dkim_private_key?: string;

  /** Additional properties passed through verbatim to support advanced API features. */
  readonly [key: string]: unknown;
}

/**
 * Options used when executing a send operation.
 */
export interface SendEmailOptions {
  /**
   * When true the request is issued with the `dry-run` query parameter, returning
   * validation results without delivering the message.
   */
  readonly dryRun?: boolean;

  /** Optional AbortSignal for cancelling an in-flight request. */
  readonly signal?: AbortSignal;

  /** Optional override for the request idempotency key. */
  readonly idempotencyKey?: string;
}

/**
 * Successful MailChannels response payload.
 */
export interface SendEmailResponse {
  /** HTTP status code returned by the platform. */
  readonly status: number;

  /** Optional message identifier returned by MailChannels when available. */
  readonly id?: string;

  /** Optional diagnostic payload provided on success. */
  readonly data?: unknown;
}

/**
 * Options accepted by the {@link MailChannelsClient} constructor.
 *
 * @example
 * ```ts
 * const options: MailChannelsClientOptions = {
 *   apiKey: process.env.MAILCHANNELS_API_KEY!,
 *   dkim: {
 *     domain: "example.com",
 *     selector: "mcdkim",
 *     privateKey: process.env.MAILCHANNELS_DKIM_PRIVATE_KEY!,
 *   },
 * };
 * ```
 */
export interface MailChannelsClientOptions {
  /** API key generated in the MailChannels console with the `api` scope. */
  readonly apiKey: string;

  /** Default DKIM credentials applied to every message. */
  readonly dkim: DkimConfig;

  /** Base URL for the transactional API; defaults to the production endpoint. */
  readonly baseUrl?: string;

  /** Custom fetch implementation (defaults to the global `fetch`). */
  readonly fetchImplementation?: typeof fetch;

  /** Optional default headers appended to every request. */
  readonly defaultHeaders?: Record<string, string>;
}

/**
 * Default DKIM credentials required when creating a {@link MailChannelsClient}.
 */
export interface DkimConfig {
  /** Domain associated with the DKIM key (typically matches the From address domain). */
  readonly domain: string;

  /** DNS selector for the published DKIM record. */
  readonly selector: string;

  /** Base64-encoded private key used to sign messages. */
  readonly privateKey: string;
}
