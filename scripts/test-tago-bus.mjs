import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const match = envContent.match(/REAL_TIME_BUS_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
const apiKey = match ? match[1] : '';

async function test() {
  const url = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=${apiKey}&cityCode=31240&nodeId=GGB233002403&_type=json&numOfRows=10&pageNo=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
