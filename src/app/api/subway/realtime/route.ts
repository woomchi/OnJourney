import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { calculateSubwayETADynamic, calculateNextTrainFromTimetable } from '@/lib/subwayService';

export const dynamic = 'force-dynamic';

function getHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getMockMinutesLeft(station: string, direction: string, interval: number, offset: number): number {
  const seed = getHashCode(station + direction) + offset;
  const currentMinutes = Math.floor(Date.now() / 60000);
  const elapsedCycleTime = (currentMinutes + seed) % interval;
  let minutesLeft = interval - elapsedCycleTime;
  if (minutesLeft <= 0) minutesLeft = interval;
  return minutesLeft;
}

// Format current date as YYYY-MM-DD HH:mm:ss for mock datestamps
function getFormattedCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Generate fallback live mock subway arrivals for demo purposes if the API fails
async function generateMockSubwayArrivals(station: string) {
  const cleanStation = station.replace(/역$/, '').trim();
  const nowStr = getFormattedCurrentTime();
  const results: any[] = [];

  const minDown1 = getMockMinutesLeft(cleanStation, '하행', 15, 0);
  const minDown2 = getMockMinutesLeft(cleanStation, '하행', 15, 8);
  const minUp1 = getMockMinutesLeft(cleanStation, '상행', 15, 3);
  const minUp2 = getMockMinutesLeft(cleanStation, '상행', 15, 11);

  const pushMock = (minutesLeft: number, updnLine: string, trainNo: string) => {
    const isApproaching = minutesLeft <= 1;
    const arrivalTime = new Date(Date.now() + minutesLeft * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    results.push({
      subwayId: '1001',
      updnLine,
      trainNo,
      statnNm: cleanStation,
      arvlMsg2: isApproaching ? '곧 도착' : `[${Math.max(1, Math.ceil(minutesLeft/2))}]번째 전역`,
      recptnDt: nowStr,
      minutesLeft,
      arrivalTime,
      isApproaching,
      statusText: isApproaching ? '곧 도착' : `약 ${minutesLeft}분 뒤 도착 예정 (${arrivalTime})`
    });
  };

  pushMock(minDown1, '하행', '1903');
  pushMock(minDown2, '하행', '1905');
  pushMock(minUp1, '상행', '1904');
  pushMock(minUp2, '상행', '1906');

  // Sort by minutes left ascending
  return results.sort((a, b) => {
    if (a.isApproaching && !b.isApproaching) return -1;
    if (!a.isApproaching && b.isApproaching) return 1;
    return a.minutesLeft - b.minutesLeft;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get('station');
  const wayCode = searchParams.get('wayCode');

  if (!station) {
    return NextResponse.json(
      { error: '조회할 역이름(station) 파라미터가 필요합니다.' },
      { status: 400 }
    );
  }

  const apiKey = process.env.REAL_TIME_SEOUL_SUBWAY_API_KEY;
  const cleanStation = station.replace(/역$/, '').trim();

  // If API Key is not set or placeholder is used, immediately use mock fallback
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    console.info(`[subway] No API Key set. Serving mock real-time subway data for station: ${cleanStation}`);
    const mocks = await generateMockSubwayArrivals(cleanStation);
    return NextResponse.json(mocks);
  }

  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/xml/realtimeStationArrival/0/20/${encodeURIComponent(cleanStation)}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 15 } // Short cache time for real-time data
    });

    if (!response.ok) {
      console.warn(`[subway] External API returned error status: ${response.status}. Using fallback mock data.`);
      const mocks = await generateMockSubwayArrivals(cleanStation);
      return NextResponse.json(mocks);
    }

    const xmlData = await response.text();

    // Check if the API response contains standard error messages in text/xml
    if (xmlData.includes('RESULT.LIMIT_TO_OVER_ERROR') || xmlData.includes('KEY형식오류') || xmlData.includes('인증키가 유효하지 않습니다')) {
      console.warn('[subway] External API key error or limit exceeded. Using fallback mock data.');
      const mocks = await generateMockSubwayArrivals(cleanStation);
      return NextResponse.json(mocks);
    }

    const parser = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: true
    });
    
    const parsed = parser.parse(xmlData);
    
    let rows = parsed?.realtimeStationArrival?.row;
    if (!rows) {
      rows = [];
    } else if (!Array.isArray(rows)) {
      rows = [rows];
    }

    const currentTimeMs = Date.now();
    rows = rows.filter((row: any) => {
      const arvlCd = String(row.arvlCd || '');
      
      // 2: 출발 (Departed). 이미 역을 떠난 열차는 제외합니다.
      if (arvlCd === '2') return false;

      // 0: 진입, 1: 도착. 진입/도착 상태이면서 90초 이상 경과했다면 유령 데이터로 간주하여 제외합니다.
      if (arvlCd === '0' || arvlCd === '1') {
        const recptnDt = String(row.recptnDt || '');
        if (recptnDt) {
          try {
            const receiptTimeMs = new Date(recptnDt.replace(' ', 'T')).getTime();
            if (!isNaN(receiptTimeMs) && (currentTimeMs - receiptTimeMs > 90000)) {
              return false;
            }
          } catch (e) {}
        }
      }
      return true;
    });

    if (rows.length === 0) {
      if (wayCode) {
        const updnLine = wayCode === '1' ? '상행' : '하행';
        const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);
        if (nextTrain) {
          return NextResponse.json([{
            subwayId: '',
            updnLine,
            trainNo: nextTrain.trainNo,
            statnNm: cleanStation,
            arvlMsg2: nextTrain.statusText,
            recptnDt: '',
            statusText: nextTrain.statusText,
            minutesLeft: nextTrain.minutesLeft,
            arrivalTime: nextTrain.arrivalTime,
            isApproaching: nextTrain.isApproaching,
            isRealtime: false
          }]);
        }
      }
      return NextResponse.json([]);
    }

    // Process all train arrival calculations asynchronously in parallel
    const processedArrivalsPromises = rows.map(async (row: any) => {
      const liveMsg = String(row.arvlMsg2 || '');
      const recTime = String(row.recptnDt || '');
      const lineName = String(row.updnLine || '');
      const trainNo = String(row.btrainNo || row.trainNo || '');
      const barvlDt = Number(row.barvlDt || 0);
      
      const eta = await calculateSubwayETADynamic(liveMsg, recTime, cleanStation, trainNo, lineName, barvlDt);

      return {
        subwayId: String(row.subwayId || ''),
        updnLine: lineName,
        trainNo,
        statnNm: cleanStation,
        arvlMsg2: liveMsg,
        recptnDt: recTime,
        ...eta,
        isRealtime: true
      };
    });

    const processedArrivals = await Promise.all(processedArrivalsPromises);

    // Sort by arrival countdown time (approaching first, then lower minutes)
    processedArrivals.sort((a: any, b: any) => {
      if (a.isApproaching && !b.isApproaching) return -1;
      if (!a.isApproaching && b.isApproaching) return 1;
      return a.minutesLeft - b.minutesLeft;
    });

    return NextResponse.json(processedArrivals);
  } catch (error) {
    console.error(`[subway] Exception while fetching live arrivals for ${cleanStation}:`, error);
    if (wayCode) {
      const updnLine = wayCode === '1' ? '상행' : '하행';
      const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);
      if (nextTrain) {
        return NextResponse.json([{
          subwayId: '',
          updnLine,
          trainNo: nextTrain.trainNo,
          statnNm: cleanStation,
          arvlMsg2: nextTrain.statusText,
          recptnDt: '',
          statusText: nextTrain.statusText,
          minutesLeft: nextTrain.minutesLeft,
          arrivalTime: nextTrain.arrivalTime,
          isApproaching: nextTrain.isApproaching,
          isRealtime: false
        }]);
      }
    }
    return NextResponse.json([]);
  }
}
