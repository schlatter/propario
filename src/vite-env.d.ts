/// <reference types="vite/client" />
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** '1' when built as the website's demo (npm run build:demo, src/site.ts). */
  readonly VITE_DEMO_ONLY?: string
}
