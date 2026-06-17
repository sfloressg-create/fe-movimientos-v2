// Netlify Function — Clasificador de movimientos con IA
// Recibe un PDF o imagen del estado de cuenta + el catálogo de Fiorella,
// y devuelve los movimientos extraídos y pre-clasificados.

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

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { apiKey, fileBase64, mediaType, medio, proyectosDisponibles } = body;

    if (!apiKey) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Falta la API key de Anthropic" }) };
    }
    if (!fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Falta el archivo" }) };
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

Si una fecha no tiene año explícito, usa el año que aparece en el encabezado del estado de cuenta. Si el estado de cuenta tiene columnas de cargo y abono, los cargos son "egreso" y los abonos son "ingreso" (y su grupo correspondiente debe ser "Ingresos" con categoría "Cobro cliente" si es un depósito reconocible, o usa tu mejor juicio).`;

    const userText = `Este es el estado de cuenta de la cuenta/tarjeta "${medio || "no especificada"}". Extrae todos los movimientos y clasifícalos según las instrucciones.`;

    const contentBlock = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: fileBase64 } };

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
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: userText }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ ok: false, error: (data.error && data.error.message) || "Error en la API de Anthropic" })
      };
    }

    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "Claude no devolvió texto" }) };
    }

    let jsonText = textBlock.text.trim();
    // Limpiar posibles fences de markdown
    jsonText = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

    let movimientos;
    try {
      movimientos = JSON.parse(jsonText);
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "No se pudo interpretar la respuesta de la IA", raw: jsonText.substring(0, 500) }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, movimientos: movimientos }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
