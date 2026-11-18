/**
 * Scales outside ratings use, with their allowed range (inclusive). Shared by the server's
 * validation and the browser's conversion, so it lives in src/shared (copied into the container).
 */
import type { ReviewScale } from '../db/types'

export const SCALE_RANGE: Record<ReviewScale, [number, number]> = { stars5: [0, 5], grade: [0.5, 5.5], percent: [0, 100] }
