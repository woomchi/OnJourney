"""
인천 1호선(검단호수공원 ~ 계양 ~ 송도달빛축제공원 33개 역사) 열차시간표 컴파일 스크립트

인천교통공사 공식 엑셀 시각표(data/인천1호선_열차시간표.xls)를 파싱하여
검단 연장구간이 반영된 고효율 Gzip 인메모리 압축 데이터베이스(incheon1_subway_timetables.json.gz)로 빌드합니다.

실행: python scripts/build-incheon1-timetable.py
"""

import os
import sys
import json
import gzip
import xlrd

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 공식 33개 역사 (상행 기준: 송도달빛축제공원 -> 검단호수공원)
INCHEON_1_STATIONS = [
    '송도달빛축제공원', '국제업무지구', '센트럴파크', '인천대입구', '지식정보단지',
    '테크노파크', '캠퍼스타운', '동막', '동춘', '원인재',
    '신연수', '선학', '문학경기장', '인천터미널', '예술회관',
    '인천시청', '간석오거리', '부평삼거리', '동수', '부평',
    '부평시장', '부평구청', '갈산', '작전', '경인교대입구',
    '계산', '임학', '박촌', '귤현', '계양',
    '아라', '신검단중앙', '검단호수공원'
]

def to_operational_minutes(time_str: str) -> int:
    if not time_str:
        return 0
    parts = time_str.split(':')
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    adjusted_h = h + 24 if h < 4 else h
    return adjusted_h * 60 + m

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    excel_path = os.path.join(root_dir, 'data', '인천1호선_열차시간표.xls')
    output_dir = os.path.join(root_dir, 'src', 'data', 'subway', 'timetables')
    os.makedirs(output_dir, exist_ok=True)
    gz_output_path = os.path.join(output_dir, 'incheon1_subway_timetables.json.gz')
    json_output_path = os.path.join(output_dir, 'incheon1_subway_timetables.json')

    print(f"Reading Excel: {excel_path}")
    book = xlrd.open_workbook(excel_path)

    # 역별 데이터베이스 초기화
    database = {stn: {} for stn in INCHEON_1_STATIONS}

    sheet_configs = [
        ('평일_상선', ['DAY'], 'UP'),
        ('평일_하선', ['DAY'], 'DOWN'),
        ('토휴일_상선', ['SAT', 'END'], 'UP'),
        ('토휴일_하선', ['SAT', 'END'], 'DOWN'),
    ]

    total_records = 0
    total_trains_processed = 0

    for sheet_name, day_types, direction in sheet_configs:
        try:
            sheet = book.sheet_by_name(sheet_name)
        except Exception as e:
            print(f"Error loading sheet {sheet_name}: {e}")
            continue

        headers = [str(h).strip() for h in sheet.row_values(0)]
        stn_cols = headers[1:] # 컬럼 1부터 각 역명

        train_count = 0

        for r in range(1, sheet.nrows):
            row_vals = sheet.row_values(r)
            train_no_raw = row_vals[0]
            if isinstance(train_no_raw, (int, float)):
                train_no = str(int(train_no_raw))
            else:
                train_no = str(train_no_raw).strip()

            if not train_no:
                continue

            # 해당 열차의 정차역 목록 파싱
            stops = []
            for c in range(1, len(row_vals)):
                val = str(row_vals[c]).strip()
                if val:
                    stn = stn_cols[c - 1]
                    stops.append((stn, val))

            if not stops:
                continue

            train_count += 1
            dest_stn = stops[-1][0] # 종착역

            # 종착역을 제외한 각 출발 가능 역에 시간표 추가
            for stn, dep_time in stops:
                if stn == dest_stn:
                    continue # 종착역에서는 승차 불가

                for dt in day_types:
                    group_key = f"인천1호선_{dt}_{direction}"
                    if group_key not in database[stn]:
                        database[stn][group_key] = []

                    database[stn][group_key].append({
                        'no': train_no,
                        't': dep_time,
                        'd': dest_stn,
                    })
                    total_records += 1

        print(f"[{sheet_name}] {train_count} trains processed for direction {direction}")
        total_trains_processed += train_count

    # 시간순 정렬 및 중복 제거
    for stn in database:
        for group_key in database[stn]:
            database[stn][group_key].sort(key=lambda x: to_operational_minutes(x['t']))

    meta = {
        'line': '인천1호선',
        'subwayId': '1069',
        'totalStations': len(INCHEON_1_STATIONS),
        'totalRecords': total_records,
        'totalTrains': total_trains_processed,
        'source': '인천교통공사 공식 열차시간표 (검단연장 33개 역 반영)',
        'updatedAt': '2026-09-19'
    }

    final_db = {
        'meta': meta,
        'data': database,
    }

    # JSON 저장
    with open(json_output_path, 'w', encoding='utf-8') as f:
        json.dump(final_db, f, ensure_ascii=False, indent=2)
    print(f"Saved uncompressed JSON: {json_output_path} ({os.path.getsize(json_output_path):,} bytes)")

    # Gzip 압축 저장
    json_bytes = json.dumps(final_db, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(gz_output_path, 'wb', compresslevel=9) as f:
        f.write(json_bytes)

    gz_size = os.path.getsize(gz_output_path)
    print(f"Successfully compiled compressed database: {gz_output_path} ({gz_size:,} bytes, {gz_size / 1024:.1f} KB)")
    print(f"Total stations: {len(INCHEON_1_STATIONS)}, Total records: {total_records:,}")

if __name__ == '__main__':
    main()
