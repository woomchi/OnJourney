import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '../data/한국철도공사_철도운행거리_전체_20240901.xlsx');
console.log('Reading Excel file from:', excelPath);

try {
  const workbook = xlsx.readFile(excelPath);
  const worksheet = workbook.Sheets['4-경부(1)'];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('\n=================== Grid Rows 23-38, Cols 0-12 ===================');
  for (let r = 22; r <= 38; r++) {
    const row = rawData[r] || [];
    const slice = [];
    for (let c = 0; c <= 12; c++) {
      slice.push(row[c] !== undefined ? row[c] : '');
    }
    console.log(`Row ${r}:`, slice.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)));
  }
} catch (error) {
  console.error('Error reading excel file:', error);
}
