#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
우이신설선 공식 열차시간표 스크래퍼 및 압축 DB 빌더
출처: 우이신설선 공식 홈페이지 (https://www.ui-line.com/html/intro/intro00/intro_00_{id:02d}.php)
범위: 북한산우이(01) ~ 신설동(13) 13개 전 역사
출력: src/data/subway/timetables/ui_line_subway_timetables.json.gz
"""

import os
import sys
import re
import json
import gzip
import ssl
import urllib.request
from bs4 import BeautifulSoup

STATIONS = [
    (1, '북한산우이'),
    (2, '솔밭공원'),
    (3, '4·19민주묘지'),
    (4, '가오리'),
    (5, '화계'),
    (6, '삼양'),
    (7, '삼양사거리'),
    (8, '솔샘'),
    (9, '북한산보국문'),
    (10, '정릉'),
    (11, '성신여대입구'),
    (12, '보문'),
    (13, '신설동'),
]

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'subway', 'timetables')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'ui_line_subway_timetables.json.gz')

def fetch_station_html(stn_id: int) -> str:
    url = f'https://www.ui-line.com/html/intro/intro00/intro_00_{stn_id:02d}.php'
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='replace')

def parse_station_timetable(html: str, stn_id: int, stn_name: str) -> dict:
    soup = BeautifulSoup(html, 'html.parser')
    station_data = {}

    tab_mappings = [
        ('tab1', 'DAY'),  # 평일
        ('tab2', 'END'),  # 주말/공휴일
    ]

    for tab_id, week_tag in tab_mappings:
        tab_div = soup.find('div', id=tab_id)
        if not tab_div:
            continue

        tables = tab_div.find_all('table')
        if len(tables) < 2:
            continue

        # Table 1: 시간대별 상세 시각표
        tt_table = tables[1]
        rows = tt_table.find_all('tr')
        if len(rows) < 3:
            continue

        # Header 확인
        header_cells = [c.text.strip().replace(' ', '') for c in rows[0].find_all(['th', 'td'])]
        down_col = -1 # 북한산우이 방향 (하선, drctType '2')
        hour_col = -1
        up_col = -1   # 신설동 방향 (상선, drctType '1')

        for idx, h in enumerate(header_cells):
            if '하선' in h or '북한산우이' in h:
                down_col = idx
            elif '시각' in h or '시간' in h:
                hour_col = idx
            elif '상선' in h or '신설동' in h:
                up_col = idx

        if hour_col == -1 and len(rows) > 1:
            header_cells_1 = [c.text.strip().replace(' ', '') for c in rows[1].find_all(['th', 'td'])]
            for idx, h in enumerate(header_cells_1):
                if '시각' in h or '시간' in h:
                    hour_col = idx

        up_trains = []
        down_trains = []

        for row in rows[2:]:
            cells = [c.text.strip() for c in row.find_all(['th', 'td'])]
            if len(cells) < 2:
                continue

            hour_txt = cells[hour_col] if hour_col != -1 and hour_col < len(cells) else ''
            h_match = re.search(r'(\d+)', hour_txt)
            if not h_match:
                continue
            hour = int(h_match.group(1))

            # 하선 열차 (북한산우이행)
            if down_col != -1 and down_col < len(cells):
                down_txt = cells[down_col]
                minutes = re.findall(r'\b\d{2}\b', down_txt)
                for m in minutes:
                    hh = hour if hour < 24 else hour - 24
                    t_str = f'{hh:02d}:{int(m):02d}'
                    down_trains.append(t_str)

            # 상선 열차 (신설동행)
            if up_col != -1 and up_col < len(cells):
                up_txt = cells[up_col]
                minutes = re.findall(r'\b\d{2}\b', up_txt)
                for m in minutes:
                    hh = hour if hour < 24 else hour - 24
                    t_str = f'{hh:02d}:{int(m):02d}'
                    up_trains.append(t_str)

        # 시간순 정렬 (04:00 기준 당일 운행 순환)
        def sort_key(t):
            h, m = map(int, t.split(':'))
            return (h if h >= 4 else h + 24) * 60 + m

        up_trains.sort(key=sort_key)
        down_trains.sort(key=sort_key)

        # 열차 번호 및 객체 생성
        up_entries = []
        for i, t in enumerate(up_trains, 1):
            up_entries.append({
                't': t,
                'd': '신설동',
                'no': f'U1{i:03d}'
            })

        down_entries = []
        for i, t in enumerate(down_trains, 1):
            down_entries.append({
                't': t,
                'd': '북한산우이',
                'no': f'U2{i:03d}'
            })

        up_key = f'우이신설선_{week_tag}_UP'
        down_key = f'우이신설선_{week_tag}_DOWN'

        if stn_id != 13: # 신설동은 상행 없음
            station_data[up_key] = up_entries
        if stn_id != 1:  # 북한산우이는 하행 없음
            station_data[down_key] = down_entries

        # 토요일(SAT) 키는 END와 동일하게 복제
        if week_tag == 'END':
            sat_up_key = '우이신설선_SAT_UP'
            sat_down_key = '우이신설선_SAT_DOWN'
            if stn_id != 13:
                station_data[sat_up_key] = up_entries
            if stn_id != 1:
                station_data[sat_down_key] = down_entries

    return station_data

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print('=== 우이신설선 공식 열차시간표 스크래퍼 시작 ===')

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_data = {}
    total_records = 0

    for stn_id, stn_name in STATIONS:
        print(f'[{stn_id:02d}/13] {stn_name} 파싱 중...')
        html = fetch_station_html(stn_id)
        stn_dict = parse_station_timetable(html, stn_id, stn_name)
        all_data[stn_name] = stn_dict

        stn_total = sum(len(v) for v in stn_dict.values())
        total_records += stn_total
        print(f'  ✓ {stn_name}: 총 {stn_total}건 운행편 수록 (그룹: {list(stn_dict.keys())})')

    db = {
        'meta': {
            'line': '우이신설선',
            'subwayId': '1092',
            'totalStations': len(all_data),
            'totalRecords': total_records,
            'source': '우이신설선 공식 홈페이지 (ui-line.com)',
            'updatedAt': '2026-09-19',
        },
        'data': all_data,
    }

    raw_json = json.dumps(db, ensure_ascii=False, indent=None)
    with gzip.open(OUTPUT_FILE, 'wt', encoding='utf-8') as f:
        f.write(raw_json)

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f'\n=== 빌드 완료 ===')
    print(f'출력 파일: {OUTPUT_FILE}')
    print(f'압축 크기: {size_kb:.1f} KB')
    print(f'수록 역사: {len(all_data)}개 역, 총 {total_records}건 운행 시각')

if __name__ == '__main__':
    main()
