"""
김포골드라인(양촌 ~ 김포공항 10개 역) 열차시간표 스크래핑 및 컴파일 스크립트

김포골드라인 공식 웹사이트(https://gimpogoldline.com/?page_id=484)에서
10개 역의 공식 열차시각표 HTML을 수집/파싱하여
초경량 Gzip 인메모리 압축 데이터베이스(gimpo_gold_subway_timetables.json.gz)로 빌드합니다.

실행: python scripts/build-gimpo-gold-timetable.py
"""

import os
import sys
import json
import gzip
import datetime
import urllib.request
import ssl
import re
from bs4 import BeautifulSoup

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 10개 공식 역사 순서 (양촌 ~ 김포공항)
GIMPO_GOLD_STATIONS = [
    '양촌',
    '구래',
    '마산',
    '장기',
    '운양',
    '걸포북변',
    '사우',
    '풍무',
    '고촌',
    '김포공항',
]

STATION_TABS = [
    ('양촌', 'eluidb21ca061_1_0'),
    ('구래', 'eluidb21ca061_1_1'),
    ('마산', 'eluidb21ca061_1_2'),
    ('장기', 'eluidb21ca061_1_3'),
    ('운양', 'eluidb21ca061_1_4'),
    ('걸포북변', 'eluidb21ca061_1_5'),
    ('사우', 'eluidb21ca061_1_6'),
    ('풍무', 'eluidb21ca061_1_7'),
    ('고촌', 'eluidb21ca061_1_8'),
    ('김포공항', 'eluidb21ca061_1_9'),
]

def parse_minute_token(tok: str, default_dest: str):
    """
    분 토큰을 파싱하여 (분, 종착역) 튜플을 반환합니다.
    - '(30)' -> (30, '양촌')
    - '47' -> (47, '구래' 또는 default_dest)
    """
    tok = tok.strip()
    if not tok or tok == '-':
        return None, None
    is_paren = tok.startswith('(') and tok.endswith(')')
    digits = re.sub(r'[^\d]', '', tok)
    if not digits.isdigit():
        return None, None
    m = int(digits)
    dest = '양촌' if is_paren else default_dest
    return m, dest

def op_key(it):
    """04:00 기준 영업일 순서 키"""
    hh, mm = map(int, it['t'].split(':'))
    if hh < 4:
        hh += 24
    return hh * 60 + mm

def build_gimpo_gold_timetable():
    print("=== 김포골드라인(10개 역) 공식 웹사이트 열차시간표 수집 및 빌드 시작 ===")
    ctx = ssl._create_unverified_context()
    station_db = {stn: {} for stn, _ in STATION_TABS}

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    url = 'https://gimpogoldline.com/?page_id=484'
    print(f"시간표 페이지 요청 중: {url}")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        html = resp.read().decode('utf-8')

    soup = BeautifulSoup(html, 'html.parser')

    for stn_name, tab_id in STATION_TABS:
        tab_el = soup.find(id=tab_id)
        if not tab_el:
            print(f"  경고: {stn_name} #{tab_id} 요소를 찾을 수 없습니다.")
            continue

        tables = tab_el.find_all('table')
        if not tables:
            print(f"  경고: {stn_name} 테이블 없음")
            continue

        # 양촌: Table 0만 있음 (상행 김포공항 방면)
        # 김포공항: Table 0만 있음 (하행 구래/양촌 방면)
        # 중간역(구래~고촌): Table 0 = 상행(김포공항 방면), Table 1 = 하행(구래/양촌 방면)
        if stn_name == '양촌':
            table_configs = [(tables[0], 'UP', '김포공항')]
        elif stn_name == '김포공항':
            table_configs = [(tables[0], 'DOWN', '구래')] # default_dest: 구래, 괄호는 양촌
        else:
            table_configs = [
                (tables[0], 'UP', '김포공항'),
                (tables[1], 'DOWN', '구래'),
            ]

        for table, direction, default_dest in table_configs:
            rows = table.find_all('tr')

            for week_idx, week_tag in [(0, 'DAY'), (2, 'END')]:
                gkey = f"김포골드라인_{week_tag}_{direction}"
                items = []

                for r in rows[1:]:
                    cells = [c.get_text(strip=True) for c in r.find_all(['th', 'td'])]
                    if len(cells) < 3:
                        continue
                    h_text = cells[1]
                    if not h_text.isdigit():
                        continue
                    hour = int(h_text)
                    norm_h = 0 if hour == 24 else hour

                    m_cell = cells[week_idx]
                    tokens = m_cell.split()
                    for tok in tokens:
                        minute, dest = parse_minute_token(tok, default_dest)
                        if minute is not None:
                            time_str = f"{norm_h:02d}:{minute:02d}"
                            items.append({
                                't': time_str,
                                'd': dest
                            })

                # 04:00 기준 시간순 정렬 및 중복 제거
                unique_items = []
                seen = set()
                for it in sorted(items, key=op_key):
                    k = (it['t'], it['d'])
                    if k not in seen:
                        seen.add(k)
                        unique_items.append(it)

                # 열차 번호 채번 (상행 G1xxx, 하행 G2xxx)
                prefix = 'G1' if direction == 'UP' else 'G2'
                for idx, it in enumerate(unique_items):
                    it['no'] = f"{prefix}{idx+1:03d}"

                station_db[stn_name][gkey] = unique_items

        print(f"[{stn_name:6s}] 파싱 완료")

    # 주말(END) 데이터를 토요일(SAT)에도 복사
    for stn in GIMPO_GOLD_STATIONS:
        station_db[stn]['김포골드라인_SAT_UP'] = station_db[stn].get('김포골드라인_END_UP', [])[:]
        station_db[stn]['김포골드라인_SAT_DOWN'] = station_db[stn].get('김포골드라인_END_DOWN', [])[:]

    total_entries = sum(len(station_db[stn][k]) for stn in station_db for k in station_db[stn])

    final_payload = {
        'meta': {
            'line': '김포골드라인',
            'subwayId': '1096',
            'totalStations': len(GIMPO_GOLD_STATIONS),
            'totalTimetableEntries': total_entries,
            'stations': GIMPO_GOLD_STATIONS,
            'updatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': '김포골드라인 공식 열차시간표 (gimpogoldline.com/?page_id=484)',
        },
        'data': station_db
    }

    out_dir = os.path.join(os.getcwd(), 'src', 'data', 'subway', 'timetables')
    os.makedirs(out_dir, exist_ok=True)
    out_gz = os.path.join(out_dir, 'gimpo_gold_subway_timetables.json.gz')

    json_bytes = json.dumps(final_payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(out_gz, 'wb', compresslevel=9) as f:
        f.write(json_bytes)

    gz_size = os.path.getsize(out_gz)
    print(f"\n빌드 성공!")
    print(f"- 대상 파일: {out_gz}")
    print(f"- 압축 크기: {gz_size / 1024:.1f} KB")
    print(f"- 총 역사 수: {len(GIMPO_GOLD_STATIONS)}개")
    print(f"- 총 시각표 레코드 수: {total_entries:,}건")

if __name__ == '__main__':
    build_gimpo_gold_timetable()
