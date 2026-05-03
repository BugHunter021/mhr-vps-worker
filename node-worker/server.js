const http = require('http');
const https = require('https');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const BAD_HEADERS = [
  'host', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto',
  'cf-connecting-ip', 'connection', 'keep-alive'
];


const SLOW_SITES = [
  // Gemini (web + api)
  'gemini.google.com',
  'ai.google.dev',
  'makersuite.google.com',
  'generativelanguage.googleapis.com',
  '.googleapis.com',
  // OpenAI / ChatGPT
  'chatgpt.com',
  '.chatgpt.com',
  'openai.com',
  '.openai.com',
  'api.openai.com',
  '.oaistatic.com',
  '.oaiusercontent.com',

  // (اختیاری) بعضی CDN/edgeهای رایج که گاهی برای UI استفاده می‌شن
  // '.cloudflare.com',
];

/**
 * تایم‌اوت‌ها
 * روی SLOW_SITES طولانی‌تره که پرامپت‌های بلند drop نشن
 */
const TIMEOUT_SLOW_MS = 55000;
const TIMEOUT_FAST_MS = 20000;

// Agent ها: keepAlive برای بهتر شدن لود اولیه (اتصال کمتر قطع/وصل می‌شه)
const agentOptions = { rejectUnauthorized: false, keepAlive: true };
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

function isSlowHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();

  for (const rule of SLOW_SITES) {
    const r = (rule || '').toLowerCase().trim();
    if (!r) continue;

    if (r.startsWith('.')) {
      const suffix = r; 
      if (host.endsWith(suffix) || host === suffix.slice(1)) return true;
    } else {
      if (host === r) return true;
    }
  }
  return false;
}

const server = http.createServer((req, res) => {
  let bodyParts = [];

  req.on('data', chunk => bodyParts.push(chunk));
  req.on('end', () => {
    // قفل برای جلوگیری از دوبار پاسخ دادن / کرش
    let isResponded = false;

    const sendResponse = (status, headers, base64Body) => {
      if (isResponded) return;
      isResponded = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ s: status, h: headers, b: base64Body }));
    };

    try {
      const bodyStr = Buffer.concat(bodyParts).toString();
      if (!bodyStr) return sendResponse(500, {}, Buffer.from("empty").toString('base64'));

      const data = JSON.parse(bodyStr);
      if (!data.u) return sendResponse(500, {}, Buffer.from("no url").toString('base64'));

      const targetUrl = new URL(data.u);
      const isHttps = targetUrl.protocol === 'https:';

      const slow = isSlowHost(targetUrl.hostname);

      const options = {
        method: data.m || 'GET',
        headers: {},
        agent: isHttps ? httpsAgent : httpAgent,
        timeout: slow ? TIMEOUT_SLOW_MS : TIMEOUT_FAST_MS
      };

      if (data.h) {
        for (const [key, value] of Object.entries(data.h)) {
          const lowerKey = key.toLowerCase();
          if (!BAD_HEADERS.includes(lowerKey)) {
            options.headers[key] = value;
          }
        }
      }

      const proxyReq = (isHttps ? https : http).request(targetUrl, options, (proxyRes) => {
        const responseHeaders = {};
        Object.keys(proxyRes.headers).forEach(key => {
          if (key.toLowerCase() !== 'transfer-encoding') {
            responseHeaders[key] = proxyRes.headers[key];
          }
        });

        let chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));

        proxyRes.on('end', () => {
          sendResponse(
            proxyRes.statusCode,
            responseHeaders,
            Buffer.concat(chunks).toString('base64')
          );
        });
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        sendResponse(504, {}, Buffer.from("Target Timeout").toString('base64'));
      });

      proxyReq.on('error', err => {
        sendResponse(502, {}, Buffer.from("Relay Error: " + err.message).toString('base64'));
      });

      if (data.b && !['GET', 'HEAD'].includes(options.method)) {
        proxyReq.write(Buffer.from(data.b, 'base64'));
      }

      proxyReq.end();

    } catch (err) {
      sendResponse(500, {}, Buffer.from("Relay logic error").toString('base64'));
    }
  });
});

server.listen(8081, '0.0.0.0', () => {
  console.log("Rock-Solid Worker running on port 8081");
});
