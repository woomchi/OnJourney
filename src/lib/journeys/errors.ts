const SCHEMA_NOT_READY_PATTERNS = [
  'schema cache',
  'PGRST205',
  "Could not find the table 'public.journeys'",
];

export function isSchemaNotReadyError(message: string): boolean {
  const lower = message.toLowerCase();
  return SCHEMA_NOT_READY_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase()),
  );
}

export function toJourneyErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === 'PGRST205' || isSchemaNotReadyError(error.message)) {
    return '데이터베이스에 journeys 테이블이 없습니다. 터미널에서 npm run db:setup 을 실행하거나 Supabase SQL Editor에서 마이그레이션 SQL을 실행해주세요.';
  }
  return error.message;
}
