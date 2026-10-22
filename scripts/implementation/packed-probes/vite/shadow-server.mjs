// Harness-only static server for the Shadow DOM probe page (production build in dist-shadow).
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const port = Number(process.env.PORT ?? 4173);
createServer((request, response) => {
    const {pathname} = new URL(request.url ?? '/', 'http://localhost');
    if (/^\/assets\/[\w.-]+\.(?:js|css)$/.test(pathname)) {
        response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(readFileSync(resolve('dist-shadow', pathname.slice(1)))); return;
    }
    if (pathname !== '/') { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(readFileSync('dist-shadow/shadow.html'));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
