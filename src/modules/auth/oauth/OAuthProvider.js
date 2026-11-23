/**
 * OAuth2-ready provider contract.
 * Concrete providers (Google, GitHub, …) plug in during a later phase
 * without changing auth session issuance.
 */
export class OAuthProvider {
  /** @returns {string} */
  getAuthorizationUrl(_state) {
    throw new Error('OAuth provider not configured');
  }

  /**
   * @param {string} _code
   * @returns {Promise<{ email: string, emailVerified: boolean, providerUserId: string, displayName?: string }>}
   */
  async exchangeCode(_code) {
    throw new Error('OAuth provider not configured');
  }
}

export default OAuthProvider;
