declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  }
}

declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
