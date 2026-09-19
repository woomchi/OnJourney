#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
의정부경전철 공식 열차시간표 이미지 글리프 파서 및 압축 DB 빌더
출처: 의정부경량전철주식회사 공식 홈페이지 (https://www.ulrt.co.kr/doc/contents/information/time.php)
범위: 발곡 ~ 차량기지임시승강장 16개 전 역사 (30개 고화질 시간표 이미지)
출력: src/data/subway/timetables/uijeongbu_subway_timetables.json.gz
"""

import os
import sys
import json
import gzip
import ssl
import urllib.request
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = 'https://www.ulrt.co.kr/doc/theme/uline/images/contents/timetable/'
CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'cache', 'uijeongbu_images')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'subway', 'timetables')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'uijeongbu_subway_timetables.json.gz')

STATION_MAP = [
    ('발곡', {'UP': 'balgok-1.jpg'}),
    ('회룡', {'UP': 'hoeryong-1.jpg', 'DOWN': 'hoeryong-2.jpg'}),
    ('범골', {'UP': 'beomgol-1.jpg', 'DOWN': 'beomgol-2.jpg'}),
    ('경전철의정부', {'UP': 'uijeongbu-1.jpg', 'DOWN': 'uijeongbu-2.jpg'}),
    ('의정부시청', {'UP': 'city-hall-1.jpg', 'DOWN': 'city-hall-2.jpg'}),
    ('흥선', {'UP': 'heungseon-1.jpg', 'DOWN': 'heungseon-2.jpg'}),
    ('의정부중앙', {'UP': 'jungang-1.jpg', 'DOWN': 'jungang-2.jpg'}),
    ('동오', {'UP': 'dongo-1.jpg', 'DOWN': 'dongo-2.jpg'}),
    ('새말', {'UP': 'saemal-1.jpg', 'DOWN': 'saemal-2.jpg'}),
    ('경기도청북부청사', {'UP': 'north-office-1.jpg', 'DOWN': 'north-office-2.jpg'}),
    ('효자', {'UP': 'hyoja-1.jpg', 'DOWN': 'hyoja-2.jpg'}),
    ('곤제', {'UP': 'gonje-1.jpg', 'DOWN': 'gonje-2.jpg'}),
    ('어룡', {'UP': 'eoryong-1.jpg', 'DOWN': 'eoryong-2.jpg'}),
    ('송산', {'UP': 'songsan-1.jpg', 'DOWN': 'songsan-2.jpg'}),
    ('탑석', {'UP': 'tapseok-1.jpg', 'DOWN': 'tapseok-2.jpg'}),
    ('차량기지임시승강장', {'DOWN': 'depot-2.jpg'}),
]

DIGIT_MASKS_STR = {
    0: [
        "...###..",
        "..#####.",
        ".##...##",
        ".##...##",
        ".#....##",
        "##.....#",
        "##....##",
        "##....##",
        ".#....##",
        ".##...##",
        ".######.",
        "..####..",
    ],
    1: [
        "..#.",
        ".###",
        "####",
        "..##",
        "..##",
        "..##",
        "..##",
        "..##",
        "..##",
        "..##",
        "..##",
        "..##",
    ],
    2: [
        "..###..",
        "#.####.",
        ".....##",
        ".....##",
        ".....##",
        "....##.",
        "...###.",
        "...##..",
        "...#...",
        ".##....",
        "#######",
        "#######",
    ],
    3: [
        ".####..",
        "#.#####",
        ".....##",
        ".....##",
        "....###",
        "...###.",
        "..####.",
        ".....##",
        "......#",
        ".....##",
        "##.####",
        "######.",
    ],
    4: [
        "......#..",
        ".....##..",
        "....###..",
        "...####..",
        "...#..#..",
        "..##..#..",
        ".##...#..",
        ".##..###.",
        "#########",
        ".....###.",
        "......#..",
        "......#..",
    ],
    5: [
        "#####.",
        "######",
        "##....",
        "#.....",
        "##....",
        ".####.",
        "....##",
        "....##",
        "....##",
        "....##",
        "######",
        "####..",
    ],
    6: [
        "..####.",
        ".####..",
        "###....",
        "##.....",
        "######.",
        "#######",
        "##...##",
        "##....#",
        "##....#",
        "##...##",
        "..####.",
        "..###..",
    ],
    7: [
        "######",
        ".#####",
        "....##",
        "...###",
        "...##.",
        "...##.",
        "..##..",
        "..##..",
        ".##...",
        ".##...",
        "..#...",
        "#.....",
    ],
    8: [
        ".######.",
        ".###.###",
        "###...##",
        ".##...##",
        ".######.",
        "..#####.",
        ".######.",
        "###...##",
        "##....##",
        "###...##",
        ".#######",
        "..####..",
    ],
    9: [
        "..####..",
        ".######.",
        "##...##.",
        "##....#.",
        "##....#.",
        "##...###",
        ".#######",
        "..#####.",
        ".....##.",
        "....###.",
        "######..",
        ".####...",
    ],
}

DIGIT_TEMPLATES = {
    d: np.array([[c == '#' for c in r] for r in rows], dtype=bool)
    for d, rows in DIGIT_MASKS_STR.items()
}

def download_image(filename: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    local_path = os.path.join(CACHE_DIR, filename)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 10000:
        return local_path

    url = BASE_URL + filename
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = resp.read()
        with open(local_path, 'wb') as f:
            f.write(data)
    return local_path

def is_text_pixel(rgb):
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    return (b > 120 and r < 100) or (r > 150 and b < 100)

def match_digit_in_patch(patch):
    best_d = -1
    best_iou = -1.0
    ph, pw = patch.shape
    for d, tmpl in DIGIT_TEMPLATES.items():
        th, tw = tmpl.shape
        mh = max(ph, th)
        mw = max(pw, tw)
        p_pad = np.zeros((mh, mw), dtype=bool)
        t_pad = np.zeros((mh, mw), dtype=bool)
        p_pad[:ph, :pw] = patch
        t_pad[:th, :tw] = tmpl
        inter = np.sum(p_pad & t_pad)
        union = np.sum(p_pad | t_pad)
        iou = inter / union if union > 0 else 0
        if iou > best_iou:
            best_iou = iou
            best_d = d
    return best_d, best_iou

def find_first_green_y(img_arr):
    # Scan X=45 from Y=180 to 380
    mask = (img_arr[180:380, 45, 1] > 100) & (img_arr[180:380, 45, 0] < 80) & (img_arr[180:380, 45, 2] < 80)
    idx = np.where(mask)[0]
    if len(idx) > 0:
        return 180 + idx[0]
    return 259

def crop_tight(m):
    yp = np.sum(m, axis=1)
    xp = np.sum(m, axis=0)
    ay = np.where(yp > 0)[0]
    ax = np.where(xp > 0)[0]
    if len(ay) == 0 or len(ax) == 0:
        return m
    return m[ay[0]:ay[-1]+1, ax[0]:ax[-1]+1]

def parse_hour_row(img_arr, hour: int, is_weekend: bool, direction: str, y_offset: int = 0):
    ystart = round(302 + y_offset + (hour - 5) * 41.421)
    yend = ystart + 12
    if not is_weekend:
        xstart, xend = 75, 515
    else:
        xstart, xend = 560, 1000

    crop = img_arr[ystart:yend, xstart:xend]
    mask = np.zeros((crop.shape[0], crop.shape[1]), dtype=bool)
    for y in range(crop.shape[0]):
        for x in range(crop.shape[1]):
            if is_text_pixel(crop[y, x]):
                mask[y, x] = True

    proj = np.sum(mask, axis=0)
    # Find active segments
    segments = []
    in_s = False
    s_x = 0
    last_act = 0
    for x, val in enumerate(proj):
        if val > 0:
            if not in_s:
                in_s = True
                s_x = x
            last_act = x
        else:
            if in_s and (x - last_act >= 7):
                in_s = False
                segments.append((s_x, last_act + 1))
    if in_s:
        segments.append((s_x, last_act + 1))

    # Merge single-digit segments
    merged = []
    idx = 0
    while idx < len(segments):
        sx, ex = segments[idx]
        w = ex - sx
        if w < 12 and idx + 1 < len(segments):
            nsx, nex = segments[idx + 1]
            if nsx - ex <= 8:
                merged.append((sx, nex))
                idx += 2
                continue
        merged.append((sx, ex))
        idx += 1

    trains = []
    for sx, ex in merged:
        c_mask = mask[:, sx:ex]
        c_rgb = crop[:, sx:ex]

        r_m = np.mean(c_rgb[c_mask, 0]) if np.any(c_mask) else 0
        b_m = np.mean(c_rgb[c_mask, 2]) if np.any(c_mask) else 0
        is_red = (r_m > b_m + 40)

        cw = ex - sx
        mid_s = max(3, cw // 3)
        mid_e = min(cw - 3, 2 * cw // 3 + 1)
        if mid_e > mid_s:
            split_x = mid_s + np.argmin(np.sum(c_mask, axis=0)[mid_s:mid_e])
        else:
            split_x = cw // 2

        d1_mask = c_mask[:, :split_x]
        d2_mask = c_mask[:, split_x:]

        d1, _ = match_digit_in_patch(crop_tight(d1_mask))
        d2, _ = match_digit_in_patch(crop_tight(d2_mask))

        if d1 < 0 or d2 < 0 or d1 > 5:
            continue

        hh = hour if hour < 24 else 0
        time_str = f'{hh:02d}:{d1}{d2}'

        if direction == 'UP':
            dest = '차량기지임시승강장' if is_red else '탑석'
        else:
            dest = '발곡'

        trains.append({'t': time_str, 'd': dest})

    return trains

def parse_image_file(image_path: str, direction: str):
    img = Image.open(image_path)
    arr = np.array(img)

    first_green = find_first_green_y(arr)
    y_offset = first_green - 259

    weekday_list = []
    weekend_list = []

    for h in range(5, 25):
        w_trains = parse_hour_row(arr, h, is_weekend=False, direction=direction, y_offset=y_offset)
        e_trains = parse_hour_row(arr, h, is_weekend=True, direction=direction, y_offset=y_offset)
        weekday_list.extend(w_trains)
        weekend_list.extend(e_trains)

    def sort_key(item):
        h, m = map(int, item['t'].split(':'))
        return (h if h >= 4 else h + 24) * 60 + m

    weekday_list.sort(key=sort_key)
    weekend_list.sort(key=sort_key)

    prefix = 'U1' if direction == 'UP' else 'U2'
    for i, tr in enumerate(weekday_list, 1):
        tr['no'] = f'{prefix}{i:03d}'
    for i, tr in enumerate(weekend_list, 1):
        tr['no'] = f'{prefix}{i:03d}'

    return weekday_list, weekend_list

def main():
    print('=== 의정부경전철 공식 열차시간표 이미지 빌더 시작 ===')
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_data = {}
    total_records = 0

    for stn_name, file_dict in STATION_MAP:
        print(f'[{stn_name}] 파싱 시작...')
        stn_data = {}

        for dir_key, filename in file_dict.items():
            local_img = download_image(filename)
            print(f'  - {dir_key} ({filename}) 파싱 중...')
            w_list, e_list = parse_image_file(local_img, dir_key)

            stn_data[f'의정부경전철_DAY_{dir_key}'] = w_list
            stn_data[f'의정부경전철_END_{dir_key}'] = e_list
            stn_data[f'의정부경전철_SAT_{dir_key}'] = e_list

            rec_count = len(w_list) + len(e_list) * 2
            total_records += rec_count
            print(f'    ✓ {dir_key}: 평일 {len(w_list)}편, 주말 {len(e_list)}편 (총 {rec_count}건)')

        all_data[stn_name] = stn_data

    db = {
        'meta': {
            'line': '의정부경전철',
            'subwayId': '1010',
            'totalStations': len(all_data),
            'totalRecords': total_records,
            'source': '의정부경량전철주식회사 공식 홈페이지 (ulrt.co.kr)',
            'updatedAt': '2026-09-19',
        },
        'data': all_data,
    }

    raw_json = json.dumps(db, ensure_ascii=False, indent=None)
    with gzip.open(OUTPUT_FILE, 'wt', encoding='utf-8') as f:
        f.write(raw_json)

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print('\n=== 빌드 완료 ===')
    print(f'출력 파일: {OUTPUT_FILE}')
    print(f'압축 크기: {size_kb:.1f} KB')
    print(f'수록 역사: {len(all_data)}개 역, 총 {total_records}건 운행 시각')

if __name__ == '__main__':
    main()
