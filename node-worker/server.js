const http = require('http');
const https = require('https');
const dns = require('dns');
const url = require('url');

dns.setDefaultResultOrder('ipv4first');

// ========== کانفیگ upstream proxy ==========  v1.2
const UPSTREAM_PROXY = 'http://127.0.0.1:8087'; // آدرس و پورت Warp
const USE_UPSTREAM = true; // اگر false باشه مستقیم متصل میشه
// ===========================================

const BAD_HEADERS = [
  'host', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto',
  'cf-connecting-ip', 'connection', 'keep-alive', 'proxy-connection'
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

// تابع ساخت agent با proxy
function createAgent(proxyUrl, isHttps) {
  if (!proxyUrl) return null;
  
  const proxyOptions = url.parse(proxyUrl);
  
  if (isHttps) {
    // برای HTTPS از tunnel-agent استفاده می‌کنیم
    const tunnel = require('tunnel');
    return tunnel.httpsOverHttp({
      proxy: {
        host: proxyOptions.hostname,
        port: parseInt(proxyOptions.port),
      },
      rejectUnauthorized: false
    });
  } else {
    // برای HTTP
    return new http.Agent({
      keepAlive: true,
      proxy: proxyOptions
    });
  }
}

let httpAgent, httpsAgent;

if (USE_UPSTREAM) {
  // ساخت agent های مجزا برای HTTP و HTTPS
  httpsAgent = createAgent(UPSTREAM_PROXY, true);
  httpAgent = new http.Agent({ keepAlive: true });
  console.log(`✅ Using upstream proxy: ${UPSTREAM_PROXY}`);
} else {
  const agentOptions = { rejectUnauthorized: false, keepAlive: true };
  httpAgent = new http.Agent(agentOptions);
  httpsAgent = new https.Agent(agentOptions);
  console.log(`✅ Direct connection (no proxy)`);
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
  
  req.on('error', (err) => {
    console.error('Request error:', err);
  });
  
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
      if (!bodyStr) {
        return sendResponse(400, {}, Buffer.from("empty body").toString('base64'));
      }
      
      const data = JSON.parse(bodyStr);
      if (!data.u) {
        return sendResponse(400, {}, Buffer.from("no url provided").toString('base64'));
      }
      
      const targetUrl = new URL(data.u);
      const isHttps = targetUrl.protocol === 'https:';
      const slow = isSlowHost(targetUrl.hostname);
      
      // ساخت options درخواست
      const options = {
        method: data.m || 'GET',
        headers: {},
        timeout: slow ? TIMEOUT_SLOW_MS : TIMEOUT_FAST_MS,
        rejectUnauthorized: false
      };
      
      // تنظیم agent مناسب
      if (USE_UPSTREAM && isHttps && httpsAgent) {
        options.agent = httpsAgent;
      } else if (USE_UPSTREAM && !isHttps) {
        // برای HTTP از agent پیشفرض استفاده می‌کنیم
        options.agent = httpAgent;
      } else if (!USE_UPSTREAM) {
        options.agent = isHttps ? httpsAgent : httpAgent;
      }
      
      // اضافه کردن هدرهای درخواست
      if (data.h) {
        for (const [key, value] of Object.entries(data.h)) {
          const lowerKey = key.toLowerCase();
          if (!BAD_HEADERS.includes(lowerKey)) {
            options.headers[key] = value;
          }
        }
      }
      
      // هدر host را تنظیم کن
      options.headers.host = targetUrl.host;
      
      console.log(`📤 ${options.method} ${targetUrl.href} (slow: ${slow})`);
      
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
          console.log(`📥 Response ${proxyRes.statusCode} for ${targetUrl.href}`);
          sendResponse(
            proxyRes.statusCode,
            responseHeaders,
            Buffer.concat(chunks).toString('base64')
          );
        });
      });
      
      proxyReq.on('timeout', () => {
        console.error(`⏰ Timeout for ${targetUrl.href}`);
        proxyReq.destroy();
        sendResponse(504, {}, Buffer.from("Target Timeout").toString('base64'));
      });
      
      proxyReq.on('error', (err) => {
        console.error(`❌ Proxy error for ${targetUrl.href}:`, err.message);
        sendResponse(502, {}, Buffer.from("Relay Error: " + err.message).toString('base64'));
      });
      
      if (data.b && !['GET', 'HEAD'].includes(options.method)) {
        const bodyBuffer = Buffer.from(data.b, 'base64');
        console.log(`📦 Sending body: ${bodyBuffer.length} bytes`);
        proxyReq.write(bodyBuffer);
      }
      
      proxyReq.end();
      
    } catch (err) {
      console.error('Server error:', err.message);
      sendResponse(500, {}, Buffer.from("Relay logic error: " + err.message).toString('base64'));
    }
  });
});

server.listen(8081, '0.0.0.0', () => {
  console.log(`🚀 Relay server running on port 8081`);
  console.log(`📡 Upstream proxy: ${USE_UPSTREAM ? UPSTREAM_PROXY : 'Disabled'}`);
  console.log(`🔧 DNS order: ipv4first`);
});
