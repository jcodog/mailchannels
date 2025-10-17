/**
 * Thin, well-typed wrapper around the MailChannels Email API.
 *
 * @see https://docs.mailchannels.net/email-api/sending-email/email-intro
 */
import { MailChannelsError } from "./errors.js";
import {
  Attachment,
  ContentBlock,
  DkimConfig,
  EmailAddress,
  MailChannelsClientOptions,
  Personalization,
  SendEmailOptions,
  SendEmailRequest,
  SendEmailResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.mailchannels.net/tx/v1";
const SEND_PATH = "send";
const REQUEST_ID_HEADER_CANDIDATES = [
  "x-request-id",
  "x-mc-request-id",
  "mc-request-id",
  "cf-ray",
];

/**
 * Minimal subset of DKIM properties used for validation when normalising payloads.
 */
type DkimFields = {
  readonly dkim_domain?: string;
  readonly dkim_selector?: string;
  readonly dkim_private_key?: string;
};

/**
 * Checks whether the provided value is a non-empty string after trimming whitespace.
 *
 * @param value - Value to test.
 * @returns True when the value is a non-empty string.
 */
function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Converts response headers into a lower-cased record for stable lookups and serialization.
 */
function serializeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/**
 * Extracts a request identifier from well-known header names used by MailChannels and proxies.
 */
function extractRequestId(headers: Headers): string | undefined {
  for (const header of REQUEST_ID_HEADER_CANDIDATES) {
    const value = headers.get(header);
    if (hasText(value)) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Parses an HTTP `Retry-After` header into seconds when possible.
 */
function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const headerValue = headers.get("retry-after");
  if (!headerValue) {
    return undefined;
  }

  const numeric = Number.parseInt(headerValue, 10);
  if (Number.isFinite(numeric)) {
    return Math.max(numeric, 0);
  }

  const parsedDate = Date.parse(headerValue);
  if (Number.isFinite(parsedDate)) {
    const deltaMs = parsedDate - Date.now();
    if (deltaMs > 0) {
      return Math.ceil(deltaMs / 1000);
    }
    return 0;
  }

  return undefined;
}

/**
 * Derives a user-facing error message using JSON payload hints or textual fallbacks.
 */
function deriveErrorMessage(
  status: number,
  statusText: string | undefined,
  parsedBody: unknown,
  rawText: string
): string {
  const fallback = statusText
    ? `MailChannels request failed with ${status} ${statusText}`
    : `MailChannels request failed with status ${status}`;

  if (parsedBody && typeof parsedBody === "object") {
    const message = extractMessageFromBody(
      parsedBody as Record<string, unknown>
    );
    if (message) {
      return message;
    }
  }

  if (hasText(rawText)) {
    return rawText.trim();
  }

  return fallback;
}

/**
 * Extracts a meaningful message from common MailChannels error payload shapes.
 */
function extractMessageFromBody(
  body: Record<string, unknown>
): string | undefined {
  const candidateKeys = ["message", "error_description", "detail", "error"];
  for (const key of candidateKeys) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const nestedError = body.error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = extractMessageFromBody(
      nestedError as Record<string, unknown>
    );
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  const errorsField = body.errors;
  if (Array.isArray(errorsField)) {
    for (const entry of errorsField) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        const nested = extractMessageFromBody(entry as Record<string, unknown>);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return undefined;
}

/**
 * Performs structural validation to catch common mistakes before hitting the API.
 *
 * @param payload - Candidate payload to validate.
 * @throws {TypeError} When any required field is missing or malformed.
 */
function validateSendRequest(payload: SendEmailRequest): void {
  if (
    !Array.isArray(payload.personalizations) ||
    payload.personalizations.length === 0
  ) {
    throw new TypeError(
      "`personalizations` must contain at least one recipient block."
    );
  }

  for (const [index, personalization] of payload.personalizations.entries()) {
    validatePersonalization(personalization, index);
  }

  validateEmailAddress(payload.from, "from");

  if (payload.reply_to) {
    validateEmailAddress(payload.reply_to, "reply_to");
  }

  if (!Array.isArray(payload.content) || payload.content.length === 0) {
    throw new TypeError("`content` must include at least one content block.");
  }

  for (const [index, block] of payload.content.entries()) {
    validateContentBlock(block, index);
  }

  if (payload.attachments) {
    for (const [index, attachment] of payload.attachments.entries()) {
      validateAttachment(attachment, index);
    }
  }

  validateDkimFields(payload, "request body");

  payload.personalizations.forEach((personalization, personalizationIndex) => {
    validateDkimFields(
      personalization,
      `personalizations[${personalizationIndex}]`
    );
  });
}

/**
 * Ensures each personalization includes valid email addresses.
 *
 * @param personalization - The personalization object to validate.
 * @param index - Index within the personalizations array for error reporting.
 * @throws {TypeError} When required recipient fields are missing or malformed.
 */
function validatePersonalization(
  personalization: Personalization,
  index: number
): void {
  if (!Array.isArray(personalization.to) || personalization.to.length === 0) {
    throw new TypeError(
      `personalizations[${index}].to must contain at least one recipient.`
    );
  }

  personalization.to.forEach((recipient, recipientIndex) => {
    validateEmailAddress(
      recipient,
      `personalizations[${index}].to[${recipientIndex}]`
    );
  });

  personalization.cc?.forEach((recipient, recipientIndex) => {
    validateEmailAddress(
      recipient,
      `personalizations[${index}].cc[${recipientIndex}]`
    );
  });

  personalization.bcc?.forEach((recipient, recipientIndex) => {
    validateEmailAddress(
      recipient,
      `personalizations[${index}].bcc[${recipientIndex}]`
    );
  });
}

/**
 * Ensures an email address object contains a non-empty email field.
 *
 * @param address - Address to validate.
 * @param path - Descriptive path used in error messages.
 * @throws {TypeError} When the email field is absent or blank.
 */
function validateEmailAddress(address: EmailAddress, path: string): void {
  if (
    !address ||
    typeof address.email !== "string" ||
    address.email.trim().length === 0
  ) {
    throw new TypeError(`${path}.email must be a non-empty string.`);
  }
}

/**
 * Verifies each content block includes a MIME type and string value.
 *
 * @param block - Content block to validate.
 * @param index - Index within the content array for diagnostics.
 * @throws {TypeError} When required fields are missing or invalid.
 */
function validateContentBlock(block: ContentBlock, index: number): void {
  if (
    !block ||
    typeof block.type !== "string" ||
    block.type.trim().length === 0
  ) {
    throw new TypeError(`content[${index}].type must be a non-empty string.`);
  }

  if (typeof block.value !== "string") {
    throw new TypeError(`content[${index}].value must be a string.`);
  }
}

/**
 * Ensures an attachment declaration satisfies MailChannels requirements.
 *
 * @param attachment - Attachment metadata to validate.
 * @param index - Attachment position used in error messages.
 * @throws {TypeError} When MIME type, filename, or Base64 payload are missing.
 */
function validateAttachment(attachment: Attachment, index: number): void {
  if (!attachment.type || typeof attachment.type !== "string") {
    throw new TypeError(
      `attachments[${index}].type must be a non-empty string.`
    );
  }

  if (!attachment.filename || typeof attachment.filename !== "string") {
    throw new TypeError(
      `attachments[${index}].filename must be a non-empty string.`
    );
  }

  if (!attachment.content || typeof attachment.content !== "string") {
    throw new TypeError(
      `attachments[${index}].content must be a base64 string.`
    );
  }
}

/**
 * Confirms that DKIM properties are present and non-empty.
 *
 * @param fields - Object containing DKIM values to check.
 * @param path - Human-readable location for error reporting.
 * @throws {TypeError} When any DKIM field is missing or empty.
 */
function validateDkimFields(fields: DkimFields, path: string): void {
  if (!hasText(fields.dkim_domain)) {
    throw new TypeError(`${path}.dkim_domain must be a non-empty string.`);
  }

  if (!hasText(fields.dkim_selector)) {
    throw new TypeError(`${path}.dkim_selector must be a non-empty string.`);
  }

  if (!hasText(fields.dkim_private_key)) {
    throw new TypeError(`${path}.dkim_private_key must be a non-empty string.`);
  }
}

/**
 * Normalises the base URL to ensure exactly one trailing slash.
 *
 * @param baseUrl - Optional base URL provided by the consumer.
 * @returns The canonical base URL.
 */
function normalizeBaseUrl(baseUrl: string | undefined): string {
  const normalized = (baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/?$/, "/");
  return normalized;
}

/**
 * Provides a high-level, DKIM-aware interface to the MailChannels `/send` endpoint.
 *
 * The client applies DKIM defaults, validates payloads, and forwards requests using the
 * Fetch API available in Node.js 18+.
 *
 * @public
 */
export class MailChannelsClient {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  private readonly defaultHeaders: Record<string, string>;

  private readonly dkim: DkimConfig;

  /**
   * Creates a new MailChannels client instance.
   *
   * @param options - Configuration describing API credentials, DKIM defaults, and runtime hooks.
   * @throws {TypeError} When required options (API key, DKIM fields, fetch implementation) are missing.
   */
  constructor(options: MailChannelsClientOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError(
        "`options` is required when constructing MailChannelsClient."
      );
    }

    if (!options.apiKey || !options.apiKey.trim()) {
      throw new TypeError("`apiKey` must be a non-empty string.");
    }

    const dkim = options.dkim;
    if (!dkim || typeof dkim !== "object") {
      throw new TypeError(
        "`dkim` configuration is required when constructing MailChannelsClient."
      );
    }

    const { domain, selector, privateKey } = dkim;
    if (!hasText(domain)) {
      throw new TypeError("`dkim.domain` must be a non-empty string.");
    }

    if (!hasText(selector)) {
      throw new TypeError("`dkim.selector` must be a non-empty string.");
    }

    if (!hasText(privateKey)) {
      throw new TypeError(
        "`dkim.privateKey` must be a non-empty string containing the Base64-encoded key."
      );
    }

    const fetchImpl = options.fetchImplementation ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "No Fetch API implementation available. Provide one via options.fetchImplementation."
      );
    }

    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = fetchImpl;
    this.defaultHeaders = options.defaultHeaders
      ? { ...options.defaultHeaders }
      : {};
    this.dkim = {
      domain: domain.trim(),
      selector: selector.trim(),
      privateKey: privateKey.trim(),
    };
  }

  /**
   * Sends an email via the MailChannels `/send` endpoint.
   *
   * @param payload - Structured message body documented at
   *   https://docs.mailchannels.net/email-api/sending-email/email-structure.
   *   DKIM fields are automatically populated from the client defaults unless explicitly overridden.
   * @param options - Additional request options, including dry-run support.
   * @returns Parsed response metadata, including the HTTP status and any message identifier.
   * @throws {TypeError} When validation fails before issuing the HTTP request.
   * @throws {MailChannelsError} When the MailChannels API responds with a non-success status.
   *   The error contains HTTP diagnostics such as the status text, response headers, request
   *   identifier, retry hints, and either the parsed JSON body or raw response text.
   */
  public async sendEmail(
    payload: SendEmailRequest,
    options: SendEmailOptions = {}
  ): Promise<SendEmailResponse> {
    const normalizedPayload = this.applyDkimDefaults(payload);
    validateSendRequest(normalizedPayload);

    const requestUrl = new URL(SEND_PATH, this.baseUrl);
    if (options.dryRun) {
      requestUrl.searchParams.set("dry-run", "true");
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Key": this.apiKey,
      ...this.defaultHeaders,
    };

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await this.fetchImpl(requestUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(normalizedPayload),
      signal: options.signal,
    });

    const rawText = await response.text();
    const contentType = response.headers.get("content-type");
    let parsedBody: unknown;

    if (rawText.length > 0 && contentType?.includes("application/json")) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        // fall through to capturing raw text in the error below.
      }
    }

    if (!response.ok) {
      const statusText = hasText(response.statusText)
        ? response.statusText.trim()
        : undefined;
      const message = deriveErrorMessage(
        response.status,
        statusText,
        parsedBody,
        rawText
      );
      const details = parsedBody ?? (rawText.length > 0 ? rawText : undefined);

      throw new MailChannelsError(message, {
        status: response.status,
        statusText,
        requestId: extractRequestId(response.headers),
        retryAfterSeconds: parseRetryAfterSeconds(response.headers),
        headers: serializeHeaders(response.headers),
        details,
      });
    }

    let responseId: string | undefined;
    let responseData: unknown;

    if (parsedBody && typeof parsedBody === "object") {
      const bodyAsRecord = parsedBody as Record<string, unknown>;
      if (typeof bodyAsRecord.id === "string") {
        responseId = bodyAsRecord.id;
      }
      if (Object.keys(bodyAsRecord).length > (responseId ? 1 : 0)) {
        responseData = parsedBody;
      }
    } else if (rawText.length > 0) {
      responseData = rawText;
    }

    const responsePayload: SendEmailResponse = {
      status: response.status,
      ...(responseId ? { id: responseId } : {}),
      ...(responseData !== undefined ? { data: responseData } : {}),
    };

    return responsePayload;
  }

  /**
   * Applies client-level DKIM defaults while preserving explicit overrides.
   *
   * @param payload - Original payload provided by the caller.
   * @returns A new payload containing guaranteed DKIM fields.
   */
  private applyDkimDefaults(payload: SendEmailRequest): SendEmailRequest {
    const globalDomain = selectDkimValue(payload.dkim_domain, this.dkim.domain);
    const globalSelector = selectDkimValue(
      payload.dkim_selector,
      this.dkim.selector
    );
    const globalPrivateKey = selectDkimValue(
      payload.dkim_private_key,
      this.dkim.privateKey
    );

    const personalizations = payload.personalizations.map((personalization) => {
      const personalizationDomain = selectDkimValue(
        personalization.dkim_domain,
        globalDomain
      );
      const personalizationSelector = selectDkimValue(
        personalization.dkim_selector,
        globalSelector
      );
      const personalizationPrivateKey = selectDkimValue(
        personalization.dkim_private_key,
        globalPrivateKey
      );

      return {
        ...personalization,
        dkim_domain: personalizationDomain,
        dkim_selector: personalizationSelector,
        dkim_private_key: personalizationPrivateKey,
      };
    });

    return {
      ...payload,
      personalizations,
      dkim_domain: globalDomain,
      dkim_selector: globalSelector,
      dkim_private_key: globalPrivateKey,
    };
  }
}

/**
 * Returns the first non-empty DKIM value between a candidate and fallback.
 *
 * @param value - Candidate value supplied by the caller.
 * @param fallback - Default value used when the candidate is missing.
 * @returns Trimmed DKIM value guaranteed to be non-empty.
 */
function selectDkimValue(value: string | undefined, fallback: string): string {
  if (hasText(value)) {
    return value.trim();
  }
  return fallback;
}

export type {
  Attachment,
  ContentBlock,
  DkimConfig,
  EmailAddress,
  MailChannelsClientOptions,
  Personalization,
  SendEmailOptions,
  SendEmailRequest,
  SendEmailResponse,
};
