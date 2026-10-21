// Error copy for the sign-in and sign-up forms. Each message names the problem
// and the way out. Codes are Better Auth's; anything unknown gets the generic line.

export type AuthMode = "sign-in" | "sign-up";

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

export const PASSWORD_MIN_LENGTH = 8;

export function authErrorMessage(error: AuthErrorLike, mode: AuthMode): string {
  const code = error?.code ?? "";
  if (error?.status === 429 || code === "TOO_MANY_REQUESTS") {
    return "Too many attempts. Wait a minute, then try again.";
  }
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "That email and password do not match. Check both, or create an account.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return `The password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "PASSWORD_TOO_LONG":
      return "The password is too long. Use 128 characters or fewer.";
    case "INVALID_EMAIL":
      return "That email address is not valid. Enter it as name@agency.com.";
    case "EMAIL_NOT_VERIFIED":
      return "Your email is not confirmed yet. Open the link we sent you, then sign in.";
    default:
      return mode === "sign-in"
        ? "Could not sign you in. Check your connection and try again."
        : "Could not create your account. Check your connection and try again.";
  }
}

/** Checks we can make before the round trip. Null when the form is fine. */
export function validateAuthForm(
  fields: { name?: string; email: string; password: string },
  mode: AuthMode,
): string | null {
  if (mode === "sign-up" && !fields.name?.trim()) {
    return "Add your name. Clients see it on shared itineraries.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    return "That email address is not valid. Enter it as name@agency.com.";
  }
  if (!fields.password) return "Enter your password.";
  if (mode === "sign-up" && fields.password.length < PASSWORD_MIN_LENGTH) {
    return `The password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}
