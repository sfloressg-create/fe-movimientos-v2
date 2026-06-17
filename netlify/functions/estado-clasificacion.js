// Netlify Function normal (rápida) — la app la llama cada pocos segundos
// para saber si el background function ya terminó de procesar el PDF.
// Pregunta directo a Apps Script (PropertiesService), no a Netlify Blobs.

exports.handler = async function (event) {
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
    const body = JSON.parse(event.body || "{}");
    const jobId = body.jobId;
    const appsScriptUrl = body.appsScriptUrl;

    if (!jobId || !appsScriptUrl) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Falta jobId o appsScriptUrl" }) };
    }

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "leer_job", jobId: jobId })
    });

    const text = await response.text();
    return { statusCode: 200, headers, body: text };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
