/**
 * @fileoverview 대구 도시철도(1, 2, 3호선) 및 대경선 열차시각표 통합 컴파일 스크립트
 *
 * CSV 6종(1/2/3호선 상·하선)과 XLSX 1종(대경선)을 파싱하여
 * 단일 압축 인메모리 데이터베이스(daegu_subway_timetables.json.gz)로 빌드합니다.
 *
 * 실행: node scripts/build-daegu-timetable.mjs
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────

function normalizeStationName(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\(.*?\)/g, '')   // 괄호 및 부역명 제거 (예: '하양(대구가톨릭대)' -> '하양')
    .replace(/\d+$/g, '')       // 끝자리 숫자 제거 (예: '청라언덕2' -> '청라언덕', '반월당2' -> '반월당')
    .replace(/역$/g, '')        // 끝자리 '역' 제거 (예: '동대구역' -> '동대구')
    .trim();
}

function toOperationalMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h = 0, m = 0] = timeStr.split(':').map(Number);
  const adjustedH = h < 5 ? h + 24 : h;
  return adjustedH * 60 + m;
}

function excelTimeToHHMM(val) {
  if (typeof val !== 'number' || isNaN(val)) return null;
  // 엑셀 하루 비율 (0 ~ 1)을 초 단위로 변환
  const totalSecs = Math.round(val * 86400);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── 메인 컴파일러 ────────────────────────────────────────────────────────────

async function buildDaeguTimetables() {
  console.log('🚀 대구 도시철도 & 대경선 시각표 컴파일 시작...');

  const dataDir = path.join(ROOT_DIR, 'data');
  const outDir = path.join(ROOT_DIR, 'src', 'data', 'subway', 'timetables');
  fs.mkdirSync(outDir, { recursive: true });

  const decoder = new TextDecoder('euc-kr');
  const stationTimetables = {}; // Record<역명, Record<key, Item[]>>
  const stationLines = {};      // Record<역명, Set<lineId>>
  const lineStationCounts = { '1': new Set(), '2': new Set(), '3': new Set(), '대경선': new Set() };

  function ensureStation(station) {
    if (!stationTimetables[station]) {
      stationTimetables[station] = {};
    }
    if (!stationLines[station]) {
      stationLines[station] = new Set();
    }
  }

  function addEntry(station, key, item) {
    ensureStation(station);
    if (!stationTimetables[station][key]) {
      stationTimetables[station][key] = [];
    }
    stationTimetables[station][key].push(item);
  }

  // 1. 대구 1, 2, 3호선 CSV 처리
  const csvConfigs = [
    {
      lineId: '1',
      direction: 'UP',
      file: '대구교통공사_1호선 열차시각표(상선)_20241007.csv',
    },
    {
      lineId: '1',
      direction: 'DOWN',
      file: '대구교통공사_1호선 열차시각표(하선)_20241007.csv',
    },
    {
      lineId: '2',
      direction: 'UP',
      file: '대구교통공사_2호선 열차시각표(상선)_20241010.csv',
    },
    {
      lineId: '2',
      direction: 'DOWN',
      file: '대구교통공사_2호선 열차시각표(하선)_20241010.csv',
    },
    {
      lineId: '3',
      direction: 'UP',
      file: '대구교통공사_3호선 열차시각표(상선)_20241007.csv',
    },
    {
      lineId: '3',
      direction: 'DOWN',
      file: '대구교통공사_3호선 열차시각표(하선)_20241007.csv',
    },
  ];

  for (const config of csvConfigs) {
    const filePath = path.join(dataDir, config.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ 파일 누락: ${config.file}`);
      continue;
    }

    const buf = fs.readFileSync(filePath);
    const text = decoder.decode(buf);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const header = lines[0].split(',');
    const trainNumbers = [];
    for (let c = 3; c < header.length; c++) {
      const tNo = header[c].trim();
      if (tNo) trainNumbers.push({ colIndex: c, trainNo: tNo });
    }

    // 파일 내 각 요일별 데이터 그룹화
    // { dayType: [ { station, type, times: [HH:mm...] } ] }
    const rowsByDay = {};

    for (let r = 1; r < lines.length; r++) {
      const parts = lines[r].split(',');
      let dayRaw = parts[0].trim();
      const stationRaw = parts[1].trim();
      const type = parts[2].trim(); // 출발 / 도착

      if (!dayRaw || !stationRaw) continue;

      // 2호선 하선 공공데이터 오타 방어: 하선 파일인데 '휴일(상)'으로 라벨링된 경우 보정
      if (config.direction === 'DOWN' && dayRaw.includes('휴일')) {
        dayRaw = '휴일(하)';
      }

      let dayType = 'WEEKDAY';
      if (dayRaw.includes('토요일')) dayType = 'SATURDAY';
      else if (dayRaw.includes('휴일')) dayType = 'HOLIDAY';

      if (!rowsByDay[dayType]) rowsByDay[dayType] = [];
      rowsByDay[dayType].push({
        station: normalizeStationName(stationRaw),
        rawStation: stationRaw,
        type,
        rowParts: parts,
      });
    }

    // 각 요일별로 열차 종착역 계산 및 스케줄 등록
    for (const [dayType, rowList] of Object.entries(rowsByDay)) {
      const key = `${config.lineId}_${config.direction}_${dayType}`;

      // 각 열차별 종착역(마지막 유효 시간이 있는 역) 계산
      const trainDestMap = {};
      for (const t of trainNumbers) {
        let lastStation = '';
        for (const row of rowList) {
          const timeVal = (row.rowParts[t.colIndex] || '').trim();
          if (timeVal && /^\d{2}:\d{2}/.test(timeVal)) {
            lastStation = row.station;
          }
        }
        trainDestMap[t.trainNo] = lastStation;
      }

      // 각 역별로 열차 시간표 등록
      // 한 역에 출발/도착 행이 모두 있을 때: 출발 우선, 출발이 비어있으면 도착 사용
      const stationRowMap = {};
      for (const row of rowList) {
        if (!stationRowMap[row.station]) {
          stationRowMap[row.station] = {};
        }
        stationRowMap[row.station][row.type] = row.rowParts;
        stationLines[row.station] = stationLines[row.station] || new Set();
        stationLines[row.station].add(config.lineId);
        lineStationCounts[config.lineId].add(row.station);
      }

      for (const [stnName, types] of Object.entries(stationRowMap)) {
        const depParts = types['출발'];
        const arrParts = types['도착'];

        for (const t of trainNumbers) {
          const depTimeRaw = depParts ? (depParts[t.colIndex] || '').trim() : '';
          const arrTimeRaw = arrParts ? (arrParts[t.colIndex] || '').trim() : '';

          const rawTime = depTimeRaw || arrTimeRaw;
          if (!rawTime || !/^\d{2}:\d{2}/.test(rawTime)) continue;

          // HH:mm 포맷
          const timeHHMM = rawTime.substring(0, 5);
          const dest = trainDestMap[t.trainNo] || '';

          addEntry(stnName, key, {
            no: t.trainNo,
            t: timeHHMM,
            d: dest,
            e: 0,
          });
        }
      }
    }

    console.log(`  ✓ 대구 ${config.lineId}호선 ${config.direction} 완료 (${trainNumbers.length}개 열차)`);
  }

  // 2. 대경선 XLSX 처리
  const daegyeongPath = path.join(dataDir, '대구교통공사_대경선 열차시각표_20260901.xlsx');
  if (fs.existsSync(daegyeongPath)) {
    const wb = xlsx.readFile(daegyeongPath);
    const sheetMap = [
      { sheet: '평일_상', direction: 'UP', dayTypes: ['WEEKDAY'] },
      { sheet: '평일_하', direction: 'DOWN', dayTypes: ['WEEKDAY'] },
      { sheet: '휴일_상', direction: 'UP', dayTypes: ['SATURDAY', 'HOLIDAY'] },
      { sheet: '휴일_하', direction: 'DOWN', dayTypes: ['SATURDAY', 'HOLIDAY'] },
    ];

    for (const mapping of sheetMap) {
      const ws = wb.Sheets[mapping.sheet];
      if (!ws) continue;
      const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

      const startStations = (data[1] || []).slice(1);
      const endStations = (data[2] || []).slice(1);
      const trainNumbers = (data[3] || []).slice(1);

      // 역 목록 추출 (Row 4부터 2행 간격으로 역명)
      const stationRows = [];
      for (let r = 4; r < data.length; r += 2) {
        const row = data[r];
        if (!row) continue;
        const stnRaw = row[0];
        if (typeof stnRaw === 'string' && stnRaw.trim().length > 0) {
          const cleanStn = normalizeStationName(stnRaw);
          stationRows.push({
            station: cleanStn,
            arrRow: data[r],
            depRow: data[r + 1],
          });
          stationLines[cleanStn] = stationLines[cleanStn] || new Set();
          stationLines[cleanStn].add('대경선');
          lineStationCounts['대경선'].add(cleanStn);
        }
      }

      for (let colIdx = 0; colIdx < trainNumbers.length; colIdx++) {
        const trainNo = String(trainNumbers[colIdx] || '').trim();
        if (!trainNo) continue;

        const destRaw = endStations[colIdx] || '';
        const dest = normalizeStationName(destRaw);

        for (const stnInfo of stationRows) {
          const arrVal = stnInfo.arrRow ? stnInfo.arrRow[colIdx + 1] : null;
          const depVal = stnInfo.depRow ? stnInfo.depRow[colIdx + 1] : null;

          const timeVal = (depVal !== null && depVal !== undefined && typeof depVal === 'number')
            ? depVal
            : arrVal;

          const timeStr = excelTimeToHHMM(timeVal);
          if (!timeStr) continue;

          for (const dt of mapping.dayTypes) {
            const key = `대경선_${mapping.direction}_${dt}`;
            addEntry(stnInfo.station, key, {
              no: trainNo,
              t: timeStr,
              d: dest,
              e: 0,
            });
          }
        }
      }

      console.log(`  ✓ 대경선 ${mapping.sheet} 완료 (${trainNumbers.filter(Boolean).length}개 열차)`);
    }
  } else {
    console.warn(`⚠️ 대경선 파일 누락: ${daegyeongPath}`);
  }

  // 3. 각 역별 시간표 정렬 (운행 분 기준)
  let totalSchedules = 0;
  for (const stn of Object.keys(stationTimetables)) {
    for (const key of Object.keys(stationTimetables[stn])) {
      const items = stationTimetables[stn][key];
      // 중복 제거 및 시간순 정렬
      const seen = new Set();
      const uniqueItems = [];
      for (const item of items) {
        const signature = `${item.no}_${item.t}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          uniqueItems.push(item);
        }
      }
      uniqueItems.sort((a, b) => toOperationalMinutes(a.t) - toOperationalMinutes(b.t));
      stationTimetables[stn][key] = uniqueItems;
      totalSchedules += uniqueItems.length;
    }
  }

  // 4. 최종 데이터베이스 직렬화
  const stationLinesObj = {};
  for (const [stn, linesSet] of Object.entries(stationLines)) {
    stationLinesObj[stn] = Array.from(linesSet);
  }

  const database = {
    meta: {
      updatedAt: new Date().toISOString(),
      totalStations: Object.keys(stationTimetables).length,
      lines: {
        '1': lineStationCounts['1'].size,
        '2': lineStationCounts['2'].size,
        '3': lineStationCounts['3'].size,
        '대경선': lineStationCounts['대경선'].size,
      },
      stationLines: stationLinesObj,
    },
    data: stationTimetables,
  };

  const jsonStr = JSON.stringify(database);
  const gzBuf = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 });

  const jsonPath = path.join(outDir, 'daegu_subway_timetables.json');
  const gzPath = path.join(outDir, 'daegu_subway_timetables.json.gz');

  fs.writeFileSync(jsonPath, jsonStr, 'utf-8');
  fs.writeFileSync(gzPath, gzBuf);

  const jsonKb = (Buffer.byteLength(jsonStr, 'utf-8') / 1024).toFixed(1);
  const gzKb = (gzBuf.length / 1024).toFixed(1);

  console.log('\n======================================================');
  console.log('🎉 대구 도시철도 & 대경선 통합 시간표 빌드 완료!');
  console.log(`- 총 역 수: ${database.meta.totalStations}개 역`);
  console.log(`  * 1호선: ${database.meta.lines['1']}개 역 (하양 포함)`);
  console.log(`  * 2호선: ${database.meta.lines['2']}개 역`);
  console.log(`  * 3호선: ${database.meta.lines['3']}개 역`);
  console.log(`  * 대경선: ${database.meta.lines['대경선']}개 역`);
  console.log(`- 총 스케줄 엔트리: ${totalSchedules.toLocaleString()}건`);
  console.log(`- 비압축 JSON: ${jsonPath} (${jsonKb} KB)`);
  console.log(`- Gzip 압축 DB: ${gzPath} (${gzKb} KB)`);
  console.log('======================================================\n');
}

buildDaeguTimetables().catch((err) => {
  console.error('❌ 빌드 중 치명적 오류 발생:', err);
  process.exit(1);
});
