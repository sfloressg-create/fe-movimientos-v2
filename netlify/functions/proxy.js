const https = require('https');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // ── Ruta 1: llamada directa a Anthropic (action: 'ai') ──
    // Usado por el registro manual cuando se sube una foto de comprobante
    if (body.action === 'ai') {
      const apiKey = body.apiKey;
      delete body.apiKey;
      delete body.action;
      const result = await postDirect(ANTHROPIC_URL, JSON.stringify(body), {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }, 25000);
      return { statusCode: 200, headers, body: result };
    }

    // ── Ruta 2: registro manual → Apps Script hardcoded (saveRow, uploadFile) ──
    // Usado por la pantalla de registro manual de movimientos
    const APPS_SCRIPT_HARDCODED = 'https://script.google.com/macros/s/AKfycbxyplkbjE1F4VqQXmeEh6miMTlCgbFWcosfq6sMlHDzyNsYOPV_lxbDsODTmMjnibytog/exec';
    if (body.action === 'saveRow' || body.action === 'uploadFile') {
      const timeout = body.action === 'uploadFile' ? 28000 : 15000;
      const result = await postWithRedirects(APPS_SCRIPT_HARDCODED, JSON.stringify(body), 5, timeout);
      return { statusCode: 200, headers, body: result };
    }

    // ── Ruta 3: flujo de importación de estados de cuenta (payload + appsScriptUrl) ──
    // Usado por la tab Importar: guardar_archivo_job, crear_lote, leer_job, etc.
    const appsScriptUrl = body.appsScriptUrl;
    if (!appsScriptUrl || !appsScriptUrl.includes('script.google.com')) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ ok: false, error: 'URL de Apps Script no válida o acción no reconocida' })
      };
    }

    // Acciones con payload grande van por POST
    const accionesPost = ['guardar_archivo_job', 'leer_archivo_job', 'limpiar_archivo_job', 'crear_lote', 'guardar_job'];

    let response;
    if (body.payload && accionesPost.includes(body.payload.accion)) {
      response = await postWithRedirects(appsScriptUrl, JSON.stringify(body.payload), 5, 28000);
    } else if (body.payload) {
      const url = appsScriptUrl + '?payload=' + encodeURIComponent(JSON.stringify(body.payload));
      response = await getWithRedirects(url, 5);
    } else {
      response = await getWithRedirects(appsScriptUrl, 5);
    }

    // Verificar JSON válido
    try { JSON.parse(response); } catch(e) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({
          ok: false,
          error: 'Apps Script no devolvió JSON válido. Verifica que la implementación esté activa.',
          respuestaCruda: response.substring(0, 1500)
        })
      };
    }
    return { statusCode: 200, headers, body: response };

  } catch (error) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ status: 'error', ok: false, message: error.message })
    };
  }
};

function postDirect(url, body, extraHeaders, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyBuffer = Buffer.from(body, 'utf8');
    const options = {
      hostname: urlObj.hostname, port: 443, path: urlObj.pathname,
      method: 'POST',
      headers: { ...extraHeaders, 'Content-Length': bodyBuffer.length },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuffer);
    req.end();
  });
}

function postWithRedirects(url, body, maxRedirects = 5, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));
    const urlObj = new URL(url);
    const bodyBuffer = Buffer.from(body, 'utf8');
    const options = {
      hostname: urlObj.hostname, port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': bodyBuffer.length },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        postWithRedirects(res.headers.location, body, maxRedirects-1, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuffer);
    req.end();
  });
}

function getWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname, port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        getWithRedirects(res.headers.location, maxRedirects-1).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}
