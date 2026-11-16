import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { tx, type DB } from './db.ts'
import { safeEqual } from './crypto.ts'
import { newId } from '../src/shared/ids.ts'
import {
  consumeInvite,
  countUsers,
  createUser,
  getPasskey,
  insertPasskey,
  inviteValid,
  listPasskeys,
  saveChallenge,
  takeChallenge,
  touchPasskey,
  type User,
} from './users.ts'

/**
 * Passkey-only sign-in. Every ceremony requires user verification (biometrics or device PIN),
 * so a passkey is possession plus a second factor in one step.
 */

/** The relying party: passkeys are bound to this origin and nothing else. */
export interface RelyingParty {
  id: string
  origin: string
  name: string
}

export const relyingParty = (origin: string): RelyingParty => ({ id: new URL(origin).hostname, origin, name: 'Propario' })

/** How a visitor proves they may create an account: the setup link (first account) or an invitation. */
export interface Grant {
  setup?: string
  invite?: string
}

/**
 * - No account yet: only the holder of the one-time setup link (printed to the server log)
 *   may register, and becomes the administrator.
 * - Otherwise: only with an unused, unexpired invitation.
 */
export function registrationGrant(db: DB, setupToken: string | null, grant: Grant): { allowed: boolean; isAdmin: boolean } {
  if (countUsers(db) === 0) {
    const allowed = !!setupToken && typeof grant.setup === 'string' && safeEqual(grant.setup, setupToken)
    return { allowed, isAdmin: allowed }
  }
  return { allowed: typeof grant.invite === 'string' && inviteValid(db, grant.invite), isAdmin: false }
}

const SELECTION = { residentKey: 'required', userVerification: 'required' } as const

export async function beginRegistration(
  db: DB,
  rp: RelyingParty,
  setupToken: string | null,
  input: { name: string; grant: Grant },
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string } | null> {
  if (!registrationGrant(db, setupToken, input.grant).allowed) return null
  const userId = newId()
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: input.name,
    userDisplayName: input.name,
    userID: new TextEncoder().encode(userId),
    attestationType: 'none',
    authenticatorSelection: SELECTION,
  })
  const challengeId = saveChallenge(db, 'register', options.challenge, { userId, name: input.name, grant: input.grant })
  return { options, challengeId }
}

export async function finishRegistration(
  db: DB,
  rp: RelyingParty,
  setupToken: string | null,
  challengeId: unknown,
  response: RegistrationResponseJSON,
): Promise<{ userId: string; recoveryKey: string; isAdmin: boolean } | null> {
  const pending = takeChallenge(db, challengeId, 'register')
  if (!pending) return null
  const { userId, name, grant } = pending.payload as { userId: string; name: string; grant: Grant }
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: true,
  }).catch(() => null)
  if (!verification?.verified) return null
  const { credential } = verification.registrationInfo
  // The grant is checked again inside the transaction: two people racing for the setup link
  // must not both become administrator, and an invitation works once.
  return tx(db, () => {
    const { allowed, isAdmin } = registrationGrant(db, setupToken, grant)
    if (!allowed) return null
    if (!isAdmin && !consumeInvite(db, grant.invite!)) return null
    if (getPasskey(db, credential.id)) return null
    const { recoveryKey } = createUser(db, { id: userId, name, isAdmin })
    insertPasskey(db, { id: credential.id, userId, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports ?? [] })
    return { userId, recoveryKey, isAdmin }
  })
}

/** No user name is asked for: the browser offers the passkeys it holds for this site. */
export async function beginLogin(db: DB, rp: RelyingParty): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'required' })
  return { options, challengeId: saveChallenge(db, 'login', options.challenge, {}) }
}

export async function finishLogin(db: DB, rp: RelyingParty, challengeId: unknown, response: AuthenticationResponseJSON): Promise<string | null> {
  const pending = takeChallenge(db, challengeId, 'login')
  if (!pending || typeof response?.id !== 'string') return null
  const passkey = getPasskey(db, response.id)
  if (!passkey) return null
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: passkey.publicKey as Uint8Array<ArrayBuffer>,
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransport[],
    },
  }).catch(() => null)
  if (!verification?.verified) return null
  touchPasskey(db, passkey.id, verification.authenticationInfo.newCounter)
  return passkey.userId
}

/** Another passkey for a signed-in account (a second device, or after using the recovery key). */
export async function beginAddPasskey(db: DB, rp: RelyingParty, user: User): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.name,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: listPasskeys(db, user.id).map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransport[] })),
    authenticatorSelection: SELECTION,
  })
  return { options, challengeId: saveChallenge(db, 'add', options.challenge, { userId: user.id }) }
}

export async function finishAddPasskey(db: DB, rp: RelyingParty, user: User, challengeId: unknown, response: RegistrationResponseJSON): Promise<boolean> {
  const pending = takeChallenge(db, challengeId, 'add')
  if (!pending || (pending.payload as { userId: string }).userId !== user.id) return false
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: true,
  }).catch(() => null)
  if (!verification?.verified) return false
  const { credential } = verification.registrationInfo
  if (getPasskey(db, credential.id)) return false
  insertPasskey(db, {
    id: credential.id,
    userId: user.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
  })
  return true
}
