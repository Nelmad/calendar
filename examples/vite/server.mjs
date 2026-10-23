// Production SSR server for the built example: `npm run build && npm start`.
import {createServer} from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {render} from './dist-server/entry-server.js';

const template = readFileSync('dist/index.html', 'utf8'), port = Number(process.env.PORT ?? 4173);
// JSON inside <script> must not be able to close the element.
const serialize = value => JSON.stringify(value).replace(/</g, '\\u003c');
createServer(async (request, response) => {
    const {pathname} = new URL(request.url ?? '/', 'http://localhost');
    if (/^\/assets\/[\w.-]+\.(?:js|css)$/.test(pathname)) {
        // A stale asset URL (an old page after a redeploy) is a 404, not a crash.
        const file = resolve('dist', pathname.slice(1));
        if (!existsSync(file)) { response.writeHead(404); response.end(); return; }
        response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(readFileSync(file)); return;
    }
    if (!['/', '/quick-start', '/workspace'].includes(pathname)) { response.writeHead(404); response.end(); return; }
    try {
        const {html, prefetch} = await render(pathname);
        const data = prefetch ? `<script id="app-data" type="application/json">${serialize(prefetch)}</script>` : '';
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(template.replace('<!--app-data-->', data).replace('<!--app-html-->', html));
    } catch (error) {
        console.error(error); response.writeHead(500); response.end();
    }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
