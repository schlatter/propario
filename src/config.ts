/** Defaults for a fresh installation. Everything here can be changed in the app's settings. */

/** Where Propario's source and documentation live – linked in Settings and on the start page.
 * A modified version run for others points this at its own source (AGPL-3.0, section 13). */
export const SOURCE_URL = 'https://github.com/schlatter/propario'
export const GUIDE_URL = `${SOURCE_URL}/blob/main/docs/user-guide.md`

/** People who rate products or find them ("found by"). Empty: the signed-in person's name is offered. */
export const DEFAULT_PEOPLE: string[] = []
