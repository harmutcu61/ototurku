// Ototurkuaz fiyat sayfası + admin paneli — tek dosyalık sunucu.
// Hiçbir npm paketi gerekmez (sadece Node.js'in kendi modülleri kullanılır).
// Çalıştırmak için: node server.js
// Sonra tarayıcıda: http://localhost:3000  (müşteri sayfası)
//                    http://localhost:3000/admin  (fiyat düzenleme paneli)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Admin paneline giriş şifresi (PIN). BUNU MUTLAKA DEĞİŞTİRİN.
const ADMIN_PIN = '2580';

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'prices.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  // Basit path-traversal koruması
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (safePath === '/' || safePath === '') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  if (safePath === '/admin') {
    filePath = path.join(PUBLIC_DIR, 'admin.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Bulunamadı');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { // 2MB güvenlik sınırı
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ---- API: fiyat verisini oku ----
  if (url.pathname === '/api/prices' && req.method === 'GET') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) return sendJSON(res, 500, { error: 'Veri okunamadı' });
      try {
        sendJSON(res, 200, JSON.parse(data));
      } catch (e) {
        sendJSON(res, 500, { error: 'Veri bozuk (JSON parse hatası)' });
      }
    });
    return;
  }

  // ---- API: fiyat verisini kaydet (admin PIN gerekli) ----
  if (url.pathname === '/api/prices' && req.method === 'POST') {
    const pin = req.headers['x-admin-pin'];
    if (pin !== ADMIN_PIN) {
      sendJSON(res, 401, { error: 'Hatalı PIN' });
      return;
    }
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.brands || !parsed.sections) {
        sendJSON(res, 400, { error: 'Geçersiz veri yapısı' });
        return;
      }
      fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8', (err) => {
        if (err) return sendJSON(res, 500, { error: 'Kaydedilemedi' });
        sendJSON(res, 200, { ok: true });
      });
    } catch (e) {
      sendJSON(res, 400, { error: 'JSON çözümlenemedi' });
    }
    return;
  }

  // ---- Statik dosyalar (müşteri sayfası + admin paneli) ----
  if (req.method === 'GET') {
    serveStatic(req, res, url.pathname);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 - İzin verilmeyen metod');
});

server.listen(PORT, () => {
  console.log(`Ototurkuaz sunucusu çalışıyor: http://localhost:${PORT}`);
  console.log(`Admin paneli:                  http://localhost:${PORT}/admin`);
  console.log(`Admin PIN: ${ADMIN_PIN}  (server.js içinden değiştirebilirsiniz)`);
});
