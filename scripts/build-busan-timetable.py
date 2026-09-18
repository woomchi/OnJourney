import csv
import json
import gzip
import os
import re
import sys

def to_operational_minutes(time_str: str) -> int:
    if not time_str:
        return 0
    parts = time_str.split(':')
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return 0
    # 새벽 00~04시는 익일 연장 운행(24시 이후)으로 간주
    adjusted_hour = hour + 24 if hour < 5 else hour
    return adjusted_hour * 60 + minute

def get_line_num(line_name: str, line_code: str) -> str:
    if '1호선' in line_name or line_code == 'S2601': return '1'
    if '2호선' in line_name or line_code == 'S2602': return '2'
    if '3호선' in line_name or line_code == 'S2603': return '3'
    if '4호선' in line_name or line_code == 'L2604': return '4'
    return '1'

def get_direction(line_num: str, start_stn: str, end_stn: str) -> str:
    # 1호선: 노포(134, 북쪽 기점) <-> 다대포해수욕장(95, 남쪽 종점)
    # 노포 방면: 상행 (UP), 다대포해수욕장/신평 방면: 하행 (DOWN)
    if line_num == '1':
        if end_stn in ['노포']:
            return 'UP'
        return 'DOWN'

    # 2호선: 장산(201, 동쪽 기점) <-> 양산(243, 북서쪽 종점)
    # 장산 방면(광안, 전포 포함): 상행 (UP), 양산 방면(호포, 구명 포함): 하행 (DOWN)
    elif line_num == '2':
        if end_stn in ['장산', '광안', '전포']:
            return 'UP'
        return 'DOWN'

    # 3호선: 수영(301, 동남쪽 기점) <-> 대저(317, 북서쪽 종점)
    # 수영 방면: 상행 (UP), 대저 방면: 하행 (DOWN)
    elif line_num == '3':
        if end_stn in ['수영']:
            return 'UP'
        return 'DOWN'

    # 4호선: 미남(401, 서쪽 기점) <-> 안평(414, 동북쪽 종점)
    # 미남 방면: 상행 (UP), 안평 방면: 하행 (DOWN)
    elif line_num == '4':
        if end_stn in ['미남']:
            return 'UP'
        return 'DOWN'

    return 'DOWN'

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_candidates = [
        os.path.join(base_dir, 'data', '부산교통공사_부산도시철도 운행 정보_20260722.csv'),
        os.path.join(base_dir, 'data', '부산도시철도_운행정보.csv')
    ]
    
    csv_path = None
    for candidate in csv_candidates:
        if os.path.exists(candidate):
            csv_path = candidate
            break

    if not csv_path:
        # data 디렉토리에서 '부산' 들어간 csv 검색
        data_dir = os.path.join(base_dir, 'data')
        if os.path.exists(data_dir):
            for f in os.listdir(data_dir):
                if f.endswith('.csv') and '부산' in f:
                    csv_path = os.path.join(data_dir, f)
                    break

    if not csv_path:
        print("Error: 부산 지하철 운행정보 CSV 파일을 찾을 수 없습니다.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading CSV from: {csv_path}")
    out_dir = os.path.join(base_dir, 'src', 'data', 'subway', 'timetables')
    os.makedirs(out_dir, exist_ok=True)
    gz_path = os.path.join(out_dir, 'busan_subway_timetables.json.gz')

    # EUC-KR 인코딩으로 열기 (CP949 fallback)
    try:
        with open(csv_path, 'r', encoding='euc-kr') as f:
            rows = list(csv.reader(f))
    except UnicodeDecodeError:
        with open(csv_path, 'r', encoding='cp949') as f:
            rows = list(csv.reader(f))

    if not rows or len(rows) < 2:
        print("Error: CSV 데이터가 비어있거나 올바르지 않습니다.", file=sys.stderr)
        sys.exit(1)

    header = rows[0]
    data_rows = rows[1:]

    timetable_by_station = {}
    station_lines = {}

    for r in data_rows:
        if len(r) < 10:
            continue
        train_no = r[0].strip()
        line_code = r[1].strip()
        line_name = r[2].strip()
        start_stn = r[3].strip()
        end_stn = r[4].strip()
        day_type_raw = r[6].strip()

        # 일요일은 공휴일 시각표와 동일하게 통합
        if day_type_raw == '일요일':
            day_type_raw = '공휴일'

        stations_raw = r[7].split('+')
        arr_raw = r[8].split('+')
        dep_raw = r[9].split('+')

        line_num = get_line_num(line_name, line_code)
        direction = get_direction(line_num, start_stn, end_stn)
        group_key = f"{line_num}_{day_type_raw}_{direction}"

        parsed_stations = []
        for s in stations_raw:
            s_clean = s.split('-', 1)[1] if '-' in s else s
            parsed_stations.append(s_clean.strip())

        for idx, stn in enumerate(parsed_stations):
            stn_clean = re.sub(r'역$', '', stn).strip()

            # 출발 시각 우선 추출 (없으면 도착 시각)
            t_str = ''
            if idx < len(dep_raw):
                dep_val = dep_raw[idx].split('-', 1)[1] if '-' in dep_raw[idx] else dep_raw[idx]
                if dep_val and dep_val != ':':
                    t_str = dep_val.strip()
            if not t_str and idx < len(arr_raw):
                arr_val = arr_raw[idx].split('-', 1)[1] if '-' in arr_raw[idx] else arr_raw[idx]
                if arr_val and arr_val != ':':
                    t_str = arr_val.strip()

            if not t_str or t_str == ':':
                continue

            if stn_clean not in timetable_by_station:
                timetable_by_station[stn_clean] = {}
            if stn_clean not in station_lines:
                station_lines[stn_clean] = set()
            station_lines[stn_clean].add(line_num)

            if group_key not in timetable_by_station[stn_clean]:
                timetable_by_station[stn_clean][group_key] = []

            timetable_by_station[stn_clean][group_key].append({
                'no': train_no,
                't': t_str,
                'd': end_stn,
                'e': 0 # 일반
            })

    # 운행 분(to_operational_minutes) 기준 순서 정렬
    for stn, groups in timetable_by_station.items():
        for grp, items in groups.items():
            items.sort(key=lambda x: to_operational_minutes(x['t']))

    formatted_station_lines = {k: sorted(list(v)) for k, v in station_lines.items()}

    db = {
        'meta': {
            'updatedAt': '2026-07-22',
            'totalStations': len(timetable_by_station),
            'stationLines': formatted_station_lines
        },
        'data': timetable_by_station
    }

    json_bytes = json.dumps(db, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(gz_path, 'wb') as f:
        f.write(json_bytes)

    print(f"Successfully generated: {gz_path}")
    print(f"Total Stations: {len(timetable_by_station)}")
    print(f"GZ File Size: {len(json_bytes) / 1024 / 1024:.2f} MB (compressed: {os.path.getsize(gz_path) / 1024 / 1024:.2f} MB)")

if __name__ == '__main__':
    main()
