// Netlify BACKGROUND Function — hasta 15 minutos de ejecución
// Procesa el PDF con Claude y guarda el resultado en el Google Sheet
// (vía Apps Script + PropertiesService), no en Netlify Blobs.
// El nombre DEBE terminar en "-background.js" para que Netlify la trate
// como background function automáticamente.

const CATALOGO = {
  grupos: ["Ingresos", "Evento — externo", "Evento — inhouse", "Evento — personal", "Op. bodega/oficina", "Op. negocio general", "Devolucion", "Personal"],
  categoriasPorGrupo: {
    "Ingresos": ["Cobro cliente", "Comisiones de proveedores"],
    "Evento — externo": ["Venue", "Catering", "Música y sonido", "Talento o happening", "Experiencia", "Fotografía y video", "Mobiliario externo", "Papelería", "Maquillaje y peinado", "Rehearsal dinner o welcome event", "Planta de luz", "Pastelería", "Mesas de alimentos", "Transporte evento", "Logística externa", "Otros externos"],
    "Evento — inhouse": ["Flores y deco inhouse", "Pista de baile, estrados y templetes", "Barras de alcohol", "Mobiliario inhouse", "Styling en mesas", "Iluminación inhouse", "Otros inhouse", "Transporte evento (inhouse)"],
    "Evento — personal": ["Pago eventual", "Asimilados a salarios", "Honorarios Fiorella", "Comisiones a socios"],
    "Op. bodega/oficina": ["Sueldo administrativo bodega", "Sueldo operativo bodega", "Servicios bodega", "Mantenimiento", "Limpieza / seguridad", "Seguros"],
    "Op. negocio general": ["Suscripciones", "Papelería / oficina", "Herramienta / equipo", "Gasolina negocio", "Gasolina socios", "Publicidad / marketing", "Contabilidad / legal", "Capacitación", "Otros operativos", "Pago a tarjeta bancaria"],
    "Devolucion": ["Devolucion de deposito de garantia"],
    "Personal": ["Gasto personal"]
  },
  naturalezaPorGrupo: {
    "Ingresos": "Evento", "Evento — externo": "Evento", "Evento — inhouse": "Evento",
    "Evento — personal": "Evento", "Op. bodega/oficina": "Operativo negocio",
    "Op. negocio general": "Operativo negocio", "Devolucion": "Devolucion", "Personal": "Personal"
  }
};

// Guarda el resultado del trabajo directo en Apps Script (PropertiesService),
// usando la misma URL de Apps Script que ya usa el resto de la app.
async function guardarEnAppsScript(appsScriptUrl, jobId, resultado) {
  console.log("[clasificar-background] Intentando guardar en Apps Script. jobId:", jobId, "ok:", resultado && resultado.ok, "status:", resultado && resultado.status);
  try {
    const resp = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "guardar_job", jobId: jobId, resultado: resultado })
    });
    const text = await resp.text();
    console.log("[clasificar-background] Respuesta de Apps Script. status HTTP:", resp.status, "body:", text.substring(0, 300));
  } catch (e) {
    console.error("[clasificar-background] FALLÓ el guardado en Apps Script:", e && e.message, e && e.stack);
  }
}

exports.handler = async function (event) {
  console.log("[clasificar-background] >>> Handler arrancó. Body length:", event && event.body ? event.body.length : 0);
  let jobId, appsScriptUrl;

  try {
    const body = JSON.parse(event.body || "{}");
    const { apiKey, fileBase64, mediaType, medio, proyectosDisponibles } = body;
    jobId = body.jobId || ("job_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10));
    appsScriptUrl = body.appsScriptUrl;

    console.log("[clasificar-background] Parseado OK. jobId:", jobId, "appsScriptUrl presente:", !!appsScriptUrl, "apiKey presente:", !!apiKey, "fileBase64 length:", fileBase64 ? fileBase64.length : 0, "mediaType:", mediaType);

    if (!appsScriptUrl) {
      console.error("[clasificar-background] ABORTA: no hay appsScriptUrl, no se puede reportar resultado a ningún lado.");
      return; // sin esto no podemos reportar el resultado a ningún lado
    }

    if (!apiKey || !fileBase64) {
      console.error("[clasificar-background] ABORTA: falta apiKey o fileBase64.");
      await guardarEnAppsScript(appsScriptUrl, jobId, { ok: false, status: "error", error: "Falta apiKey o archivo" });
      return;
    }

    const proyectosTexto = (proyectosDisponibles && proyectosDisponibles.length)
      ? proyectosDisponibles.join(", ")
      : "Personal, Operativo, App, Publicidad, (otro)";

    const sistemaPrompt = `Eres un asistente contable para Fiorella Eventos, una empresa de producción de eventos en México. 
Tu tarea es leer un estado de cuenta bancario (PDF o imagen) y extraer TODOS los movimientos (cargos y abonos) en formato JSON.

Para cada movimiento debes clasificarlo usando EXACTAMENTE estos valores del catálogo de la empresa:

GRUPOS válidos: ${CATALOGO.grupos.join(", ")}

CATEGORÍAS por grupo (debes usar una categoría que pertenezca al grupo elegido):
${Object.entries(CATALOGO.categoriasPorGrupo).map(([g, cats]) => `- ${g}: ${cats.join(", ")}`).join("\n")}

NATURALEZA automática según el grupo (debes asignarla tú mismo según el grupo elegido):
${Object.entries(CATALOGO.naturalezaPorGrupo).map(([g, n]) => `- ${g} → ${n}`).join("\n")}

PROYECTOS disponibles: ${proyectosTexto}. Si el movimiento no corresponde a ningún proyecto evidente, usa "Personal" u "Operativo" según corresponda, o "(otro)" si no estás segura.

REGLAS DE CLASIFICACIÓN:
- Depósitos/abonos de clientes → Grupo "Ingresos", Categoría "Cobro cliente"
- Pagos a tarjetas de crédito → Grupo "Op. negocio general", Categoría "Pago a tarjeta bancaria"
- Suscripciones de software (Canva, Asana, Apple, Amazon Prime, Spotify, Anthropic, Calendly, etc.) → Grupo "Op. negocio general", Categoría "Suscripciones"
- Restaurantes, cafés, compras personales, ropa → Grupo "Personal", Categoría "Gasto personal"
- Gasolina/casetas si el contexto sugiere uso del negocio → Grupo "Op. negocio general", Categoría "Gasolina negocio" o "Gasolina socios"
- Publicidad en redes (Facebook, Instagram, Google Ads) → Grupo "Op. negocio general", Categoría "Publicidad / marketing"
- Si no hay certeza suficiente, usa Grupo "Personal", Categoría "Gasto personal" como default seguro, y baja la confianza.
- IGNORA encabezados, totales, saldos, secciones legales o publicitarias del estado de cuenta. Solo extrae movimientos individuales reales (fecha + concepto + monto).

Para CADA movimiento extraído, responde con este formato JSON exacto (un array de objetos), SIN texto adicional antes o después, SIN markdown, solo el JSON puro:

[
  {
    "fecha": "YYYY-MM-DD",
    "grupo": "uno de los grupos válidos",
    "categoria": "una categoría válida para ese grupo",
    "naturaleza": "la naturaleza correspondiente al grupo",
    "proyecto": "uno de los proyectos disponibles o vacío",
    "descripcion": "descripción corta y clara del movimiento, en español",
    "contraparte": "nombre del comercio o persona, tal como aparece o inferido",
    "total": "monto en número, sin signos ni comas, ej: 1234.56",
    "tipo": "ingreso" o "egreso",
    "confianza": "alta", "media", o "baja"
  }
]

Si una fecha no tiene año explícito, usa el año que aparece en el encabezado del estado de cuenta.`;

    const userText = `Este es el estado de cuenta de la cuenta/tarjeta "${medio || "no especificada"}". Extrae todos los movimientos y clasifícalos según las instrucciones.`;

    const contentBlock = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: fileBase64 } };

    console.log("[clasificar-background] Llamando a la API de Anthropic...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: sistemaPrompt,
        messages: [
          { role: "user", content: [contentBlock, { type: "text", text: userText }] }
        ]
      })
    });
    console.log("[clasificar-background] Respuesta de Anthropic recibida. status HTTP:", response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error("[clasificar-background] Anthropic devolvió error:", JSON.stringify(data));
      await guardarEnAppsScript(appsScriptUrl, jobId, {
        ok: false, status: "error",
        error: (data.error && data.error.message) || "Error en la API de Anthropic"
      });
      return;
    }

    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) {
      await guardarEnAppsScript(appsScriptUrl, jobId, { ok: false, status: "error", error: "Claude no devolvió texto" });
      return;
    }

    let jsonText = textBlock.text.trim();
    jsonText = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

    let movimientos;
    try {
      movimientos = JSON.parse(jsonText);
    } catch (e) {
      console.error("[clasificar-background] No se pudo parsear JSON de la IA. Error:", e.message, "Texto recibido (primeros 500):", jsonText.substring(0, 500));
      await guardarEnAppsScript(appsScriptUrl, jobId, {
        ok: false, status: "error",
        error: "No se pudo interpretar la respuesta de la IA",
        raw: jsonText.substring(0, 500)
      });
      return;
    }

    console.log("[clasificar-background] Movimientos extraídos:", Array.isArray(movimientos) ? movimientos.length : "no es array");
    await guardarEnAppsScript(appsScriptUrl, jobId, { ok: true, status: "listo", movimientos: movimientos });
    console.log("[clasificar-background] <<< Handler terminó OK.");

  } catch (err) {
    console.error("[clasificar-background] EXCEPCIÓN NO CAPTURADA:", err && err.message, err && err.stack);
    if (jobId && appsScriptUrl) {
      await guardarEnAppsScript(appsScriptUrl, jobId, { ok: false, status: "error", error: err.message });
    }
  }
};
