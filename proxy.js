// Netlify Function — proxy entre la app y Apps Script
// Resuelve el CORS completamente

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbRZtiQRmrX0qBvNffls9IUGBLLHHQF4G4Xf8ZWo2lbkrPoVSXGLQ_2a6n_HlbDtkXVvw/exec";

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    let url = APPS_SCRIPT_URL;

    // Si viene payload (escribir), lo pasamos como parámetro GET
    if (event.body) {
      const body = JSON.parse(event.body);
      const payload = encodeURIComponent(JSON.stringify(body));
      url = APPS_SCRIPT_URL + "?payload=" + payload;
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();

    return {
      statusCode: 200,
      headers,
      body: text
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
