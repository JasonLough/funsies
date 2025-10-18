const BASE_URL = "https://assessment.ksensetech.com/api/patients";
const API_KEY = "ak_d2ce5cc2ac810bf21929c417c27fb20787a97e3f6860fc40";
const LIMIT = 20;
const MAX_RETRIES = 3;
const RETRY_DELAY = 500;

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": API_KEY,
          Accept: "application/json",
        },
      });

      // log raw content type + status
      const contentType = res.headers.get("content-type");
      console.log(`→ [${res.status}] ${url} (${contentType})`);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let text = await res.text(); // grab as raw text first
      let json;

      try {
        json = JSON.parse(text);
      } catch {
        console.error("Response is not valid JSON:");
        console.error(text.slice(0, 500)); // print partial for safety
        throw new Error("Response not JSON");
      }

      if (!json?.data) {
        console.error('Response JSON missing expected "data" key:');
        console.dir(json, { depth: null });
        throw new Error("Invalid response format");
      }

      return json;
    } catch (err) {
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await delay(RETRY_DELAY * attempt);
    }
  }
}

async function fetchAllPatients() {
  let allData = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = `${BASE_URL}?page=${page}&limit=${LIMIT}`;
    console.log(`Fetching page ${page}...`);
    console.log(url);

    try {
      const json = await fetchWithRetry(url);

      allData = allData.concat(json.data);
      hasNext = json.pagination?.hasNext || false;
      page++;

      await delay(200);
    } catch (err) {
      console.error(`Failed page ${page}: ${err.message}`);
      break;
    }
  }

  return allData;
}

fetchAllPatients().then((patients) => {
  console.log(`Fetched ${patients.length} total patients`);
  console.log(patients);

  const alertList = {
    high_risk_patients: [],
    fever_patients: [],
    data_quality_issues: [],
  };

  patients.forEach((e, i) => {
    let points = 0;
    // test blood pressure
    if (/\d+\/\d+/.test(e.blood_pressure)) {
      const [s, d] = e.blood_pressure.split("/").map((e) => ~~e);

      let systolicScore = 0;
      let diastolicScore = 0;
      if (s >= 120 && s < 130) systolicScore = 1;
      if (s >= 130 && s < 140) systolicScore = 2;
      if (s >= 140) systolicScore = 3;

      if (d >= 80 && d < 90) diastolicScore = 2;
      if (d >= 90) diastolicScore = 3;

      points += Math.max(systolicScore, diastolicScore);
    } else {
      alertList.data_quality_issues.push(e.patient_id);
    }

    // test temp
    if (typeof e.temperature === "number") {
      if (e.temperature >= 99.6) {
        alertList.fever_patients.push(e.patient_id);
      }
      if (e.temperature >= 99.6 && e.temperature <= 100.9) {
        points += 1;
      } else if (e.temperature >= 101) {
        points += 2;
      }
    } else {
      alertList.data_quality_issues.push(e.patient_id);
    }

    // age risk
    if (typeof e.age === "number") {
      if (e.age >= 40 && e.age <= 65) {
        points += 1;
      } else if (e.age > 65) {
        points += 2;
      }
    } else {
      alertList.data_quality_issues.push(e.patient_id);
    }

    if (points >= 4) {
      alertList.high_risk_patients.push(e.patient_id);
    }
  });

  console.log(alertList);
});
