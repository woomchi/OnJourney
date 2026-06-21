import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const match = envContent.match(/ODSAY_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
const apiKey = match ? match[1] : '';

async function test() {
  const url = `https://api.odsay.com/v1/api/searchStation?lang=0&stationName=${encodeURIComponent('롯데시네마')}&stationClass=1&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const data = await res.json();
  const sts = data.result.station.filter(s => s.businfo && s.businfo.some(b => b.busNo === '27'));
  console.log('Found stations:', sts.map(s => ({ id: s.localStationID, dir: s.stationDirectionName, city: s.cityName })));
}
test();
