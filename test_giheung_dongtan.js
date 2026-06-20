const apiKey = 'J5mUW0MUOQkCuRfYNdqONXEvlcnIrlfkJqwALTZVehM';

async function test() {
  const sx = 127.1159514;
  const sy = 37.2756462;
  const ex = 127.0727109;
  const ey = 37.2067045;

  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(apiKey)}&SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}`;
  console.log('Fetching ODsay:', url);

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.log('ODsay error:', data.error);
      return;
    }
    
    const paths = data.result?.path || [];
    console.log(`Found ${paths.length} paths.`);
    
    // Find path that has 8326 bus
    paths.forEach((p, pIdx) => {
      const has8326 = p.subPath.some(sp => sp.lane?.[0]?.busNo === '8326');
      if (has8326) {
        console.log(`\nPath ${pIdx + 1} (contains 8326):`);
        console.log(`  info.payment: ${p.info?.payment}`);
        p.subPath.forEach((sp, sIdx) => {
          console.log(`    SubPath ${sIdx + 1}:`);
          console.log(`      trafficType: ${sp.trafficType}`);
          if (sp.trafficType === 2) {
            console.log(`      Bus: ${sp.lane?.[0]?.busNo} (type: ${sp.lane?.[0]?.type})`);
          }
          console.log(`      payment: ${sp.payment}`);
        });
      }
    });
  } catch (e) {
    console.error(e);
  }
}

test();
