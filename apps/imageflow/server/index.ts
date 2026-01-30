import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { handleWebSocket } from './wsHandler';
import { sessionManager } from './sessionManager';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/claude' });

const PORT = process.env.PORT || 3002;

// Enable CORS for dev
app.use(cors());

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'ok', sessions: sessionManager.getAllSessions().length });
});

// List sessions endpoint
app.get('/api/sessions', (_, res) => {
  res.json(sessionManager.getAllSessions());
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  handleWebSocket(ws);
});

// Graceful shutdown
const shutdown = () => {
  sessionManager.destroyAllSessions();
  wss.close();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  console.log(`Claude Code server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws/claude`);
});
