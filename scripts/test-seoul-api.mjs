const apiKey = "54687a4461686974313037514366514a";
const station = '기흥'; // Let's test Giheung

async function fetchSeoulApi() {
  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/xml/realtimeStationArrival/1/10/${encodeURIComponent(station)}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(text);
}

fetchSeoulApi();
