import { XMLParser } from 'fast-xml-parser';
import { BusRealtimeQueryType } from '../validations/bus';
import { unstable_cache } from 'next/cache';

const CITY_MAP: Record<string, string> = {
  "서울": "11", "부산": "21", "대구": "22", "인천": "23", "광주": "24",
  "대전": "25", "울산": "26", "세종": "29", "수원": "31010", "성남": "31020",
  "의정부": "31030", "안양": "31040", "부천": "31050", "광명": "31060",
  "평택": "31070", "동두천": "31080", "안산": "31090", "고양": "31100",
  "과천": "31110", "구리": "31120", "남양주": "31130", "오산": "31140",
  "시흥": "31150", "군포": "31160", "의왕": "31170", "하남": "31180",
  "용인": "31190", "파주": "31200", "이천": "31210", "안성": "31220",
  "김포": "31230", "화성": "31240", "광주(경기)": "31250", "양주": "31260",
  "포천": "31270", "여주": "31280", "연천": "31350", "가평": "31370",
  "양평": "31380"
};

// ODsay 정류소 검색 (Next.js Cache 적용)
const getCachedStationData = unstable_cache(
  async (stationName: string, apiKey: string) => {
    const url = `https://api.odsay.com/v1/api/searchStation?lang=0&stationName=${encodeURIComponent(stationName)}&stationClass=1&apiKey=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('ODsay fetch status not ok');
      const data = await res.json();
      if (data && data.error) {
        throw new Error('ODsay API error');
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  ['odsay-station-search'],
  { revalidate: 60 * 60 * 24 } // 24시간 캐시
);

export async function fetchBusRealtime(params: BusRealtimeQueryType) {
  const { station, busNo } = params;
  const targetBusNo = busNo.replace(/번\s*버스$/, '').replace(/번$/, '').trim();

  const odsayKey = process.env.ODSAY_API_KEY;
  const tagoKey = process.env.REAL_TIME_BUS_API_KEY;

  if (!tagoKey || !odsayKey || tagoKey === 'PLACEHOLDER' || odsayKey === 'PLACEHOLDER' || tagoKey.trim() === '') {
    return {
      busNo: targetBusNo,
      stationName: station,
      predictTime1: 0,
      stationNum1: 0,
      statusText1: '정보 없음 (API 키 누락)',
      statusText2: '',
      isApproaching1: false,
      isApproaching2: false,
      isRealtime: false
    };
  }

  let odsayData = null;
  try {
    odsayData = await getCachedStationData(station, odsayKey);
  } catch (e) {
    console.error('[busRealtimeService] ODsay cache fetch error:', e);
  }

  if (odsayData?.result?.station?.length > 0) {
    let st = odsayData.result.station.find((s: any) => {
      return s.businfo && s.businfo.some((b: any) => String(b.busNo) === targetBusNo);
    });
    
    if (!st) {
      st = odsayData.result.station[0];
    }

    const cityName = st.cityName;
    const localStationID = String(st.localStationID);
    const cityCode = CITY_MAP[cityName];
    
    if (cityCode) {
      const matchedBusInfo = st.businfo?.find((b: any) => String(b.busNo) === targetBusNo);
      const busLocalBlID = matchedBusInfo ? String(matchedBusInfo.busLocalBlID) : null;
      const ggApiKey = process.env.REAL_TIME_BUS_GYEONGGI_API_KEY;

      const fetchGyeonggi = async () => {
        if (!(cityCode.startsWith('31') && ggApiKey && ggApiKey !== 'PLACEHOLDER' && ggApiKey.trim() !== '' && busLocalBlID)) return null;
        try {
          const ggUrl = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${encodeURIComponent(ggApiKey)}&stationId=${localStationID}&format=json`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const res = await fetch(ggUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!res.ok) return null;
          
          const text = await res.text();
          let arrList: any[] = [];
          try {
            const data = JSON.parse(text);
            const list = data?.response?.msgBody?.busArrivalList;
            if (Array.isArray(list)) arrList = list;
            else if (list) arrList = [list];
          } catch (e) {
            const parser = new XMLParser();
            const xml = parser.parse(text);
            const list = xml?.response?.msgBody?.busArrivalList;
            if (Array.isArray(list)) arrList = list;
            else if (list) arrList = [list];
          }
          
          const matched = arrList.find(it => String(it.routeId) === String(busLocalBlID));
          if (matched) {
            const pTime1 = matched.predictTime1 ? Number(matched.predictTime1) : 0;
            const loc1 = matched.locationNo1 ? Number(matched.locationNo1) : 0;
            if (pTime1 > 0) {
              const isApp1 = pTime1 <= 2 || loc1 <= 1;
              const pTime2 = matched.predictTime2 ? Number(matched.predictTime2) : 0;
              const loc2 = matched.locationNo2 ? Number(matched.locationNo2) : 0;
              const isApp2 = pTime2 <= 2 || loc2 <= 1;
              return {
                busNo: targetBusNo,
                stationName: station,
                predictTime1: pTime1,
                stationNum1: loc1,
                predictTime2: pTime2,
                stationNum2: loc2,
                statusText1: isApp1 ? '곧 도착' : `${pTime1}분 (${loc1}전)`,
                statusText2: pTime2 > 0 ? (isApp2 ? '곧 도착' : `${pTime2}분 (${loc2}전)`) : '',
                isApproaching1: isApp1,
                isApproaching2: pTime2 > 0 ? isApp2 : false,
                isRealtime: true
              };
            }
          }
        } catch(e) {
          console.error('[busRealtimeService] Gyeonggi API error:', e);
        }
        return null;
      };

      const fetchTago = async () => {
        try {
          let nodeId = localStationID;
          if (cityCode.startsWith('31') && /^\d+$/.test(localStationID)) {
            nodeId = `GGB${localStationID}`;
          }
          const tagoUrl = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=${tagoKey}&cityCode=${cityCode}&nodeId=${nodeId}&_type=json&numOfRows=100&pageNo=1`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const res = await fetch(tagoUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!res.ok) return null;
          
          const text = await res.text();
          let items: any[] = [];
          try {
            const data = JSON.parse(text);
            const rawItems = data?.response?.body?.items?.item;
            if (Array.isArray(rawItems)) items = rawItems;
            else if (rawItems) items = [rawItems];
          } catch (e) {
            const parser = new XMLParser();
            const xml = parser.parse(text);
            const rawItems = xml?.response?.body?.items?.item;
            if (Array.isArray(rawItems)) items = rawItems;
            else if (rawItems) items = [rawItems];
          }
          
          const matchedBuses = items.filter(it => String(it.routeno).includes(targetBusNo));
          if (matchedBuses.length > 0) {
            matchedBuses.sort((a, b) => a.arrtime - b.arrtime);
            const firstBus = matchedBuses[0];
            const secondBus = matchedBuses[1];
            const pTime1 = Math.ceil(firstBus.arrtime / 60);
            const loc1 = firstBus.arrprevstationcnt;
            const isApp1 = pTime1 <= 2 || loc1 <= 1;
            let pTime2 = 0, loc2 = 0, isApp2 = false, status2 = '';
            if (secondBus) {
              pTime2 = Math.ceil(secondBus.arrtime / 60);
              loc2 = secondBus.arrprevstationcnt;
              isApp2 = pTime2 <= 2 || loc2 <= 1;
              status2 = isApp2 ? '곧 도착' : `${pTime2}분 (${loc2}전)`;
            }
            return {
              busNo: targetBusNo,
              stationName: station,
              predictTime1: pTime1,
              stationNum1: loc1,
              predictTime2: pTime2,
              stationNum2: loc2,
              statusText1: isApp1 ? '곧 도착' : `${pTime1}분 (${loc1}전)`,
              statusText2: status2,
              isApproaching1: isApp1,
              isApproaching2: isApp2,
              isRealtime: true
            };
          }
        } catch(e) {
          console.error('[busRealtimeService] Tago API error:', e);
        }
        return null;
      };

      const [ggRes, tgRes] = await Promise.all([fetchGyeonggi(), fetchTago()]);

      if (ggRes) return ggRes;
      if (tgRes) return tgRes;
      
      return {
        busNo: targetBusNo,
        stationName: station,
        predictTime1: 0,
        stationNum1: 0,
        predictTime2: 0,
        stationNum2: 0,
        statusText1: '정보 없음',
        statusText2: '',
        isApproaching1: false,
        isApproaching2: false,
        isRealtime: true
      };
    }
  }
  
  return {
    busNo: targetBusNo,
    stationName: station,
    predictTime1: 0,
    stationNum1: 0,
    statusText1: '정보 없음',
    statusText2: '',
    isApproaching1: false,
    isApproaching2: false,
    isRealtime: true
  };
}
