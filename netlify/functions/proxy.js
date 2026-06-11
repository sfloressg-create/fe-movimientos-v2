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
    // La URL de Apps Script viene en el body del request
    const body = JSON.parse(event.body || "{}");
    const appsScriptUrl = body.appsScriptUrl;

    if (!appsScriptUrl || !appsScriptUrl.includes("script.google.com")) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: "URL de Apps Script no válida" })
      };
    }

    // Si hay payload (crear/editar/borrar), lo agregamos como parámetro
    let url = appsScriptUrl;
    if (body.payload) {
      url = appsScriptUrl + "?payload=" + encodeURIComponent(JSON.stringify(body.payload));
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();

    // Verificar que sea JSON válido
    try {
      JSON.parse(text);
    } catch(e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: "Apps Script no devolvió JSON válido. Verifica que la implementación esté activa." })
      };
    }

    return { statusCode: 200, headers, body: text };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
