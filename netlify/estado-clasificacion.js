// Netlify Function normal (rápida) — la app la llama cada pocos segundos
// para saber si el background function ya terminó de procesar el PDF.

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
    if (!jobId) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Falta jobId" }) };
    }

    const store = getStore("clasificaciones");
    const resultado = await store.get(jobId, { type: "json" });

    if (!resultado) {
      // Todavía no hay resultado — sigue procesando
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, status: "procesando" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(resultado) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
