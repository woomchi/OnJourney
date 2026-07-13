import { NextResponse, NextRequest } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data } as ApiResponse<T>,
    { status }
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

// Global API Wrapper for Route Handlers
export function withErrorHandler(
  handler: (request: NextRequest, context: any) => Promise<NextResponse | void>
) {
  return async (request: NextRequest, context: any) => {
    try {
      const response = await handler(request, context);
      if (response) {
        return response;
      }
      return successResponse(null);
    } catch (error: any) {
      console.error(`[API Error] ${request.method} ${request.url}:`, error);

      // Handle custom or standard errors
      if (error.name === 'ZodError') {
        return errorResponse(`Invalid parameters: ${error.errors?.[0]?.message || 'Validation Failed'}`, 'VALIDATION_ERROR', 400);
      }

      const status = error.status || 500;
      const message = error.message || 'Internal Server Error';
      const code = error.code || 'INTERNAL_SERVER_ERROR';

      return errorResponse(message, code, status);
    }
  };
}
