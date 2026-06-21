import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export const dynamic = 'force-dynamic';

const CITY_MAP: Record<string, string> = {
  "서울": "11",
  "부산": "21",
  "대구": "22",
  "인천": "23",
  "광주": "24",
  "대전": "25",
  "울산": "26",
  "세종": "29",
  "수원": "31010",
  "성남": "31020",
  "의정부": "31030",
  "안양": "31040",
  "부천": "31050",
  "광명": "31060",
  "평택": "31070",
  "동두천": "31080",
  "안산": "31090",
  "고양": "31100",
  "과천": "31110",
  "구리": "31120",
  "남양주": "31130",
  "오산": "31140",
  "시흥": "31150",
  "군포": "31160",
  "의왕": "31170",
  "하남": "31180",
  "용인": "31190",
  "파주": "31200",
  "이천": "31210",
  "안성": "31220",
  "김포": "31230",
  "화성": "31240",
  "광주(경기)": "31250",
  "양주": "31260",
  "포천": "31270",
  "여주": "31280",
  "연천": "31350",
  "가평": "31370",
  "양평": "31380"
};
// 간단한 문자열 해시 함수
function getHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// 시간의 흐름에 따라 1분씩 줄어드는 동적 버스 도착 정보 생성 함수
function generateSimulatedBusArrival(station: string, busNo: string) {
  const cleanStation = station.trim();
  const cleanBusNo = busNo.replace(/번\s*버스$/, '').trim();
  
  const seed = getHashCode(cleanStation + cleanBusNo);
  const nowSec = Math.floor(Date.now() / 1000);
  const currentMinutes = Math.floor(nowSec / 60);

  // 배차 간격 12분 가정
  const interval = 12;
  const elapsedCycleTime = (currentMinutes + seed) % interval;
  
  // 남은 분은 1분씩 감소하다가 0이 되면 12분으로 리셋됨
  let minutesLeft1 = interval - elapsedCycleTime;
  if (minutesLeft1 <= 0) minutesLeft1 = interval;
  
  // 두 번째 버스는 첫 번째 버스보다 8분 뒤에 오도록 설정
  const minutesLeft2 = minutesLeft1 + 8;

  // 정류장 수 계산 (평균 2분당 1정류장)
  const stationNum1 = Math.max(1, Math.ceil(minutesLeft1 / 2));
  const stationNum2 = Math.max(stationNum1 + 2, Math.ceil(minutesLeft2 / 2));

  const isApproaching1 = minutesLeft1 <= 2;
  const isApproaching2 = false;

  const statusText1 = isApproaching1 
    ? '곧 도착' 
    : `${minutesLeft1}분 (${stationNum1}전)`;

  const statusText2 = `${minutesLeft2}분 (${stationNum2}전)`;

  return {
    busNo: cleanBusNo,
    stationName: cleanStation,
    predictTime1: minutesLeft1,
    stationNum1,
    predictTime2: minutesLeft2,
    stationNum2,
    statusText1,
    statusText2,
    isApproaching1,
    isApproaching2,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get('station');
  const busNo = searchParams.get('busNo');

  if (!station || !busNo) {
    return NextResponse.json(
      { error: '정류소명(station)과 버스번호(busNo) 파라미터가 필요합니다.' },
      { status: 400 }
    );
  }

  const odsayKey = process.env.ODSAY_API_KEY;
  const tagoKey = process.env.REAL_TIME_BUS_API_KEY;

  if (!tagoKey || !odsayKey || tagoKey === 'PLACEHOLDER' || odsayKey === 'PLACEHOLDER' || tagoKey.trim() === '') {
    const mock = generateSimulatedBusArrival(station, busNo);
    return NextResponse.json(mock);
  }

  try {
    // 1단계: ODsay API로 정류소 검색
    const odsayUrl = `https://api.odsay.com/v1/api/searchStation?lang=0&stationName=${encodeURIComponent(station)}&stationClass=1&apiKey=${encodeURIComponent(odsayKey)}`;
    const odsayRes = await fetch(odsayUrl, { signal: AbortSignal.timeout(3000) });
    const odsayData = await odsayRes.json();
    
    if (odsayData?.result?.station?.length > 0) {
      const targetBusNo = busNo.replace(/번\s*버스$/, '').replace(/번$/, '').trim();

      // 가장 첫 번째 정류소를 사용하되, 버스 번호가 일치하는 정류소를 우선적으로 찾습니다.
      let st = odsayData.result.station.find((station: any) => {
        return station.businfo && station.businfo.some((b: any) => String(b.busNo) === targetBusNo);
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
            const res = await fetch(ggUrl, { signal: AbortSignal.timeout(3000) });
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
          } catch(e) {}
          return null;
        };

        const fetchTago = async () => {
          try {
            let nodeId = localStationID;
            if (cityCode.startsWith('31') && /^\d+$/.test(localStationID)) {
              nodeId = `GGB${localStationID}`;
            }
            const tagoUrl = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=${tagoKey}&cityCode=${cityCode}&nodeId=${nodeId}&_type=json&numOfRows=100&pageNo=1`;
            const res = await fetch(tagoUrl, { signal: AbortSignal.timeout(3000) });
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
          } catch(e) {}
          return null;
        };

        const [ggRes, tgRes] = await Promise.all([fetchGyeonggi(), fetchTago()]);

        if (ggRes) return NextResponse.json(ggRes);
        if (tgRes) return NextResponse.json(tgRes);
        
        // 정류소는 찾았으나 해당 버스 도착 정보가 없는 경우 (예: 차고지 대기중, 운행 종료 등)
        return NextResponse.json({
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
        });
      }
    }
    
    // API에 매칭되는 데이터가 없으면 '정보 없음' 반환
    return NextResponse.json({
      busNo: busNo.replace(/번\s*버스$/, '').replace(/번$/, '').trim(),
      stationName: station,
      predictTime1: 0,
      stationNum1: 0,
      statusText1: '정보 없음',
      statusText2: '',
      isApproaching1: false,
      isApproaching2: false,
      isRealtime: true
    });
    
  } catch (error: any) {
    // console.error(`[bus] Exception while fetching live arrivals for ${station}: ${error.name || 'Error'} - ${error.message || 'Unknown error'}`);
    // 에러 발생 시에만 시뮬레이터로 폴백
    const mock = generateSimulatedBusArrival(station, busNo);
    return NextResponse.json(mock);
  }
}
