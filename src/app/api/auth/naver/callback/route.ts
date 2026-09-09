import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const isJson = searchParams.get('format') === 'json' || request.headers.get('accept')?.includes('application/json');

  const createErrorResponse = (errorCode: string, errorMessage: string) => {
    if (isJson) {
      return NextResponse.json({ success: false, error: errorMessage, code: errorCode }, { status: 400 });
    }
    return NextResponse.redirect(new URL(`/?error=${errorCode}`, request.url));
  };

  if (!code) {
    return createErrorResponse('naver_code_missing', '네이버 인증 코드가 유효하지 않거나 누락되었습니다.');
  }

  const clientId = process.env.NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID;
  const clientSecret = process.env.NEXT_NAVER_LOGIN_SECRET_ID;

  if (!clientId || !clientSecret) {
    console.error('Naver Client ID or Client Secret is missing in environment variables.');
    return createErrorResponse('naver_config_missing', '서버에 네이버 로그인 API 키 설정이 올바르지 않습니다.');
  }

  try {
    // 1. 네이버 access_token 발급 요청
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    if (state) tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl.toString(), { method: 'POST' });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Failed to get Naver access_token:', tokenData);
      return createErrorResponse('naver_token_failed', tokenData.error_description || '네이버 액세스 토큰 발급에 실패했습니다.');
    }

    const accessToken = tokenData.access_token;

    // 2. 네이버 유저 프로필 조회
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const profileData = await profileRes.json();

    if (!profileRes.ok || profileData.resultcode !== '00') {
      console.error('Failed to fetch Naver user profile:', profileData);
      return createErrorResponse('naver_profile_failed', profileData.message || '네이버 프로필 정보를 가져오지 못했습니다.');
    }

    const naverUser = profileData.response;
    const naverId = naverUser.id;
    const email = naverUser.email || `naver_${naverId}@naver.user`;
    const nickname = naverUser.nickname || naverUser.name || '네이버 여행자';
    const profileImage = naverUser.profile_image || '';

    // 3. Supabase Admin 클라이언트를 사용하여 계정 처리 (O(1) 플로우)
    const adminSupabase = createAdminClient();

    // 3-1. 신규 사용자 생성 시도
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        nickname,
        avatar_url: profileImage,
        provider: 'naver',
        naver_id: naverId,
      },
    });

    // 3-2. 세션 수립을 위한 Magic Link 토큰 및 유저 정보 발급
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token || !linkData.user) {
      console.error('Failed to generate session link for Naver user:', linkError || createError);
      return createErrorResponse('session_link_failed', '로그인 세션 생성 링크를 만들지 못했습니다.');
    }

    // 3-3. 기존 사용자였던 경우(newUser 미생성 시) 최신 프로필 메타데이터 갱신
    if (!newUser?.user) {
      const existingUser = linkData.user;
      await adminSupabase.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          ...existingUser.user_metadata,
          nickname: existingUser.user_metadata?.nickname || nickname,
          avatar_url: existingUser.user_metadata?.avatar_url || profileImage,
          provider: 'naver',
        },
      });
    }

    const serverSupabase = await createClient();
    const { error: verifyError } = await serverSupabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    });

    if (verifyError) {
      console.error('Failed to verify OTP session:', verifyError);
      return createErrorResponse('session_verify_failed', '세션 인증에 실패했습니다.');
    }

    if (isJson) {
      return NextResponse.json({ success: true, redirectUrl: '/' });
    }

    // 로그인 성공 후 메인 화면으로 이동
    return NextResponse.redirect(new URL('/', request.url));
  } catch (err) {
    console.error('Unexpected error during Naver OAuth callback:', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return createErrorResponse('naver_auth_unexpected', message);
  }
}
