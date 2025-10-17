# mailchannels

[![CI](https://github.com/jcodog/mailchannels/actions/workflows/ci.yml/badge.svg)](https://github.com/jcodog/mailchannels/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jcodog/mailchannels/gh-pages/badge.json)](https://jcodog.github.io/mailchannels/)

TypeScript-first wrapper around the [MailChannels Email API](https://docs.mailchannels.net/email-api) with strong typings, runtime validation, and ergonomic helpers. The client relies on Node.js 18+ `fetch`, so there are no production dependencies.

> ℹ️ Before sending email you must provision an SMTP password, generate an API key with the `api` scope, and configure Domain Lockdown records as documented by MailChannels.<sup>[1](#footnote-auth)</sup>

## Installation

```bash
# pnpm
pnpm add mailchannels

# npm
npm install mailchannels

# Yarn
yarn add mailchannels

# Bun
bun add mailchannels
```

## Quick start

```ts
import { MailChannelsClient } from "mailchannels";

const client = new MailChannelsClient({
  apiKey: process.env.MAILCHANNELS_API_KEY ?? "",
});

await client.sendEmail({
  personalizations: [
    {
      to: [{ email: "recipient@example.net", name: "Sakura Tanaka" }],
    },
  ],
  from: { email: "sender@example.com", name: "Priya Patel" },
  subject: "Testing Email API",
  content: [
    { type: "text/plain", value: "Hi Sakura. This is just a test from Priya." },
    {
      type: "text/html",
      value: "<p>Hi Sakura.<br>This is just a test from Priya.</p>",
    },
  ],
});
```

Under the hood the client issues a `POST` request to `https://api.mailchannels.net/tx/v1/send` with your API key in the `X-Api-Key` header, exactly as described in the MailChannels sending guide.<sup>[2](#footnote-send)</sup>

## Features

- Strong TypeScript definitions mirroring the MailChannels `/send` payload.<sup>[3](#footnote-structure)</sup>
- Runtime validation of required fields before any network call.
- Optional dry-run support (`?dry-run=true`) for server-side validation without delivery.<sup>[4](#footnote-dryrun)</sup>
- Rich attachment helpers with guardrails around type and base64 requirements.<sup>[5](#footnote-attachments)</sup>
- Uses the built-in Fetch API from Node.js 18+, but allows custom implementations for testing.

## Sending with options

````ts
import { MailChannelsClient } from "mailchannels";
import type { SendEmailRequest } from "mailchannels";

# mailchannels

[![CI](https://github.com/jcodog/mailchannels/actions/workflows/ci.yml/badge.svg)](https://github.com/jcodog/mailchannels/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jcodog/mailchannels/gh-pages/badge.json)](https://jcodog.github.io/mailchannels/)

TypeScript-first wrapper around the [MailChannels Email API](https://docs.mailchannels.net/email-api) with runtime validation, DKIM enforcement, and ergonomic helpers. The client targets Node.js 18+ and reuses the built-in Fetch API, so there are no production dependencies.

## MailChannels setup guide

1. **Create an account.** Sign up for MailChannels, verify your email address, and add valid billing details as prompted.<sup>[1](#footnote-account)</sup>
2. **Complete the authentication prerequisites.** From the console create an SMTP password, generate an API key with the `api` scope, and publish Domain Lockdown (`_mailchannels`) TXT records for every sending domain.<sup>[2](#footnote-auth)</sup>
3. **Provision DKIM.** MailChannels requires DKIM signatures for modern deliverability. You can:
   - Manage your own keys by generating a private key, deriving the public key, and publishing it at `selector._domainkey.yourdomain`. Sample OpenSSL commands:<sup>[3](#footnote-dkim)</sup>

     ```bash
     openssl genrsa 2048 | tee priv_key.pem \
       | openssl rsa -outform der \
       | openssl base64 -A > priv_key.txt

     echo -n "v=DKIM1;p=" > pub_key_record.txt
     openssl rsa -in priv_key.pem -pubout -outform der \
       | openssl base64 -A >> pub_key_record.txt
     ```

     Publish the contents of `pub_key_record.txt` as a TXT record at `<selector>._domainkey.<yourdomain>`.
   - Or use the MailChannels DKIM APIs (`POST /tx/v1/domains/{domain}/dkim-keys`, etc.) to generate and activate key pairs directly from code, then publish the returned DNS record.<sup>[3](#footnote-dkim)</sup>

4. **Record your defaults.** Capture the following details for the domain you will sign with:
   - `dkim_domain` – typically the same domain as your `From` address for DMARC alignment.
   - `dkim_selector` – the label you used in DNS (for example `mcdkim`).
   - `dkim_private_key` – the Base64-encoded private key (contents of `priv_key.txt` if you used the OpenSSL recipe above).

Once the DNS changes propagate you are ready to send signed traffic through the `/send` endpoint.<sup>[4](#footnote-send)</sup>

## Installation

```bash
# pnpm
pnpm add mailchannels

# npm
npm install mailchannels

# Yarn
yarn add mailchannels

# Bun
bun add mailchannels
````

## Quick start

```ts
import { MailChannelsClient } from "mailchannels";

const client = new MailChannelsClient({
  apiKey: process.env.MAILCHANNELS_API_KEY ?? "",
  dkim: {
    domain: "example.com",
    selector: "mcdkim",
    privateKey: process.env.MAILCHANNELS_DKIM_PRIVATE_KEY ?? "",
  },
});

await client.sendEmail({
  personalizations: [
    {
      to: [{ email: "recipient@example.net", name: "Sakura Tanaka" }],
    },
  ],
  from: { email: "sender@example.com", name: "Priya Patel" },
  subject: "Testing Email API",
  content: [
    { type: "text/plain", value: "Hi Sakura. This is just a test from Priya." },
    {
      type: "text/html",
      value: "<p>Hi Sakura.<br>This is just a test from Priya.</p>",
    },
  ],
});
```

The client injects the DKIM defaults into both the request body and every personalization, ensuring compliance with MailChannels' DKIM requirements even when you do not set them manually.

## Features

- Required DKIM configuration enforced at construction time to keep every request compliant.<sup>[3](#footnote-dkim)</sup>
- Strong TypeScript definitions that mirror the MailChannels `/send` payload.<sup>[5](#footnote-structure)</sup>
- Runtime validation of key fields (personalizations, content, DKIM) before the network hop.
- Optional dry-run support (`?dry-run=true`) so you can validate payloads without delivering mail.<sup>[6](#footnote-dryrun)</sup>
- Attachment helper validation around MIME type, filename, and Base64 encoding.<sup>[7](#footnote-attachments)</sup>
- Built-in Fetch integration with an escape hatch for custom implementations (tests, polyfills).

## Per-recipient overrides

You can still customise DKIM (and other headers) per recipient. Values defined inside a personalization override the client defaults for that specific message.

```ts
import { MailChannelsClient } from "mailchannels";
import type { SendEmailRequest } from "mailchannels";

const client = new MailChannelsClient({
  apiKey: "YOUR-API-KEY",
  dkim: {
    domain: "example.com",
    selector: "mcdkim",
    privateKey: "BASE64_PRIVATE_KEY",
  },
});

const message: SendEmailRequest = {
  personalizations: [
    {
      to: [{ email: "banana-lover123@example.com" }],
      subject: "BANANAS ARE ON SALE",
      dynamic_template_data: { discountCode: "BANANA-BOAT" },
    },
    {
      to: [{ email: "vip@example.com" }],
      subject: "Exclusive VIP Pricing",
      dkim_selector: "vipselector",
      dkim_private_key: "BASE64_VIP_KEY",
    },
  ],
  from: { email: "news@example.com", name: "Example News" },
  template_id: "spring-sale",
  content: [
    {
      type: "text/plain",
      value: "Plain-text fallback for clients that do not render HTML.",
    },
    {
      type: "text/html",
      value:
        "<html><body><p>Check the sale in your personalized template.</p></body></html>",
    },
  ],
  metadata: { campaign: "spring-2025" },
};

await client.sendEmail(message, { dryRun: true });
```

## Attachments

Attachments must be Base64 encoded and accompanied by a MIME type plus filename. The client checks these fields before sending.

```ts
import { MailChannelsClient } from "mailchannels";
import { promises as fs } from "node:fs";

const client = new MailChannelsClient({
  apiKey: "YOUR-API-KEY",
  dkim: {
    domain: "example.com",
    selector: "mcdkim",
    privateKey: "BASE64_PRIVATE_KEY",
  },
});

const logoPngBase64 = Buffer.from(
  await fs.readFile("./assets/logo.png")
).toString("base64");

await client.sendEmail({
  personalizations: [{ to: [{ email: "recipient@example.com" }] }],
  from: { email: "sender@example.com" },
  subject: "Email with Attachment",
  content: [{ type: "text/plain", value: "Please see the attached image." }],
  attachments: [
    {
      type: "image/png",
      filename: "logo.png",
      content: logoPngBase64,
    },
  ],
});
```

## Testing

```bash
npm install
npm run typecheck
npm run build
```

`npm run build` emits ESM output plus `.d.ts` bundles into `dist/` ready for publishing.

## API surface

### `new MailChannelsClient(options)`

- `apiKey` – MailChannels API credential with the `api` scope.<sup>[2](#footnote-auth)</sup>
- `dkim` – required defaults `{ domain, selector, privateKey }`; applied automatically to every request and personalization.<sup>[3](#footnote-dkim)</sup>
- `baseUrl` – override the API endpoint (defaults to `https://api.mailchannels.net/tx/v1/`).
- `fetchImplementation` – provide an alternative Fetch-compatible function if needed.
- `defaultHeaders` – headers merged into every outbound request.

### `sendEmail(payload, options?)`

- Accepts a strongly typed payload matching the MailChannels `/send` schema.<sup>[5](#footnote-structure)</sup>
- Ensures DKIM, recipients, and content blocks are valid before calling the API.
- `options.dryRun` toggles the `dry-run` query to request synchronous validation.<sup>[6](#footnote-dryrun)</sup>
- `options.signal` lets you cancel in-flight requests with an `AbortSignal`.
- `options.idempotencyKey` sets the `Idempotency-Key` header for safe retries.

### Errors

Non-success responses raise `MailChannelsError`, exposing the HTTP status and any parsed response body to streamline troubleshooting.

## Footnotes

1. <span id="footnote-account"></span>[MailChannels account creation](https://docs.mailchannels.net/email-api/getting-started/account-creation)
2. <span id="footnote-auth"></span>[Authentication prerequisites and Domain Lockdown](https://docs.mailchannels.net/email-api/getting-started/authentication)
3. <span id="footnote-dkim"></span>[DKIM setup and field requirements](https://docs.mailchannels.net/email-api/dkim/)
4. <span id="footnote-send"></span>[Sending emails with the `/send` endpoint](https://docs.mailchannels.net/email-api/sending-email/email-intro)
5. <span id="footnote-structure"></span>[Understanding the `/send` payload structure](https://docs.mailchannels.net/email-api/sending-email/email-structure)
6. <span id="footnote-dryrun"></span>[Dry-run behaviour in the API reference](https://docs.mailchannels.net/email-api/api-reference/send-an-email)
7. <span id="footnote-attachments"></span>[Attachment requirements and limitations](https://docs.mailchannels.net/email-api/sending-email/attachments)
