"""
신림선(샛강 ~ 관악산 11개 역) 열차시간표 스크래핑 및 컴파일 스크립트

신림선 공식 운영사 웹사이트(https://www.sillimlrt.com/kr/html/sub01/01010201.html ~ 01010211.html)에서
11개 역의 공식 열차시각표 HTML을 수집/파싱하여
초경량 Gzip 인메모리 압축 데이터베이스(sillim_subway_timetables.json.gz)로 빌드합니다.

실행: python scripts/build-sillim-timetable.py
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

# 11개 공식 역사 순서 (샛강 ~ 관악산)
SILLIM_STATIONS = [
    '샛강',
    '대방',
    '서울지방병무청',
    '보라매',
    '보라매공원',
    '보라매병원',
    '당곡',
    '신림',
    '서원',
    '서울대벤처타운',
    '관악산',
]

STATION_CODE_MAP = {
    1: '샛강',
    2: '대방',
    3: '서울지방병무청',
    4: '보라매',
    5: '보라매공원',
    6: '보라매병원',
    7: '당곡',
    8: '신림',
    9: '서원',
    10: '서울대벤처타운',
    11: '관악산',
}

def op_key(it):
    """04:00 기준 영업일 순서 키"""
    hh, mm = map(int, it['t'].split(':'))
    if hh < 4:
        hh += 24
    return hh * 60 + mm

def build_sillim_timetable():
    print("=== 신림선(11개 역) 공식 웹사이트 열차시간표 수집 및 빌드 시작 ===")
    ctx = ssl._create_unverified_context()
    station_db = {stn: {} for stn in SILLIM_STATIONS}

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    for code in range(1, 12):
        stn_name = STATION_CODE_MAP[code]
        sub_code = f"010102{code:02d}"
        url = f"https://www.sillimlrt.com/kr/html/sub01/{sub_code}.html"
        print(f"[{code:02d}/11] {stn_name:10s} ({url}) 수집 중...")

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            html = resp.read().decode('utf-8')

        soup = BeautifulSoup(html, 'html.parser')

        for tab_id, week_tag in [('tab1', 'DAY'), ('tab2', 'END')]:
            tab = soup.find('div', id=tab_id)
            if not tab:
                print(f"  경고: {stn_name} {tab_id} 없음")
                continue

            tables = tab.find_all('table')
            if len(tables) < 3:
                print(f"  경고: {stn_name} {tab_id} 테이블 부족 ({len(tables)}개)")
                continue

            # table 1: 하행선 (관악산방면)
            # table 2: 상행선 (샛강방면)
            for t_idx, dir_name, dest_name in [(1, 'DOWN', '관악산'), (2, 'UP', '샛강')]:
                t = tables[t_idx]
                gkey = f"신림선_{week_tag}_{dir_name}"
                items = []

                for tr in t.find_all('tr'):
                    tds = tr.find_all(['th', 'td'])
                    if len(tds) >= 2:
                        h_text = tds[0].get_text(strip=True)
                        m_text = tds[1].get_text(strip=True)
                        if h_text.isdigit():
                            hour = int(h_text)
                            # 쉼표나 기타 문자가 섞인 분 목록에서 숫자만 정규식으로 추출
                            tokens = re.findall(r'\d+', m_text)
                            for m_str in tokens:
                                m = int(m_str)
                                norm_h = 0 if hour == 24 else hour
                                time_str = f"{norm_h:02d}:{m:02d}"
                                items.append({
                                    't': time_str,
                                    'd': dest_name
                                })

                # 04:00 기준 시간순 정렬 및 중복 시각 제거
                unique_items = []
                seen = set()
                for it in sorted(items, key=op_key):
                    if it['t'] not in seen:
                        seen.add(it['t'])
                        unique_items.append(it)

                # 열차 번호 채번 (상행 S1xxx, 하행 S2xxx)
                prefix = 'S1' if dir_name == 'UP' else 'S2'
                for idx, it in enumerate(unique_items):
                    it['no'] = f"{prefix}{idx+1:03d}"

                station_db[stn_name][gkey] = unique_items

    # 주말(END) 데이터를 토요일(SAT)에도 복사
    for stn in SILLIM_STATIONS:
        station_db[stn]['신림선_SAT_UP'] = station_db[stn].get('신림선_END_UP', [])[:]
        station_db[stn]['신림선_SAT_DOWN'] = station_db[stn].get('신림선_END_DOWN', [])[:]

    total_entries = sum(len(station_db[stn][k]) for stn in station_db for k in station_db[stn])

    final_payload = {
        'meta': {
            'line': '신림선',
            'subwayId': '1095',
            'totalStations': len(SILLIM_STATIONS),
            'totalTimetableEntries': total_entries,
            'stations': SILLIM_STATIONS,
            'updatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': '신림선 공식 운영사 열차시간표 (sillimlrt.com)',
        },
        'data': station_db
    }

    out_dir = os.path.join(os.getcwd(), 'src', 'data', 'subway', 'timetables')
    os.makedirs(out_dir, exist_ok=True)
    out_gz = os.path.join(out_dir, 'sillim_subway_timetables.json.gz')

    json_bytes = json.dumps(final_payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(out_gz, 'wb', compresslevel=9) as f:
        f.write(json_bytes)

    gz_size = os.path.getsize(out_gz)
    print(f"\n빌드 성공!")
    print(f"- 대상 파일: {out_gz}")
    print(f"- 압축 크기: {gz_size / 1024:.1f} KB")
    print(f"- 총 역사 수: {len(SILLIM_STATIONS)}개")
    print(f"- 총 시각표 레코드 수: {total_entries:,}건")

if __name__ == '__main__':
    build_sillim_timetable()
