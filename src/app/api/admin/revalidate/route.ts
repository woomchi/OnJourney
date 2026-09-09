import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const revalidateSchema = z.object({
  tag: z.string().trim().min(1, '태그 이름은 비어있을 수 없습니다.').optional(),
});

/**
 * 온디맨드 캐시 파기 관리자 API
 *
 * POST /api/admin/revalidate
 * Body: { tag?: string } (미지정 시 대중교통 관련 캐시 태그 일괄 파기)
 */
export async function POST(req: NextRequest) {
  const secretKey = process.env.ADMIN_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { success: false, error: '서버 관리자 키(ADMIN_SECRET_KEY)가 구성되지 않아 엔드포인트가 비활성화되었습니다.' },
      { status: 503 }
    );
  }

  const rawAuth = req.headers.get('x-admin-secret') || req.headers.get('authorization');
  const token = rawAuth?.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth?.trim();

  if (!token || token !== secretKey) {
    return NextResponse.json({ success: false, error: '인증 권한이 없습니다.' }, { status: 401 });
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const parseResult = revalidateSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '잘못된 요청 파라미터입니다.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const targetTag = parseResult.data.tag;

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '캐시 초기화 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
