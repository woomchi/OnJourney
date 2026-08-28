import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJourneyById } from '@/lib/journeys/index';

// Mock supabase client
const mockMaybeSingle = vi.fn();
const mockEqUser = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEqId = vi.fn(() => ({ eq: mockEqUser }));
const mockSelect = vi.fn(() => ({ eq: mockEqId }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

describe('fetchJourneyById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인 상태에서는 null을 반환한다', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('No user'),
    });

    const result = await fetchJourneyById('journey-123');
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('존재하지 않거나 타인의 여정일 경우 null을 반환한다', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-abc' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await fetchJourneyById('journey-not-found');
    expect(result).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('journeys');
    expect(mockEqId).toHaveBeenCalledWith('id', 'journey-not-found');
    expect(mockEqUser).toHaveBeenCalledWith('user_id', 'user-abc');
  });

  it('본인 소유의 여정일 경우 정상적으로 Journey 객체로 매핑하여 반환한다', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-abc' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'journey-123',
        user_id: 'user-abc',
        title: '서울 여행',
        transport_type: 'public',
        journey_date: '2026-08-28',
        places: [
          {
            id: 'place-1',
            place_name: '서울역',
            address: '서울 중구',
            category: '교통',
            lat: 37.5546,
            lng: 126.9706,
          },
        ],
        current_step: 0,
        created_at: '2026-08-28T00:00:00Z',
        updated_at: '2026-08-28T00:00:00Z',
      },
      error: null,
    });

    const result = await fetchJourneyById('journey-123');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('journey-123');
    expect(result?.title).toBe('서울 여행');
    expect(result?.places).toHaveLength(1);
    expect(result?.places[0].place_name).toBe('서울역');
  });
});
