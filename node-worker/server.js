const http = require('http');
const https = require('https');
const dns = require('dns');
const url = require('url');

dns.setDefaultResultOrder('ipv4first');

// ========== کانفیگ upstream proxy ==========
const UPSTREAM_PROXY = 'http://127.0.0.1:8087'; // آدرس و پورت Warp
const USE_UPSTREAM = true; // اگر false باشه مستقیم متصل میشه
// ===========================================

const BAD_HEADERS = [
  'host', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto',
  'cf-connecting-ip', 'connection', 'keep-alive'
];

const SLOW_SITES = [
  'gemini.google.com',
  'ai.google.dev',
  'makersuite.google.com',
  'generativelanguage.googleapis.com',
  '.googleapis.com',
  'chatgpt.com',
  '.chatgpt.com',
  'openai.com',
  '.openai.com',
  'api.openai.com',
  '.oaistatic.com',
  '.oaiusercontent.com',
];

const TIMEOUT_SLOW_MS = 55000;
const TIMEOUT_FAST_MS = 20000;

// Agent ها با پشتیبانی از proxy
let httpAgent, httpsAgent;

if (USE_UPSTREAM) {
  const proxyUrl = new url.URL(UPSTREAM_PROXY);
  const HttpsProxyAgent = require('https-proxy-agent');
  const HttpProxyAgent = require('http-proxy-agent');
  
  httpAgent = new HttpProxyAgent.HttpProxyAgent(proxyUrl);
  httpsAgent = new HttpsProxyAgent.HttpsProxyAgent(proxyUrl);
} else {
  const agentOptions = { rejectUnauthorized: false, keepAlive: true };
  httpAgent = new http.Agent(agentOptions);
  httpsAgent = new https.Agent(agentOptions);
}

function isSlowHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  
  for (const rule of SLOW_SITES) {
    const r = (rule || '').toLowerCase().trim();
    if (!r) continue;
    
    if (r.startsWith('.')) {
      if (host.endsWith(r) || host === r.slice(1)) return true;
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
      
      // تنظیم هدرها
      if (data.h) {
        for (const [key, value] of Object.entries(data.h)) {
          const lowerKey = key.toLowerCase();
          if (!BAD_HEADERS.includes(lowerKey)) {
            options.headers[key] = value;
          }
        }
      }
      
      // اضافه کردن هدرهای proxy (برای شناسایی در Warp)
      if (USE_UPSTREAM) {
        options.headers['X-Forwarded-For'] = req.socket.remoteAddress;
      }
      
      const protocol = isHttps ? https : http;
      const proxyReq = protocol.request(targetUrl, options, (proxyRes) => {
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
      sendResponse(500, {}, Buffer.from("Relay logic error: " + err.message).toString('base64'));
    }
  });
});

server.listen(8081, '0.0.0.0', () => {
  console.log(`Upstream Proxy relay running on port 8081`);
  if (USE_UPSTREAM) {
    console.log(`Using upstream proxy: ${UPSTREAM_PROXY}`);
  } else {
    console.log(`Direct connection (no proxy)`);
  }
});
