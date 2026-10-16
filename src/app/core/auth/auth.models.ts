/** Request body for `POST /api/v1/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Identity object as returned by the backend (login response and JWT claims). */
export interface BackendUser {
  email: string;
  /** Real name of the user (spec 122, FR-010). Optional: a JWT minted before
   *  this field existed won't carry it. */
  name?: string;
  uid: string;
  tenant_id: number | null;
  is_super_admin: boolean;
  /** Role in UPPERCASE: `ADMIN` | `CASHIER`. */
  role: string;
  /** When `true`, the user logged in with a temporary password and must change it. */
  must_change_password?: boolean;
}

/** Request body for `POST /api/v1/auth/change-password`. */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

/** Request body for `POST /api/v1/auth/forgot-password`. */
export interface ForgotPasswordRequest {
  email: string;
}

/** Request body for `POST /api/v1/auth/reset-password`. */
export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

/** Response body of `GET /api/v1/auth/reset-password/validate`. */
export interface ValidateResetTokenResponse {
  valid: boolean;
  reason?: 'expired' | 'used' | 'invalid';
}

/** Response body of `POST /api/v1/auth/login`. */
export interface LoginResponse {
  message: string;
  access_token: string;
  refresh_token: string;
  user: BackendUser;
}

/**
 * Response of `GET /api/v1/auth/refresh-token`. The body is not documented in
 * the OpenAPI spec, so this is defensive: at minimum an `access_token`, and a
 * possibly-rotated `refresh_token`.
 */
export interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  message?: string;
}

/** Decoded JWT payload. Access token has `refresh: false`; refresh token `true`. */
export interface JwtClaims {
  user: BackendUser;
  /** Expiration as a UNIX timestamp (seconds). */
  exp: number;
  jti: string;
  refresh: boolean;
}

/** FastAPI error envelope (`{ "detail": "..." }`). */
export interface ApiErrorBody {
  detail?: string;
  message?: string;
}
