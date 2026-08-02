"use client";

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/lib/auth/security';
import { useAuth } from '@/providers/AuthProvider';

export default function ResetPasswordPage() {
  const { updatePassword, loading, user } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500 font-medium">로딩 중...</div>
      </div>
    );
  }

  if (!user && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-zinc-100 text-center">
          <h1 className="text-2xl font-bold text-zinc-900 mb-3">유효하지 않은 접근</h1>
          <p className="text-zinc-600 text-sm mb-6">
            비밀번호 재설정 링크가 만료되었거나 올바르지 않은 접근입니다. 이메일 링크를 다시 확인해주세요.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-zinc-100">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">새 비밀번호 설정</h1>
        <p className="text-zinc-500 text-sm mb-6">
          안전한 계정을 위해 새로운 비밀번호를 입력해주세요.
        </p>

        {success ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">비밀번호가 변경되었습니다!</h2>
            <p className="text-sm text-zinc-500 mb-6">
              잠시 후 메인 페이지로 자동 이동합니다.
            </p>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              지금 바로 홈으로 이동
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block mb-4">
              <span className="text-sm font-bold text-zinc-700 mb-2 block">새 비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${MIN_PASSWORD_LENGTH}자 이상, 영문+숫자 포함`}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900"
                autoFocus
              />
            </label>

            <label className="block mb-2">
              <span className="text-sm font-bold text-zinc-700 mb-2 block">새 비밀번호 확인</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900"
              />
            </label>
            <p className="text-xs text-zinc-400 mb-6">
              {MIN_PASSWORD_LENGTH}자 이상, 영문자와 숫자를 포함해주세요.
            </p>

            {error && (
              <p className="text-sm text-red-500 mb-4" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? '비밀번호 변경 중...' : '비밀번호 변경하기'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
