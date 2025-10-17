/** Entry point exporting the MailChannels API client and related types. */
export { MailChannelsClient } from "./client.js";
export { MailChannelsError } from "./errors.js";
export type { MailChannelsErrorOptions } from "./errors.js";
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
} from "./types.js";
