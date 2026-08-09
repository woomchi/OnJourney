import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 온디맨드 캐시 파기 관리자 API
 *
 * POST /api/admin/revalidate
 * Body: { tag?: string } (미지정 시 대중교통 관련 캐시 태그 일괄 파기)
 */
export async function POST(req: NextRequest) {
  const secretKey = process.env.ADMIN_SECRET_KEY;
  if (secretKey) {
    const authHeader = req.headers.get('x-admin-secret') || req.headers.get('authorization');
    if (!authHeader || !authHeader.includes(secretKey)) {
      return NextResponse.json({ success: false, error: '인증 권한이 없습니다.' }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetTag = body.tag;

    if (targetTag) {
      revalidateTag(targetTag, 'default');
      return NextResponse.json({
        success: true,
        message: `캐시 태그 '${targetTag}' 가 즉시 초기화되었습니다.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 기본 태그 일괄 파기
    revalidateTag('odsay-loadlane-v1', 'default');
    revalidateTag('odsay-station-search-v1', 'default');
    revalidateTag('odsay-directions-pubtrans', 'default');

    return NextResponse.json({
      success: true,
      message: '대중교통 관련 서버 캐시(Polyline, 정류장, 길찾기)가 일괄 초기화되었습니다.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '캐시 초기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
