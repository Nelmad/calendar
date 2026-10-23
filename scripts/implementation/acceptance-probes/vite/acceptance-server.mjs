// Harness-only SSR server for the acceptance page; same shape as the example's server.mjs.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {render} from './dist-acceptance-server/entry-server.js';

const template = readFileSync('dist-acceptance/acceptance.html', 'utf8'), port = Number(process.env.PORT ?? 4173);
createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (/^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname)) {
        response.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(readFileSync(resolve('dist-acceptance', url.pathname.slice(1)))); return;
    }
    if (url.pathname === '/clock') { response.end(new Date().toISOString()); return; }
    if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(template.replace('<!--app-html-->', render(url.search)));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
