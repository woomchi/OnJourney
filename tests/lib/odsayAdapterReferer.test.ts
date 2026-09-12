import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getOdsayReferer } from '@/lib/infrastructure/odsayAdapter';

describe('odsayAdapter - getOdsayReferer', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DOMAIN;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('process.env.DOMAIN이 설정되어 있으면 최우선으로 사용하고 따옴표와 trailing slash를 제거한다', () => {
    process.env.DOMAIN = '"https://custom-domain.com/"';
    expect(getOdsayReferer()).toBe('https://custom-domain.com');
  });

  it('process.env.DOMAIN에 프로토콜이 없으면 https://를 자동으로 붙인다', () => {
    process.env.DOMAIN = 'custom-domain.com';
    expect(getOdsayReferer()).toBe('https://custom-domain.com');
  });

  it('DOMAIN이 없고 NEXT_PUBLIC_SITE_URL이 있으면 이를 사용한다', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site-url.com/';
    expect(getOdsayReferer()).toBe('https://site-url.com');
  });

  it('DOMAIN이 없고 VERCEL_PROJECT_PRODUCTION_URL이 있으면 이를 사용한다', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'on-journey.vercel.app';
    expect(getOdsayReferer()).toBe('https://on-journey.vercel.app');
  });

  it('DOMAIN이 없고 VERCEL_URL이 있으면 이를 사용한다', () => {
    process.env.VERCEL_URL = 'on-journey-git-preview.vercel.app';
    expect(getOdsayReferer()).toBe('https://on-journey-git-preview.vercel.app');
  });

  it('아무런 환경변수가 없고 NODE_ENV가 development이면 http://localhost:3000을 반환한다', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    expect(getOdsayReferer()).toBe('http://localhost:3000');
  });

  it('아무런 환경변수가 없고 NODE_ENV가 production이면 기본 배포 도메인 https://on-journey.vercel.app을 반환한다', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    expect(getOdsayReferer()).toBe('https://on-journey.vercel.app');
  });
});
