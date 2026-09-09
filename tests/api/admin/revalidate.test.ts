import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/revalidate/route';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

describe('POST /api/admin/revalidate 보안 및 입력 검증', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('ADMIN_SECRET_KEY 미설정 시 503 Service Unavailable을 반환하고 차단(Fail-Closed)한다', async () => {
    delete process.env.ADMIN_SECRET_KEY;

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error).toContain('ADMIN_SECRET_KEY');
  });

  it('인증 헤더가 없을 때 401 Unauthorized를 반환한다', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('잘못된 시크릿 키로 요청 시 401 Unauthorized를 반환한다', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      headers: {
        'x-admin-secret': 'wrong-key',
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('부분 문자열 매칭 시도 시 거부되어야 한다 (엄격한 일치 확인)', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      headers: {
        'x-admin-secret': 'super-secret', // 일부분만 일치
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('올바른 x-admin-secret 헤더 제공 시 정상 초기화(200)된다', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';
    const { revalidateTag } = await import('next/cache');

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      headers: {
        'x-admin-secret': 'super-secret-key',
      },
      body: JSON.stringify({ tag: 'custom-tag' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(revalidateTag).toHaveBeenCalledWith('custom-tag', 'default');
  });

  it('Bearer 토큰 형태의 Authorization 헤더도 올바르게 인증된다', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';
    const { revalidateTag } = await import('next/cache');

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer super-secret-key',
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(revalidateTag).toHaveBeenCalledWith('odsay-loadlane-v1', 'default');
  });

  it('빈 문자열 태그 등 잘못된 파라미터 요청 시 400 Bad Request를 반환한다', async () => {
    process.env.ADMIN_SECRET_KEY = 'super-secret-key';

    const req = new NextRequest('http://localhost:3000/api/admin/revalidate', {
      method: 'POST',
      headers: {
        'x-admin-secret': 'super-secret-key',
      },
      body: JSON.stringify({ tag: '   ' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
