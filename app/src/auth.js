import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

const issuer = import.meta.env.VITE_DEX_ISSUER
const clientId = import.meta.env.VITE_DEX_CLIENT_ID
const redirectUri = import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/callback`

export const userManager = new UserManager({
  authority: issuer,
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
  // dex settings
  loadUserInfo: true,
  metadata: {
    issuer: issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/keys`,
    end_session_endpoint: `${issuer}/logout`,
  }
})

// Start login flow
export async function login() {
  try {
    await userManager.signinRedirect()
  } catch (error) {
    console.error('Login failed:', error)
    throw error
  }
}

// Handle callback after redirect
export async function handleCallback() {
  try {
    const user = await userManager.signinRedirectCallback()
    return user
  } catch (error) {
    console.error('Callback handling failed:', error)
    throw error
  }
}

// Get current user
export async function getUser() {
  try {
    const user = await userManager.getUser()
    return user
  } catch (error) {
    console.error('Get user failed:', error)
    return null
  }
}

// Logout
export async function logout() {
  try {
    await userManager.signoutRedirect()
  } catch (error) {
    console.error('Logout failed:', error)
    throw error
  }
}

// Get ID token for API calls
export async function getIdToken() {
  try {
    const user = await userManager.getUser()
    return user?.id_token || null
  } catch (error) {
    console.error('Get ID token failed:', error)
    return null
  }
}

// Get canonical user ID (iss#sub format as per design doc)
export function getCanonicalUserId(user) {
  if (!user) return null
  return `${user.profile.iss}#${user.profile.sub}`
}
