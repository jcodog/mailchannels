// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
  MailChannelsClient,
  MailChannelsError,
  type MailChannelsClientOptions,
  type SendEmailRequest,
} from "../src/index.js";

const baseOptions: MailChannelsClientOptions = {
  apiKey: "api-key",
  dkim: {
    domain: " example.com ",
    selector: " default-selector ",
    privateKey: " default-private-key ",
  },
};

function createClient(
  overrides: Partial<MailChannelsClientOptions> = {},
  fetchImpl?: typeof fetch
) {
  return new MailChannelsClient({
    ...baseOptions,
    ...overrides,
    ...(fetchImpl ? { fetchImplementation: fetchImpl } : {}),
  });
}

function createPayload(): SendEmailRequest {
  return {
    personalizations: [
      {
        to: [{ email: "primary@example.com", name: "Primary" }],
        cc: [{ email: "copy@example.com" }],
        bcc: [{ email: "hidden@example.com" }],
      },
      {
        to: [{ email: "override@example.com" }],
        dkim_domain: " override.example.com ",
        dkim_selector: " override-selector ",
        dkim_private_key: " override-private-key ",
      },
    ],
    from: { email: "sender@example.com", name: "Sender" },
    reply_to: { email: "reply@example.com" },
    subject: "Test message",
    content: [
      { type: "text/plain", value: "Plain content" },
      { type: "text/html", value: "<p>HTML content</p>" },
    ],
    attachments: [
      {
        type: "text/plain",
        filename: "note.txt",
        content: Buffer.from("file-content").toString("base64"),
      },
    ],
  };
}

describe("MailChannelsClient", () => {
  it("requires valid constructor options", () => {
    expect(
      () =>
        new MailChannelsClient(
          undefined as unknown as MailChannelsClientOptions
        )
    ).toThrow(TypeError);
    expect(
      () => new MailChannelsClient({} as MailChannelsClientOptions)
    ).toThrow(/apiKey/);
    expect(
      () =>
        new MailChannelsClient({
          apiKey: "value",
        } as MailChannelsClientOptions)
    ).toThrow(/dkim/);
    expect(
      () =>
        new MailChannelsClient({
          apiKey: "value",
          dkim: { domain: "", selector: "selector", privateKey: "key" },
        })
    ).toThrow(/dkim.domain/);
    expect(
      () =>
        new MailChannelsClient({
          apiKey: "value",
          dkim: { domain: "domain", selector: "", privateKey: "key" },
        })
    ).toThrow(/dkim.selector/);
    expect(
      () =>
        new MailChannelsClient({
          apiKey: "value",
          dkim: { domain: "domain", selector: "selector", privateKey: "" },
        })
    ).toThrow(/dkim.privateKey/);

    expect(
      () =>
        new MailChannelsClient({
          apiKey: "value",
          dkim: { domain: "domain", selector: "selector", privateKey: "key" },
          // @ts-expect-error testing runtime validation
          fetchImplementation: "not a function",
        })
    ).toThrow(/Fetch API implementation/);
  });

  it("sends email with merged DKIM defaults and headers", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ id: "message-id", ok: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        })
    );

    const client = createClient(
      {
        baseUrl: "https://api.mailchannels.net/tx/v1", // ensure trailing slash unaffected
        defaultHeaders: { "X-Custom": "value" },
      },
      fetchSpy
    );

    const payload = createPayload();
    payload.personalizations[1].dkim_domain = " override.example.com ";
    payload.personalizations[1].dkim_selector = " override-selector ";
    payload.personalizations[1].dkim_private_key = " override-private-key ";

    const result = await client.sendEmail(payload, {
      dryRun: true,
      idempotencyKey: "key-123",
    });

    expect(result).toEqual({
      status: 202,
      id: "message-id",
      data: { id: "message-id", ok: true },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [rawUrl, init] = fetchSpy.mock.calls[0];
    const url = new URL(rawUrl as string);
    expect(url.searchParams.get("dry-run")).toBe("true");
    expect(init?.headers).toMatchObject({
      "X-Api-Key": baseOptions.apiKey.trim(),
      "content-type": "application/json",
      "Idempotency-Key": "key-123",
      "X-Custom": "value",
    });

    const body = JSON.parse(init?.body as string);
    expect(body.dkim_domain).toBe("example.com");
    expect(body.dkim_selector).toBe("default-selector");
    expect(body.dkim_private_key).toBe("default-private-key");
    expect(body.personalizations[0].dkim_domain).toBe("example.com");
    expect(body.personalizations[0].dkim_selector).toBe("default-selector");
    expect(body.personalizations[1].dkim_domain).toBe("override.example.com");
    expect(body.personalizations[1].dkim_selector).toBe("override-selector");
    expect(body.personalizations[1].dkim_private_key).toBe(
      "override-private-key"
    );
  });

  it("normalises base URLs", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    const client = createClient(
      { baseUrl: "https://example.com/api" },
      fetchSpy
    );
    await client.sendEmail(createPayload());

    const [rawUrl] = fetchSpy.mock.calls[0];
    expect(rawUrl).toBe("https://example.com/api/send");
  });

  it("propagates API errors with details", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
    );
    const client = createClient({}, fetchSpy);

    await expect(client.sendEmail(createPayload())).rejects.toMatchObject({
      status: 500,
      message: "boom",
      details: { message: "boom" },
    });
  });

  it("propagates API errors with raw response text", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response("something went wrong", {
          status: 400,
          headers: { "content-type": "text/plain" },
        })
    );
    const client = createClient({}, fetchSpy);

    await expect(client.sendEmail(createPayload())).rejects.toMatchObject({
      status: 400,
      details: "something went wrong",
    });
  });

  it("returns raw response text when JSON parsing fails", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const client = createClient({}, fetchSpy);

    const result = await client.sendEmail(createPayload());
    expect(result).toEqual({ status: 200, data: "not json" });
  });

  it("throws when personalizations array is empty", async () => {
    const client = createClient();
    const payload = createPayload();
    // @ts-expect-error testing runtime validation
    payload.personalizations = [];

    await expect(client.sendEmail(payload)).rejects.toThrow(/personalizations/);
  });

  it("throws when recipient arrays are empty", async () => {
    const client = createClient();
    const payload = createPayload();
    payload.personalizations[0].to = [];

    await expect(client.sendEmail(payload)).rejects.toThrow(/to/);
  });

  it("throws when reply-to is invalid", async () => {
    const client = createClient();
    const payload = createPayload();
    payload.reply_to = { email: "" };

    await expect(client.sendEmail(payload)).rejects.toThrow(/reply_to.email/);
  });

  it("throws when content blocks are missing", async () => {
    const client = createClient();
    const payload = createPayload();
    payload.content = [];

    await expect(client.sendEmail(payload)).rejects.toThrow(/content/);
  });

  it("validates individual content blocks", async () => {
    const client = createClient({}, vi.fn<typeof fetch>());

    const missingType = createPayload();
    missingType.content = [
      {
        // @ts-expect-error testing runtime validation
        type: "",
        value: "value",
      },
    ];
    await expect(client.sendEmail(missingType)).rejects.toThrow(
      /content\[0\]\.type/
    );

    const nonStringValue = createPayload();
    nonStringValue.content = [
      {
        type: "text/plain",
        // @ts-expect-error testing runtime validation
        value: 123,
      },
    ];
    await expect(client.sendEmail(nonStringValue)).rejects.toThrow(
      /content\[0\]\.value/
    );
  });

  it("validates attachments", async () => {
    const client = createClient({}, vi.fn<typeof fetch>());

    const missingType = createPayload();
    missingType.attachments = [
      {
        // @ts-expect-error testing runtime validation
        type: "",
        filename: "file.txt",
        content: "YQ==",
      },
    ];
    await expect(client.sendEmail(missingType)).rejects.toThrow(
      /attachments\[0\]\.type/
    );

    const missingFilename = createPayload();
    missingFilename.attachments = [
      {
        type: "text/plain",
        // @ts-expect-error testing runtime validation
        filename: "",
        content: "YQ==",
      },
    ];
    await expect(client.sendEmail(missingFilename)).rejects.toThrow(
      /attachments\[0\]\.filename/
    );

    const missingContent = createPayload();
    missingContent.attachments = [
      {
        type: "text/plain",
        filename: "file.txt",
        // @ts-expect-error testing runtime validation
        content: "",
      },
    ];
    await expect(client.sendEmail(missingContent)).rejects.toThrow(
      /attachments\[0\]\.content/
    );
  });

  it("validates DKIM fields", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const client = createClient({}, fetchSpy);
    const payload = createPayload();

    (client as any).dkim.domain = "";
    await expect(client.sendEmail(payload)).rejects.toThrow(
      /request body\.dkim_domain/
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    (client as any).dkim.domain = baseOptions.dkim.domain.trim();
    (client as any).dkim.selector = "";
    await expect(client.sendEmail(payload)).rejects.toThrow(
      /request body\.dkim_selector/
    );

    (client as any).dkim.selector = baseOptions.dkim.selector.trim();
    (client as any).dkim.privateKey = "";
    await expect(client.sendEmail(payload)).rejects.toThrow(
      /request body\.dkim_private_key/
    );
    (client as any).dkim.privateKey = baseOptions.dkim.privateKey.trim();
  });

  it("uses provided fetch implementation when sending", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (input, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.personalizations[0].dkim_domain).toBe("example.com");
      return new Response("success", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });

    const client = createClient({}, fetchSpy);
    const result = await client.sendEmail(createPayload());
    expect(result).toEqual({ status: 200, data: "success" });
  });

  it("captures JSON responses without identifiers", async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ accepted: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        })
    );
    const client = createClient({}, fetchSpy);
    const result = await client.sendEmail(createPayload());
    expect(result).toEqual({ status: 202, data: { accepted: true } });
  });
});

describe("MailChannelsError", () => {
  it("exposes status and details", () => {
    const error = new MailChannelsError("message", 400, { help: true });
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ help: true });
  });
});
