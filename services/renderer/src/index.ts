import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`tarmac-renderer listening on :${info.port} (gotenberg: ${config.gotenbergUrl})`);
});
