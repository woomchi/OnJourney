export const MIN_PASSWORD_LENGTH = 8;

export function getSafeRedirectPath(next: string | null): string {
  if (!next) return '/';

  const trimmed = next.trim();

  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('://') ||
    trimmed.includes('\\')
  ) {
    return '/';
  }

  return trimmed;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return '비밀번호에 영문자를 포함해주세요.';
  }
  if (!/[0-9]/.test(password)) {
    return '비밀번호에 숫자를 포함해주세요.';
  }
  return null;
}

interface AuthErrorLike {
  message: string;
  status?: number;
}

export function getAuthErrorMessage(
  mode: 'login' | 'signup' | 'reset_request' | 'reset_password',
  error: AuthErrorLike,
): string {
  const msg = error.message.toLowerCase();

  if (
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('over_request') ||
    error.status === 429
  ) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }

  if (mode === 'login') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (mode === 'reset_request') {
    return '비밀번호 재설정 이메일 발송에 실패했습니다. 다시 시도해주세요.';
  }

  if (mode === 'reset_password') {
    if (msg.includes('same password') || msg.includes('should be different')) {
      return '새 비밀번호는 기존 비밀번호와 달라야 합니다.';
    }
    if (msg.includes('password')) {
      return '비밀번호 형식을 확인해주세요.';
    }
    return '비밀번호 변경에 실패했습니다. 다시 시도해주세요.';
  }

  if (msg.includes('password')) {
    return '비밀번호 형식을 확인해주세요.';
  }

  return '회원가입에 실패했습니다. 입력 정보를 확인해주세요.';
}

export const AUTH_RATE_LIMIT = {
  maxAttempts: 5,
  lockoutMs: 30_000,
} as const;

export function getRateLimitMessage(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `로그인 시도가 너무 많습니다. ${seconds}초 후 다시 시도해주세요.`;
}
