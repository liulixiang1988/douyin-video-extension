import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/') {
    const html = fs.readFileSync(path.join(root,'extension/popup.html'),'utf8')
      .replace('href="popup.css"','href="/extension/popup.css"')
      .replace('src="popup.js"','src="/preview/mock.js"');
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  if (!/^\/(extension|preview)\/[a-zA-Z0-9_./-]+$/.test(url.pathname)) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(root, '.'+url.pathname);
  if (!file.startsWith(root+path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const content = fs.readFileSync(file);
    const type = file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/plain';
    res.writeHead(200, {'Content-Type':type+'; charset=utf-8'}); res.end(content);
  } catch { res.writeHead(404); res.end(); }
}).listen(8765,'127.0.0.1',()=>console.log('Popup preview: http://127.0.0.1:8765/?case=locked (simulated downloads)'));
