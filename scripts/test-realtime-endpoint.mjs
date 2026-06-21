async function testEndpoint(station, busNo) {
  const url = `http://localhost:3000/api/bus/realtime?station=${encodeURIComponent(station)}&busNo=${encodeURIComponent(busNo)}`;
  console.log(`\nTesting: ${station} / ${busNo}`);
  console.log(`URL: ${url}`);
  try {
    const start = Date.now();
    const res = await fetch(url);
    const duration = Date.now() - start;
    console.log(`Status: ${res.status} (${duration}ms)`);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error fetching endpoint:', e.message);
  }
}

async function run() {
  // Test Bus 11-2 (Gyeonggi Town Bus with active time) at 롯데시네마
  await testEndpoint('롯데시네마', '11-2');
}

run();
