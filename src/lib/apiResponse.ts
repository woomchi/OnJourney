import { NextResponse, NextRequest } from 'next/server';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function successResponse<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    { success: true, data } as ApiResponse<T>,
    { status, headers }
  );
}

export function errorResponse(message: string, code = 'INTERNAL_SERVER_ERROR', status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    } as ApiResponse,
    { status }
  );
}

export type RouteContext = {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
};

// Global API Wrapper for Route Handlers
export function withErrorHandler<T = unknown>(
  handler: (request: NextRequest, context: RouteContext) => Promise<NextResponse<ApiResponse<T>> | NextResponse | void>
) {
  return async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
    try {
      const response = await handler(request, context);
      if (response) {
        return response;
      }
      return successResponse(null);
    } catch (error: unknown) {
      console.error(`[API Error] ${request.method} ${request.url}:`, error);

      const errObj = error as { name?: string; errors?: Array<{ message?: string }>; status?: number; message?: string; code?: string };

      // Handle custom or standard errors
      if (errObj?.name === 'ZodError') {
        return errorResponse(`Invalid parameters: ${errObj.errors?.[0]?.message || 'Validation Failed'}`, 'VALIDATION_ERROR', 400);
      }

      const status = errObj?.status || 500;
      const message = errObj?.message || 'Internal Server Error';
      const code = errObj?.code || 'INTERNAL_SERVER_ERROR';

      return errorResponse(message, code, status);
    }
  };
}
