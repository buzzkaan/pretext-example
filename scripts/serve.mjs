import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';

const root = resolve(process.cwd());
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function getContentType(filePath) {
  return contentTypes[extname(filePath)] ?? 'application/octet-stream';
}

function resolvePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  return resolve(join(root, safePath));
}

const server = createServer((request, response) => {
  const requestPath = resolvePath(request.url ?? '/');

  if (!requestPath.startsWith(root)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  if (!existsSync(requestPath) || statSync(requestPath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': getContentType(requestPath) });
  createReadStream(requestPath).pipe(response);
});

server.listen(port, () => {
  console.log(`Buzzka server running at http://localhost:${port}`);
});
