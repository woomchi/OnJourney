async function test() {
  const stationId = '233002132';
  const url = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=12345&stationId=${stationId}&format=json`;
  try {
    const res = await fetch(url);
    console.log('Status with dummy key:', res.status);
    console.log('Body:', await res.text());
  } catch (e) {
    console.error(e);
  }
}
test();
