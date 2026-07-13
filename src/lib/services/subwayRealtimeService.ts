import { XMLParser } from 'fast-xml-parser';
import { calculateSubwayETADynamic, calculateNextTrainFromTimetable } from '@/lib/subwayService';
import { SubwayRealtimeQueryType } from '../validations/subway';

export async function fetchSubwayRealtime(params: SubwayRealtimeQueryType) {
  const { station, wayCode } = params;
  const apiKey = process.env.REAL_TIME_SEOUL_SUBWAY_API_KEY;
  const cleanStation = station.replace(/역$/, '').trim();

  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    if (wayCode) {
      const updnLine = wayCode === '1' ? '상행' : '하행';
      const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);
      if (nextTrain) {
        return [{
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
        }];
      }
    }
    return [];
  }

  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/xml/realtimeStationArrival/0/20/${encodeURIComponent(cleanStation)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      next: { revalidate: 15 },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`External API returned error status: ${response.status}`);
    }

    const xmlData = await response.text();

    if (xmlData.includes('RESULT.LIMIT_TO_OVER_ERROR') || xmlData.includes('KEY형식오류') || xmlData.includes('인증키가 유효하지 않습니다')) {
      throw new Error('External API key error or limit exceeded');
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
      
      if (arvlCd === '2') return false;

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
          return [{
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
          }];
        }
      }
      return [];
    }

    const processedArrivalsPromises = rows.map(async (row: any) => {
      const liveMsg = String(row.arvlMsg2 || '');
      const recTime = String(row.recptnDt || '');
      const lineName = String(row.updnLine || '');
      const trainNo = String(row.btrainNo || row.trainNo || '');
      const barvlDt = Number(row.barvlDt || 0);
      
      const eta = await calculateSubwayETADynamic(liveMsg, recTime, cleanStation, trainNo, lineName, barvlDt, String(row.subwayId || ''));

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

    processedArrivals.sort((a: any, b: any) => {
      if (a.isApproaching && !b.isApproaching) return -1;
      if (!a.isApproaching && b.isApproaching) return 1;
      return a.minutesLeft - b.minutesLeft;
    });

    return processedArrivals;
  } catch (error: any) {
    console.error(`[subwayRealtimeService] Exception for ${cleanStation}:`, error);
    
    if (error.name === 'AbortError') {
      console.warn(`[subwayRealtimeService] Timeout fetching live arrivals for ${cleanStation}`);
    }

    if (wayCode) {
      const updnLine = wayCode === '1' ? '상행' : '하행';
      const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);
      if (nextTrain) {
        return [{
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
        }];
      }
    }
    
    // Instead of throwing, fallback to empty array to maintain original API behavior on error
    // so the client doesn't crash if live data is unavailable.
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
