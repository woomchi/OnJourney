import { PlacesQueryType } from '../validations/places';

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export async function fetchPlaces(params: PlacesQueryType): Promise<PlaceResult[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error('카카오 REST API 키가 설정되지 않았습니다.');
  }

  const { query, lat, lng, minLat, maxLat, minLng, maxLng, sort } = params;

  let items: PlaceResult[] = [];
  const baseUrl = 'https://dapi.kakao.com/v2/local/search/keyword.json';

  const urlParams = new URLSearchParams();
  urlParams.set('query', query);
  urlParams.set('size', '15'); // 1회 요청당 최대 결과 수

  if (sort) {
    urlParams.set('sort', sort);
  }

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    urlParams.set('y', lat.toString());
    urlParams.set('x', lng.toString());
  }

  if (
    minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined &&
    !isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)
  ) {
    urlParams.set('rect', `${minLng},${minLat},${maxLng},${maxLat}`);
  }

  // Fetch a single page
  const fetchPage = async (page: number) => {
    const pageParams = new URLSearchParams(urlParams);
    pageParams.set('page', page.toString());
    const url = `${baseUrl}?${pageParams.toString()}`;

    // Added AbortSignal for defensive programming
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `KakaoAK ${apiKey}`
        },
        next: { revalidate: 30 },
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[placesService] Kakao API page ${page} error:`, res.status, text);
        try {
          const errData = JSON.parse(text);
          if (errData.message) {
            throw new Error(`카카오 API 오류: ${errData.message}`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('카카오 API 오류')) {
            throw e;
          }
        }
        throw new Error(`카카오 API 호출에 실패했습니다. (Status: ${res.status})`);
      }

      const data = await res.json();
      if (!data.documents) return [];

      return data.documents.map((doc: any) => ({
        id: doc.id,
        place_name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        category: doc.category_name,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('카카오 API 호출 시간이 초과되었습니다.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Fetch 3 pages in parallel
  const [page1, page2, page3] = await Promise.all([fetchPage(1), fetchPage(2), fetchPage(3)]);
  const combinedItems = [...page1, ...page2, ...page3];

  // Remove duplicates
  const seen = new Set<string>();
  items = combinedItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const getCategoryPriority = (category: string) => {
    if (!category) return 99;
    if (category.includes('관광') || category.includes('명소') || category.includes('여행')) return 1;
    if (category.includes('문화') || category.includes('예술') || category.includes('유적') || category.includes('역사')) return 2;
    if (category.includes('숙박') || category.includes('호텔') || category.includes('펜션')) return 3;
    if (category.includes('음식점') || category.includes('카페') || category.includes('식당')) return 4;
    if (category.includes('교통') || category.includes('역') || category.includes('터미널')) return 5;
    
    if (category.includes('농업') || category.includes('부동산') || category.includes('기업') || category.includes('산업')) return 10;
    
    return 7;
  };

  items.sort((a, b) => {
    const cleanQuery = query.toLowerCase().trim();
    const aName = a.place_name.toLowerCase();
    const bName = b.place_name.toLowerCase();
    
    const aHasQuery = aName.includes(cleanQuery);
    const bHasQuery = bName.includes(cleanQuery);

    if (aHasQuery && !bHasQuery) return -1;
    if (!aHasQuery && bHasQuery) return 1;

    if (aHasQuery && bHasQuery) {
      const priorityA = getCategoryPriority(a.category);
      const priorityB = getCategoryPriority(b.category);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
    }

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      const distA = Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2);
      const distB = Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2);
      return distA - distB;
    }

    return 0;
  });

  return items;
}
