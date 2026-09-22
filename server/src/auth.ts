import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import type { AppConfig, AuthConfig } from './config.js';

export interface AuthPrincipal {
  provider: 'google';
  providerSubject: string;
  email: string;
}

export interface AuthService {
  handler(request: Request): Promise<Response>;
  getPrincipal(headers: Headers): Promise<AuthPrincipal | null>;
  close(): Promise<void>;
}

export function createAuthService(config: AppConfig, authConfig: AuthConfig): AuthService {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
  });
  const auth = betterAuth({
    appName: 'Číslokraj',
    baseURL: authConfig.authBaseUrl,
    secret: authConfig.authSecret,
    database: pool,
    trustedOrigins: [...config.corsOrigins],
    socialProviders: {
      google: {
        clientId: authConfig.googleClientId,
        clientSecret: authConfig.googleClientSecret,
      },
    },
    user: {
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      encryptOAuthTokens: true,
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    advanced: {
      database: {
        joins: true,
      },
    },
  });

  return {
    handler: request => auth.handler(request),
    getPrincipal: async headers => {
      const session = await auth.api.getSession({ headers });
      if (!session) return null;

      const accounts = await auth.api.listUserAccounts({ headers });
      const googleAccount = accounts.find(account => account.providerId === 'google');
      if (!googleAccount) return null;

      return {
        provider: 'google',
        providerSubject: googleAccount.accountId,
        email: session.user.email,
      };
    },
    close: () => pool.end(),
  };
}
