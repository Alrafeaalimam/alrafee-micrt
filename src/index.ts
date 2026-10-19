// Vercel detects Fastify applications from this conventional entry point.
// The application itself remains defined in the HTTP presentation layer.
import { startServer } from './presentation/http/server.js';

void startServer();
