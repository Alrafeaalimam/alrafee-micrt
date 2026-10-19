import { buildApp } from '../dist/presentation/http/server.js';

let appPromise;

export default async function handler(request, response) {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit('request', request, response);
}
