declare module 'smtp-server' {
  import { Readable } from 'stream';

  export interface SMTPServerOptions {
    name?: string;
    authMethods?: string[];
    disabledCommands?: string[];
    onConnect?: (session: any, callback: (err?: Error) => void) => void;
    onMailFrom?: (address: any, session: any, callback: (err?: Error) => void) => void;
    onRcptTo?: (address: any, session: any, callback: (err?: Error) => void) => void;
    onData?: (stream: Readable, session: any, callback: (err?: Error) => void) => void;
    logger?: boolean;
  }

  export class SMTPServer {
    constructor(options: SMTPServerOptions);
    listen(port: number, host?: string, callback?: (err?: Error) => void): void;
    close(callback?: () => void): void;
  }
}
