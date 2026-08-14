declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean; readwrite?: boolean });
    query(sql: string): any;
    run(sql: string, ...params: unknown[]): any;
    close(): void;
  }
}

interface ImportMeta {
  readonly dir: string;
}
