declare module 'mailparser' {
  export interface ParsedMail {
    messageId?: string;
    from?: {
      text?: string;
      value?: Array<{ address?: string; name?: string }>;
    };
    to?: {
      text?: string;
      value?: Array<{ address?: string; name?: string }>;
    };
    subject?: string;
    html?: string;
    text?: string;
    textAsHtml?: string;
    attachments?: Array<{
      filename?: string;
      contentType?: string;
      content?: Buffer | string | any;
      size?: number;
    }>;
  }

  export function simpleParser(source: Buffer | string | any): Promise<ParsedMail>;
}
