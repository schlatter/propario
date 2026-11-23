/**
 * Where the app is served from. On an instance that is `/`; the website's demo is built with
 * `npm run build:demo` for `/propario/demo/` and only ever runs the demo – no server, no sign-in.
 */
export const BASE = import.meta.env.BASE_URL

/** A file from public/, under the app's base: asset('favicon.svg'). */
export const asset = (path: string) => BASE + path.replace(/^\//, '')

/** Built for the website (VITE_DEMO_ONLY=1): the demo is all there is. */
export const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === '1'
