import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type { Feature, FeatureCollection } from 'geojson';

// Polyfill self for shpjs in Node environment
(global as any).self = global;

async function preprocessTrails() {
  const { parseShp, parseDbf, combine } = await import('shpjs');

  const dataDir = path.resolve(process.cwd(), 'data');
  const tempDir = path.join(dataDir, 'temp_unzipped');
  const outputFile = path.join(dataDir, 'hikingTrails.json');

  console.log('🚀 Starting Hiking Trails Preprocessing...');

  // Ensure clean temp dir
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // 1. Collect zip files from data/ directory
  function findZipFiles(dir: string): string[] {
    let zipFiles: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'temp_unzipped') continue;
        zipFiles = zipFiles.concat(findZipFiles(fullPath));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.zip') &&
        !entry.name.endsWith('_geojson.zip') &&
        !entry.name.endsWith('_gpx.zip')
      ) {
        zipFiles.push(fullPath);
      }
    }
    return zipFiles;
  }

  const allZips = findZipFiles(dataDir);
  console.log(`📦 Found ${allZips.length} total SHP zip dataset files under data/`);

  // Filter for Busan region (Administrative area code starting with 26)
  const busanZips = allZips.filter((filePath) => {
    const baseName = path.basename(filePath);
    return baseName.startsWith('26');
  });

  console.log(`📍 Found ${busanZips.length} zip files for Busan region (Code 26)`);

  // 2. Unzip files to temp_unzipped folder
  console.log('📂 Unzipping Busan region files into data/temp_unzipped/...');
  for (const zipPath of busanZips) {
    const zipName = path.basename(zipPath, '.zip');
    const extractPath = path.join(tempDir, zipName);
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractPath, true);
    } catch (err) {
      console.error(`⚠️ Failed to unzip ${zipPath}:`, err);
    }
  }

  // 3. Traversal unzipped SHP files and convert to GeoJSON WGS84
  function findShpFiles(dir: string): string[] {
    let shpFiles: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        shpFiles = shpFiles.concat(findShpFiles(fullPath));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.shp')) {
        shpFiles.push(fullPath);
      }
    }
    return shpFiles;
  }

  const shpFiles = findShpFiles(tempDir);
  console.log(`🗺️ Found ${shpFiles.length} unzipped SHP layer files`);

  const allFeatures: Feature[] = [];
  let totalLineFeatures = 0;
  let totalPointFeatures = 0;

  for (const shpPath of shpFiles) {
    const baseWithoutExt = shpPath.slice(0, -4);
    const dbfPath = baseWithoutExt + '.dbf';
    const prjPath = baseWithoutExt + '.prj';

    if (!fs.existsSync(dbfPath)) {
      console.warn(`Missing DBF for ${shpPath}, skipping.`);
      continue;
    }

    try {
      const shpBuffer = fs.readFileSync(shpPath);
      const dbfBuffer = fs.readFileSync(dbfPath);
      const prjString = fs.existsSync(prjPath)
        ? fs.readFileSync(prjPath, 'utf-8')
        : undefined;

      const parsedShp = parseShp(shpBuffer, prjString);
      const parsedDbf = parseDbf(dbfBuffer, Buffer.from('EUC-KR'));

      const geojson = combine([parsedShp, parsedDbf]) as FeatureCollection;

      if (geojson && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
          allFeatures.push(feature);
          const geomType = feature.geometry?.type;
          if (geomType === 'LineString' || geomType === 'MultiLineString') {
            totalLineFeatures++;
          } else if (geomType === 'Point' || geomType === 'MultiPoint') {
            totalPointFeatures++;
          }
        }
      }
    } catch (err) {
      console.error(`⚠️ Error parsing SHP file ${shpPath}:`, err);
    }
  }

  // 4. Create merged FeatureCollection
  const mergedGeoJSON: FeatureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  // 5. Write to data/hikingTrails.json
  console.log(`💾 Writing output to ${outputFile}...`);
  fs.writeFileSync(outputFile, JSON.stringify(mergedGeoJSON), 'utf-8');

  const stats = fs.statSync(outputFile);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`✅ Output file generated: data/hikingTrails.json (${fileSizeMB} MB)`);
  console.log(`📊 Statistics:`);
  console.log(`   - Total Features merged: ${allFeatures.length}`);
  console.log(`   - LineString / Trail Features: ${totalLineFeatures}`);
  console.log(`   - Point / Spot Features: ${totalPointFeatures}`);

  // 6. Cleanup temp folder
  console.log('🧹 Cleaning up temporary folder (data/temp_unzipped/)...');
  function removeDirRecursive(targetDir: string) {
    if (!fs.existsSync(targetDir)) return;
    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const item of items) {
      const curPath = path.join(targetDir, item.name);
      if (item.isDirectory()) {
        removeDirRecursive(curPath);
      } else {
        try {
          fs.unlinkSync(curPath);
        } catch {}
      }
    }
    try {
      fs.rmdirSync(targetDir);
    } catch {}
  }

  try {
    removeDirRecursive(tempDir);
    if (!fs.existsSync(tempDir)) {
      console.log('✨ Temporary folder cleaned up successfully!');
    }
  } catch (cleanErr) {
    console.warn('⚠️ Note: Temporary folder cleanup warning:', cleanErr);
  }
  console.log('✨ Preprocessing complete!');
}

preprocessTrails().catch((err) => {
  console.error('❌ Script failed with error:', err);
  process.exit(1);
});
