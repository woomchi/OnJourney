"""
신분당선(신사 ~ 광교 16개 역) 공식 열차시간표 컴파일 스크립트

신분당선 공식 역별 PDF 시각표(data/역별 열차시각표_평일.pdf, data/역별 열차시각표_공휴일.pdf)를 파싱하여
초경량 Gzip 인메모리 압축 데이터베이스(shinbundang_subway_timetables.json.gz)로 빌드합니다.

실행: python scripts/build-shinbundang-timetable.py
"""

import os
import sys
import json
import gzip
import datetime
import re
import pypdf

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 16개 공식 표준 역사 순서 (신사 ~ 광교) - PDF 1~16페이지와 1:1 일치
SHINBUNDANG_STATIONS = [
    '신사',
    '논현',
    '신논현',
    '강남',
    '양재',
    '양재시민의숲',
    '청계산입구',
    '판교',
    '정자',
    '미금',
    '동천',
    '수지구청',
    '성복',
    '상현',
    '광교중앙',
    '광교',
]

def clean_minute_token(tok: str):
    """
    분 토큰과 종착역 태그 파싱
    예: '54(정자)' -> (54, '정자')
    예: '30' -> (30, None)
    """
    m = re.match(r'^(\d{1,2})(?:\((.*?)\))?$', tok.strip())
    if m:
        minute = int(m.group(1))
        dest = m.group(2) if m.group(2) else None
        return minute, dest
    return None, None

def split_intermediate_line(tokens: list):
    """
    중간역(논현~광교중앙) 행 토큰 분할:
    왼쪽: 상행(신사방면) 분 목록, 가운데: 시(hour), 오른쪽: 하행(광교방면) 분 목록
    """
    best_split = None
    for i in range(1, len(tokens) - 1):
        clean_tok = re.sub(r'\(.*?\)', '', tokens[i])
        if clean_tok.isdigit() and len(clean_tok) == 2:
            h = int(clean_tok)
            if (5 <= h <= 24) or h == 0:
                left = tokens[:i]
                right = tokens[i+1:]
                if left and right:
                    last_l_min, _ = clean_minute_token(left[-1])
                    first_r_min, _ = clean_minute_token(right[0])
                    if last_l_min is not None and first_r_min is not None:
                        if last_l_min > first_r_min:
                            return h, left, right
                        if best_split is None:
                            best_split = (h, left, right)

    if best_split:
        return best_split

    # 폴백
    for i in range(1, len(tokens) - 1):
        clean_tok = re.sub(r'\(.*?\)', '', tokens[i])
        if clean_tok.isdigit() and len(clean_tok) == 2:
            h = int(clean_tok)
            if (5 <= h <= 24) or h == 0:
                return h, tokens[:i], tokens[i+1:]

    return None

def parse_pdf_file(pdf_path: str, week_tag: str, station_db: dict):
    print(f"[{week_tag}] PDF 파싱 시작: {pdf_path}")
    reader = pypdf.PdfReader(pdf_path)

    for p_idx in range(len(SHINBUNDANG_STATIONS)):
        stn_name = SHINBUNDANG_STATIONS[p_idx]
        page = reader.pages[p_idx]
        text = page.extract_text()
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        is_start = (stn_name == '신사')
        is_end = (stn_name == '광교')

        up_key = f"신분당선_{week_tag}_UP"
        down_key = f"신분당선_{week_tag}_DOWN"

        if up_key not in station_db[stn_name]:
            station_db[stn_name][up_key] = []
        if down_key not in station_db[stn_name]:
            station_db[stn_name][down_key] = []

        up_items = []
        down_items = []

        for l in lines:
            if any(kw in l for kw in ['열차시각표', '기본계획', '적용기간', '방면', 'Page', 'No', '출력일시']):
                continue

            tokens = l.split()
            if not tokens:
                continue

            if is_start: # 신사 (하행 광교/정자방면만 있음)
                # 시(hour) 토큰 찾기 (맨 앞 또는 맨 뒤)
                h = None
                minute_tokens = []
                first_tok = re.sub(r'\(.*?\)', '', tokens[0])
                last_tok = re.sub(r'\(.*?\)', '', tokens[-1])

                if first_tok.isdigit() and ((5 <= int(first_tok) <= 24) or int(first_tok) == 0) and len(first_tok) == 2:
                    h = int(first_tok)
                    minute_tokens = tokens[1:]
                elif last_tok.isdigit() and ((5 <= int(last_tok) <= 24) or int(last_tok) == 0) and len(last_tok) == 2:
                    h = int(last_tok)
                    minute_tokens = tokens[:-1]

                if h is not None:
                    for tok in minute_tokens:
                        m, dest = clean_minute_token(tok)
                        if m is not None:
                            time_str = f"{h:02d}:{m:02d}"
                            down_items.append({
                                't': time_str,
                                'd': dest if dest else '광교'
                            })

            elif is_end: # 광교 (상행 신사방면만 있음)
                # 시(hour) 토큰 찾기 (맨 앞 또는 맨 뒤)
                h = None
                minute_tokens = []
                first_tok = re.sub(r'\(.*?\)', '', tokens[0])
                last_tok = re.sub(r'\(.*?\)', '', tokens[-1])

                if last_tok.isdigit() and ((5 <= int(last_tok) <= 24) or int(last_tok) == 0) and len(last_tok) == 2:
                    h = int(last_tok)
                    minute_tokens = tokens[:-1]
                elif first_tok.isdigit() and ((5 <= int(first_tok) <= 24) or int(first_tok) == 0) and len(first_tok) == 2:
                    h = int(first_tok)
                    minute_tokens = tokens[1:]

                if h is not None:
                    for tok in minute_tokens:
                        m, dest = clean_minute_token(tok)
                        if m is not None:
                            time_str = f"{h:02d}:{m:02d}"
                            up_items.append({
                                't': time_str,
                                'd': dest if dest else '신사'
                            })

            else: # 중간역 (논현 ~ 광교중앙)
                split_res = split_intermediate_line(tokens)
                if split_res:
                    h, left_tokens, right_tokens = split_res
                    # left_tokens: 상행(신사행)
                    for tok in left_tokens:
                        m, dest = clean_minute_token(tok)
                        if m is not None:
                            time_str = f"{h:02d}:{m:02d}"
                            up_items.append({
                                't': time_str,
                                'd': dest if dest else '신사'
                            })
                    # right_tokens: 하행(광교/정자행)
                    for tok in right_tokens:
                        m, dest = clean_minute_token(tok)
                        if m is not None:
                            time_str = f"{h:02d}:{m:02d}"
                            down_items.append({
                                't': time_str,
                                'd': dest if dest else '광교'
                            })

        # 영업일 기준 시간순 정렬 (04:00 기준)
        def op_key(it):
            hh, mm = map(int, it['t'].split(':'))
            if hh < 4:
                hh += 24
            return hh * 60 + mm

        # 중복 시각 제거 후 정렬
        def dedupe_and_sort(items):
            seen = set()
            unique = []
            for it in sorted(items, key=op_key):
                k = (it['t'], it['d'])
                if k not in seen:
                    seen.add(k)
                    unique.append(it)
            return unique

        up_items = dedupe_and_sort(up_items)
        down_items = dedupe_and_sort(down_items)

        # 열차 번호 채번 (상행: D1xxx, 하행: D2xxx)
        for i, it in enumerate(up_items):
            it['no'] = f"D1{i+1:03d}"
        for i, it in enumerate(down_items):
            it['no'] = f"D2{i+1:03d}"

        station_db[stn_name][up_key] = up_items
        station_db[stn_name][down_key] = down_items

        print(f"  {stn_name:8s} (P{p_idx+1:02d}): UP={len(up_items)}편, DOWN={len(down_items)}편")

def build_shinbundang_timetable():
    data_dir = os.path.join(os.getcwd(), 'data')
    weekday_pdf = os.path.join(data_dir, '역별 열차시각표_평일.pdf')
    holiday_pdf = os.path.join(data_dir, '역별 열차시각표_공휴일.pdf')

    if not os.path.exists(weekday_pdf) or not os.path.exists(holiday_pdf):
        print("오류: 신분당선 PDF 파일이 없습니다.")
        sys.exit(1)

    print("=== 신분당선(16개 역) 열차시간표 DB 빌드 시작 ===")
    station_db = {stn: {} for stn in SHINBUNDANG_STATIONS}

    # 1. 평일 파싱
    parse_pdf_file(weekday_pdf, 'DAY', station_db)

    # 2. 공휴일 파싱 -> END 및 SAT 공통 적용
    parse_pdf_file(holiday_pdf, 'END', station_db)

    # SAT 복사
    for stn in SHINBUNDANG_STATIONS:
        station_db[stn]['신분당선_SAT_UP'] = station_db[stn]['신분당선_END_UP']
        station_db[stn]['신분당선_SAT_DOWN'] = station_db[stn]['신분당선_END_DOWN']

    # 총 레코드 수 집계
    total_entries = sum(len(station_db[stn][k]) for stn in station_db for k in station_db[stn])

    final_payload = {
        'meta': {
            'line': '신분당선',
            'subwayId': '1077',
            'totalStations': len(SHINBUNDANG_STATIONS),
            'totalTimetableEntries': total_entries,
            'stations': SHINBUNDANG_STATIONS,
            'updatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': '네오트랜스 신분당선 공식 역별 열차시각표 (SBL4017R2, SBL4019)',
        },
        'data': station_db
    }

    out_dir = os.path.join(os.getcwd(), 'src', 'data', 'subway', 'timetables')
    os.makedirs(out_dir, exist_ok=True)
    out_gz = os.path.join(out_dir, 'shinbundang_subway_timetables.json.gz')

    json_bytes = json.dumps(final_payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(out_gz, 'wb', compresslevel=9) as f:
        f.write(json_bytes)

    gz_size = os.path.getsize(out_gz)
    print(f"\n빌드 성공!")
    print(f"- 대상 파일: {out_gz}")
    print(f"- 압축 크기: {gz_size / 1024:.1f} KB")
    print(f"- 총 역사 수: {len(SHINBUNDANG_STATIONS)}개")
    print(f"- 총 시각표 레코드 수: {total_entries:,}건")

if __name__ == '__main__':
    build_shinbundang_timetable()
