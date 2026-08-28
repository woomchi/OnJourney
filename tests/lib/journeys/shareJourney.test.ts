import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPublicJourneyById, toggleJourneyPublic } from '@/lib/journeys/index';

const mockMaybeSingle = vi.fn();
const mockEqId = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEqId }));
const mockUpdateSelect = vi.fn(() => ({ single: mockMaybeSingle }));
const mockUpdateEqUser = vi.fn(() => ({ select: mockUpdateSelect }));
const mockUpdateEqId = vi.fn(() => ({ eq: mockUpdateEqUser }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEqId }));
const mockFrom = vi.fn((table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

describe('Journey Sharing operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchPublicJourneyById', () => {
    it('공개된 여정 ID로 조회 시 정상적으로 여정 데이터를 반환한다', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'journey-public-1',
          user_id: 'user-creator',
          title: '공유된 부산 여행',
          transport_type: 'public',
          journey_date: '2026-08-28',
          is_public: true,
          places: [],
          current_step: 0,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
        error: null,
      });

      const result = await fetchPublicJourneyById('journey-public-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('journey-public-1');
      expect(result?.is_public).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('journeys');
      expect(mockEqId).toHaveBeenCalledWith('id', 'journey-public-1');
    });

    it('존재하지 않거나 비공개 여정일 때 null을 반환한다', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await fetchPublicJourneyById('journey-private-or-missing');
      expect(result).toBeNull();
    });
  });

  describe('toggleJourneyPublic', () => {
    it('여정의 공개 여부(is_public)를 정상적으로 토글 수정한다', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-creator' } },
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'journey-1',
          user_id: 'user-creator',
          title: '내 여정',
          transport_type: 'public',
          journey_date: '2026-08-28',
          is_public: true,
          places: [],
          current_step: 0,
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
        error: null,
      });

      const result = await toggleJourneyPublic('journey-1', true);
      expect(result.is_public).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_public: true,
        })
      );
    });
  });
});
