const apiKey = "J5mUW0MUOQkCuRfYNdqONXEvlcnIrlfkJqwALTZVehM";

async function testOdsay() {
  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(apiKey)}&SX=127.027610&SY=37.497952&EX=127.111166&EY=37.267602`;
  const res = await fetch(url);
  const data = await res.json();
  const path = data.result.path[0];
  path.subPath.forEach(sp => {
    if (sp.trafficType === 1) {
      console.log(`Type: Subway, Lane: ${sp.lane[0].name}, Way: ${sp.way}, WayCode: ${sp.wayCode}`);
    }
  });
}

testOdsay();
