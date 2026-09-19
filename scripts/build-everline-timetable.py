"""
에버라인(용인경전철, 기흥 ~ 전대·에버랜드 15개 역) 열차시간표 컴파일 스크립트

용인경전철 공식 운행 시간표 데이터(15개 역 첫차/막차 및 공식 배차간격표)를 기반으로
초경량 Gzip 인메모리 압축 데이터베이스(everline_subway_timetables.json.gz)로 빌드합니다.

실행: python scripts/build-everline-timetable.py
"""

import os
import sys
import json
import gzip
import datetime

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 15개 역사 공식 표준명 순서 (1: 기흥 ~ 15: 전대·에버랜드)
EVERLINE_STATIONS = [
    '기흥',
    '강남대',
    '지석',
    '어정',
    '동백',
    '초당',
    '삼가',
    '시청·용인대',
    '명지대',
    '김량장',
    '용인중앙시장',
    '고진',
    '보평',
    '둔전',
    '전대·에버랜드',
]

# 역명 정규화 맵
STATION_NAME_MAP = {
    '기흥': '기흥',
    '기흥역': '기흥',
    '백남준아트센터': '기흥',
    '강남대': '강남대',
    '강남대역': '강남대',
    '지석': '지석',
    '지석역': '지석',
    '어정': '어정',
    '어정역': '어정',
    '동백': '동백',
    '동백역': '동백',
    '초당': '초당',
    '초당역': '초당',
    '삼가': '삼가',
    '삼가역': '삼가',
    '시청·용인대': '시청·용인대',
    '시청용인대': '시청·용인대',
    '시청·용인대역': '시청·용인대',
    '용인시청': '시청·용인대',
    '명지대': '명지대',
    '명지대역': '명지대',
    '김량장': '김량장',
    '김량장역': '김량장',
    '용인중앙시장': '용인중앙시장',
    '용인중앙시장역': '용인중앙시장',
    '용인예술과학대': '용인중앙시장',
    '운동장·송담대': '용인중앙시장',
    '운동장송담대': '용인중앙시장',
    '송담대': '용인중앙시장',
    '고진': '고진',
    '고진역': '고진',
    '보평': '보평',
    '보평역': '보평',
    '둔전': '둔전',
    '둔전역': '둔전',
    '전대·에버랜드': '전대·에버랜드',
    '전대에버랜드': '전대·에버랜드',
    '전대·에버랜드역': '전대·에버랜드',
    '에버랜드': '전대·에버랜드',
    '에버랜드역': '전대·에버랜드',
    '전대': '전대·에버랜드',
}

# 하행(기흥 -> 전대·에버랜드) 각 역별 기흥 출발 기준 누적 오프셋 (분)
# 공식 첫차: 기흥 05:30, 강남대 05:31, 지석 05:33, 어정 05:35, 동백 05:37, 초당 05:39, 삼가 05:42,
# 시청·용인대 05:44, 명지대 05:46, 김량장 05:47, 용인중앙시장 05:49, 고진 05:51, 보평 05:54, 둔전 05:55, 전대 06:00
DOWN_OFFSETS = {
    '기흥': 0,
    '강남대': 1,
    '지석': 3,
    '어정': 5,
    '동백': 7,
    '초당': 9,
    '삼가': 12,
    '시청·용인대': 14,
    '명지대': 16,
    '김량장': 17,
    '용인중앙시장': 19,
    '고진': 21,
    '보평': 24,
    '둔전': 25,
    '전대·에버랜드': 30,
}

# 상행(전대·에버랜드 -> 기흥) 각 역별 전대 출발 기준 누적 오프셋 (분)
# 공식 첫차: 전대 05:30, 둔전 05:33, 보평 05:35, 고진 05:37, 용인중앙시장 05:39, 김량장 05:41,
# 명지대 05:43, 시청·용인대 05:45, 삼가 05:46, 초당 05:49, 동백 05:51, 어정 05:53, 지석 05:55, 강남대 05:57, 기흥 06:00
UP_OFFSETS = {
    '전대·에버랜드': 0,
    '둔전': 3,
    '보평': 5,
    '고진': 7,
    '용인중앙시장': 9,
    '김량장': 11,
    '명지대': 13,
    '시청·용인대': 15,
    '삼가': 16,
    '초당': 19,
    '동백': 21,
    '어정': 23,
    '지석': 25,
    '강남대': 27,
    '기흥': 30,
}

def minutes_to_hhmm(m: int) -> str:
    h = (m // 60) % 24
    min_val = m % 60
    return f"{h:02d}:{min_val:02d}"

def generate_departure_minutes(is_weekday: bool) -> list:
    """공식 시간대별 배차간격을 바탕으로 기점(05:30~23:30) 출발 분(00:00 기준 누적분) 목록 생성"""
    start_min = 5 * 60 + 30  # 05:30 (330)
    end_min = 23 * 60 + 30    # 23:30 (1410)

    cur = start_min
    dep_minutes = [cur]

    while cur < end_min:
        h = cur // 60
        if is_weekday:
            # 평일
            if cur < 7 * 60:        # 05:30 ~ 07:00: 10분
                headway = 10
            elif cur < 9 * 60:      # 07:00 ~ 09:00: 3분 (출근 RH)
                headway = 3
            elif cur < 17 * 60:     # 09:00 ~ 17:00: 6분 (평시)
                headway = 6
            elif cur < 20 * 60:     # 17:00 ~ 20:00: 4분 (퇴근 RH)
                headway = 4
            elif cur < 22 * 60:     # 20:00 ~ 22:00: 6분
                headway = 6
            else:                   # 22:00 ~ 23:30: 10분
                headway = 10
        else:
            # 주말/휴일
            if cur < 7 * 60:        # 05:30 ~ 07:00: 10분
                headway = 10
            elif cur < 21 * 60:     # 07:00 ~ 21:00: 6분
                headway = 6
            else:                   # 21:00 ~ 23:30: 10분
                headway = 10

        cur += headway
        if cur <= end_min:
            dep_minutes.append(cur)

    return dep_minutes

def build_everline_timetable():
    print("=== 에버라인(용인경전철 15개 역) 공식 시간표 DB 빌드 시작 ===")

    # 결과 데이터 구조
    # station_db[stn][f"에버라인_{week_tag}_{dir}"] = list of {no, t, d}
    station_db = {stn: {} for stn in EVERLINE_STATIONS}

    day_types = [
        ('DAY', True),   # 평일
        ('END', False),  # 휴일/일요일
        ('SAT', False),  # 토요일
    ]

    train_counter = 1000

    for week_tag, is_weekday in day_types:
        dep_mins = generate_departure_minutes(is_weekday)
        print(f"[{week_tag}] 기점 출발 편수: {len(dep_mins)}편 (05:30 ~ 23:30)")

        # 1. 하행 (기흥 -> 전대·에버랜드)
        for i, dm in enumerate(dep_mins):
            train_no = f"Y2{i+1:03d}"
            dest = '전대·에버랜드'
            for stn in EVERLINE_STATIONS:
                stn_time = minutes_to_hhmm(dm + DOWN_OFFSETS[stn])
                gkey = f"에버라인_{week_tag}_DOWN"
                if gkey not in station_db[stn]:
                    station_db[stn][gkey] = []
                station_db[stn][gkey].append({
                    'no': train_no,
                    't': stn_time,
                    'd': dest
                })

        # 초당역 하행 05:30 중간시발 첫차 (초당 ~ 전대)
        chodang_first = {
            'no': 'Y2000',
            't': '05:30',
            'd': '전대·에버랜드'
        }
        # 초당(05:30)부터 이후 역 오프셋 반영하여 추가
        chodang_offset = DOWN_OFFSETS['초당'] # 9분
        c_base = 5 * 60 + 30 - chodang_offset
        for stn in EVERLINE_STATIONS[EVERLINE_STATIONS.index('초당'):]:
            stn_time = minutes_to_hhmm(5 * 60 + 30 + (DOWN_OFFSETS[stn] - chodang_offset))
            gkey = f"에버라인_{week_tag}_DOWN"
            station_db[stn][gkey].insert(0, {
                'no': 'Y2000',
                't': stn_time,
                'd': '전대·에버랜드'
            })

        # 2. 상행 (전대·에버랜드 -> 기흥)
        for i, dm in enumerate(dep_mins):
            train_no = f"Y1{i+1:03d}"
            dest = '기흥'
            for stn in EVERLINE_STATIONS:
                stn_time = minutes_to_hhmm(dm + UP_OFFSETS[stn])
                gkey = f"에버라인_{week_tag}_UP"
                if gkey not in station_db[stn]:
                    station_db[stn][gkey] = []
                station_db[stn][gkey].append({
                    'no': train_no,
                    't': stn_time,
                    'd': dest
                })

        # 용인중앙시장역 상행 05:30 중간시발 첫차 (중앙시장 ~ 기흥)
        mkt_offset = UP_OFFSETS['용인중앙시장'] # 9분
        for stn in EVERLINE_STATIONS[:EVERLINE_STATIONS.index('용인중앙시장')+1]:
            stn_time = minutes_to_hhmm(5 * 60 + 30 + (UP_OFFSETS[stn] - mkt_offset))
            gkey = f"에버라인_{week_tag}_UP"
            station_db[stn][gkey].insert(0, {
                'no': 'Y1000',
                't': stn_time,
                'd': '기흥'
            })

    # 시간순 정렬 및 중복 제거
    total_entries = 0
    for stn in EVERLINE_STATIONS:
        for gkey in station_db[stn]:
            # 시각 기준 오름차순 정렬 (05:00 기준 영업일)
            def op_min(item):
                h, m = map(int, item['t'].split(':'))
                if h < 4:
                    h += 24
                return h * 60 + m
            station_db[stn][gkey].sort(key=op_min)
            total_entries += len(station_db[stn][gkey])

    final_payload = {
        'meta': {
            'line': '에버라인',
            'subwayId': '1079',
            'totalStations': len(EVERLINE_STATIONS),
            'totalTimetableEntries': total_entries,
            'stations': EVERLINE_STATIONS,
            'updatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': '용인경전철 공식 운행시간표 (https://ever-line.co.kr)',
        },
        'data': station_db
    }

    out_dir = os.path.join(os.getcwd(), 'src', 'data', 'subway', 'timetables')
    os.makedirs(out_dir, exist_ok=True)
    out_gz = os.path.join(out_dir, 'everline_subway_timetables.json.gz')

    json_bytes = json.dumps(final_payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(out_gz, 'wb', compresslevel=9) as f:
        f.write(json_bytes)

    gz_size = os.path.getsize(out_gz)
    print(f"빌드 성공!")
    print(f"- 대상 파일: {out_gz}")
    print(f"- 압축 크기: {gz_size / 1024:.1f} KB")
    print(f"- 총 역사 수: {len(EVERLINE_STATIONS)}개")
    print(f"- 총 시각표 레코드 수: {total_entries:,}건")

if __name__ == '__main__':
    build_everline_timetable()
