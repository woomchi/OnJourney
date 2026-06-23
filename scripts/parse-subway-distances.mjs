import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '../data/한국철도공사_철도운행거리_전체_20240901.xlsx');
const outputPath = path.join(__dirname, '../src/data/subway_distances.json');

console.log('Reading Excel file:', excelPath);

// Helper to clean station names
function cleanStationName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim()
    .replace(/역$/, '') // Remove '역' suffix if exists
    .replace(/\s+/g, ''); // Remove spaces
}

try {
  const workbook = xlsx.readFile(excelPath);
  const worksheet = workbook.Sheets['4-경부(1)'];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const links = [];
  const seenPairs = new Set();

  // Iterate to find diagonal relationships: (r, c) and (r+1, c+1)
  for (let r = 0; r < rawData.length - 1; r++) {
    const currentRow = rawData[r] || [];
    const nextRow = rawData[r + 1] || [];

    for (let c = 0; c < currentRow.length - 1; c++) {
      const fromVal = currentRow[c];
      const toVal = nextRow[c + 1];
      const distVal = currentRow[c + 1]; // Cell (r, c+1) represents the distance between them

      if (
        fromVal && typeof fromVal === 'string' &&
        toVal && typeof toVal === 'string' &&
        distVal !== undefined && typeof distVal === 'number'
      ) {
        const fromClean = cleanStationName(fromVal);
        const toClean = cleanStationName(toVal);

        // Exclude headers, route lines, or special symbols
        const isBlacklisted = (name) => {
          return !name || name.includes('선') || name.includes('KTX') || name.includes('운행') || name.includes('연결') || name.includes('-');
        };

        if (!isBlacklisted(fromClean) && !isBlacklisted(toClean)) {
          const travelTimeSec = Math.round(distVal * 90);
          
          // Generate bidirectional links to simplify graph search
          const key1 = `${fromClean}-${toClean}`;
          if (!seenPairs.has(key1)) {
            seenPairs.add(key1);
            links.push({
              from_station: fromClean,
              to_station: toClean,
              distance_km: parseFloat(distVal.toFixed(3)),
              travel_time_sec: travelTimeSec
            });
          }

          const key2 = `${toClean}-${fromClean}`;
          if (!seenPairs.has(key2)) {
            seenPairs.add(key2);
            links.push({
              from_station: toClean,
              to_station: fromClean,
              distance_km: parseFloat(distVal.toFixed(3)),
              travel_time_sec: travelTimeSec
            });
          }
        }
      }
    }
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write JSON
  fs.writeFileSync(outputPath, JSON.stringify(links, null, 2), 'utf-8');
  console.log(`Successfully parsed ${links.length} link relations and wrote to ${outputPath}`);

  // Print sample links
  console.log('Sample links (first 5):', links.slice(0, 5));
} catch (error) {
  console.error('Error parsing subway distances:', error);
}
