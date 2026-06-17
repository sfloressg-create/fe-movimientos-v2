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

    let response;

    // Las acciones que mueven archivos (base64 de PDFs/imágenes) pueden
    // pesar mucho más de lo que cabe en una URL como query string
    // (el límite práctico es ~8KB). Para esas, reenviamos como POST con
    // el payload en el body — Apps Script lee esto en doPost vía
    // e.postData.contents, sin límite de tamaño de URL.
    const accionesConBodyGrande = ["guardar_archivo_job", "leer_archivo_job", "limpiar_archivo_job"];

    if (body.payload && accionesConBodyGrande.indexOf(body.payload.accion) !== -1) {
      response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload),
        redirect: "follow"
      });
    } else if (body.payload) {
      // Comportamiento original: payload chico, va como query string en GET
      // (se mantiene igual para no romper crear/editar/borrar/crear_lote existentes)
      const url = appsScriptUrl + "?payload=" + encodeURIComponent(JSON.stringify(body.payload));
      response = await fetch(url, {
        method: "GET",
        redirect: "follow"
      });
    } else {
      // Sin payload: comportamiento original (ej. sincronizar)
      response = await fetch(appsScriptUrl, {
        method: "GET",
        redirect: "follow"
      });
    }

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
