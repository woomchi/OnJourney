import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/auth/naver/callback/route';

// mock supabase modules
const mockCreateUser = vi.fn();
const mockGenerateLink = vi.fn();
const mockUpdateUserById = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        generateLink: mockGenerateLink,
        updateUserById: mockUpdateUserById,
      },
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

describe('Naver OAuth Callback Route (GET /api/auth/naver/callback)', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID: 'test-client-id',
      NEXT_NAVER_LOGIN_SECRET_ID: 'test-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('인증 코드(code)가 없으면 에러 응답을 반환한다', async () => {
    const req = new Request('http://localhost:3000/api/auth/naver/callback?format=json');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('naver_code_missing');
  });

  it('네이버 클라이언트 설정이 없으면 에러 응답을 반환한다', async () => {
    delete process.env.NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID;

    const req = new Request('http://localhost:3000/api/auth/naver/callback?code=test-code&format=json');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('naver_config_missing');
  });

  it('신규 사용자: createUser 성공 후 magiclink로 verifyOtp 세션을 수립한다 (O(1) 플로우)', async () => {
    // Mock Naver Token & Profile API
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'fake-naver-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultcode: '00',
          response: {
            id: 'naver_12345',
            email: 'newuser@naver.com',
            nickname: '새여행자',
            profile_image: 'https://example.com/avatar.png',
          },
        }),
      } as Response);

    // Mock Supabase
    mockCreateUser.mockResolvedValueOnce({
      data: {
        user: { id: 'user-uuid-1', email: 'newuser@naver.com' },
      },
      error: null,
    });

    mockGenerateLink.mockResolvedValueOnce({
      data: {
        user: { id: 'user-uuid-1', email: 'newuser@naver.com' },
        properties: { hashed_token: 'hashed-token-123' },
      },
      error: null,
    });

    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const req = new Request('http://localhost:3000/api/auth/naver/callback?code=valid-code&format=json');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // createUser가 호출되었는지 확인
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'newuser@naver.com',
      email_confirm: true,
      user_metadata: {
        nickname: '새여행자',
        avatar_url: 'https://example.com/avatar.png',
        provider: 'naver',
        naver_id: 'naver_12345',
      },
    });

    // 신규 생성이 성공했으므로 updateUserById는 호출되지 않음
    expect(mockUpdateUserById).not.toHaveBeenCalled();

    // verifyOtp가 호출되었는지 확인
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'hashed-token-123',
      type: 'email',
    });
  });

  it('기존 사용자: createUser 실패 시 generateLink로 기존 유저 확인 후 updateUserById 메타데이터 갱신 및 세션 수립', async () => {
    // Mock Naver Token & Profile API
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'fake-naver-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultcode: '00',
          response: {
            id: 'naver_12345',
            email: 'existing@naver.com',
            nickname: '수정된닉네임',
            profile_image: 'https://example.com/new_avatar.png',
          },
        }),
      } as Response);

    // createUser 실패 (이미 등록된 계정)
    mockCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    // generateLink로 기존 유저 획득
    mockGenerateLink.mockResolvedValueOnce({
      data: {
        user: {
          id: 'existing-user-uuid',
          email: 'existing@naver.com',
          user_metadata: { provider: 'naver' },
        },
        properties: { hashed_token: 'existing-token-456' },
      },
      error: null,
    });

    mockUpdateUserById.mockResolvedValueOnce({ error: null });
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const req = new Request('http://localhost:3000/api/auth/naver/callback?code=valid-code&format=json');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // 기존 유저이므로 updateUserById가 호출되어 메타데이터가 갱신되어야 함
    expect(mockUpdateUserById).toHaveBeenCalledWith('existing-user-uuid', {
      user_metadata: {
        provider: 'naver',
        nickname: '수정된닉네임',
        avatar_url: 'https://example.com/new_avatar.png',
      },
    });

    // verifyOtp가 호출되었는지 확인
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'existing-token-456',
      type: 'email',
    });
  });
});
