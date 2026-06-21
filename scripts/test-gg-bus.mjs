import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const match = envContent.match(/REAL_TIME_BUS_GYEONGGI_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
const apiKey = match ? match[1] : '';

async function test() {
  const stationId = '233002132'; // 롯데시네마 병점
  const url = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${apiKey}&stationId=${stationId}&format=json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const list = data.response.msgBody.busArrivalList;
    console.log(`Found ${list.length} routes:`);
    list.forEach(item => {
      console.log(`- Route Name: ${item.routeName}, Route ID: ${item.routeId}, Time1: "${item.predictTime1}" (${item.locationNo1}전), Time2: "${item.predictTime2}" (${item.locationNo2}전)`);
    });
  } catch (e) {
    console.error(e);
  }
}

test();
