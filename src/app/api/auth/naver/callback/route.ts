import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=naver_code_missing', request.url));
  }

  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver Client ID or Client Secret is missing in environment variables.');
    return NextResponse.redirect(new URL('/?error=naver_config_missing', request.url));
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
      return NextResponse.redirect(new URL('/?error=naver_token_failed', request.url));
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
      return NextResponse.redirect(new URL('/?error=naver_profile_failed', request.url));
    }

    const naverUser = profileData.response;
    const naverId = naverUser.id;
    const email = naverUser.email || `naver_${naverId}@naver.user`;
    const nickname = naverUser.nickname || naverUser.name || '네이버 여행자';
    const profileImage = naverUser.profile_image || '';

    // 3. Supabase Admin 클라이언트를 사용하여 계정 처리
    const adminSupabase = createAdminClient();

    // 이메일로 기존 유저 확인
    const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers();
    if (listError) {
      console.error('Error listing Supabase users:', listError);
      return NextResponse.redirect(new URL('/?error=supabase_user_check_failed', request.url));
    }

    let user = users.find((u) => u.email === email);

    if (!user) {
      // 새 유저 생성
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

      if (createError || !newUser.user) {
        console.error('Failed to create Supabase user for Naver OAuth:', createError);
        return NextResponse.redirect(new URL('/?error=user_creation_failed', request.url));
      }
      user = newUser.user;
    } else {
      // 기존 유저 메타데이터 갱신
      await adminSupabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          nickname: user.user_metadata?.nickname || nickname,
          avatar_url: user.user_metadata?.avatar_url || profileImage,
          provider: 'naver',
        },
      });
    }

    // 4. Supabase 세션 수립 (Magic Link 토큰 발행 후 서버 클라이언트로 verifyOtp)
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      console.error('Failed to generate session link for Naver user:', linkError);
      return NextResponse.redirect(new URL('/?error=session_link_failed', request.url));
    }

    const serverSupabase = await createClient();
    const { error: verifyError } = await serverSupabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    });

    if (verifyError) {
      console.error('Failed to verify OTP session:', verifyError);
      return NextResponse.redirect(new URL('/?error=session_verify_failed', request.url));
    }

    // 로그인 성공 후 메인 화면으로 이동
    return NextResponse.redirect(new URL('/', request.url));
  } catch (err) {
    console.error('Unexpected error during Naver OAuth callback:', err);
    return NextResponse.redirect(new URL('/?error=naver_auth_unexpected', request.url));
  }
}
