import { app } from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Friendly startup summary
console.log('----------------------------------------------------');
console.log('🚀 Z-Pilot AI Assistant Backend');
console.log('----------------------------------------------------');

if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '' || GEMINI_API_KEY === 'your_gemini_api_key_here') {
  console.warn('⚠️  WARNING: GEMINI_API_KEY is not configured in backend/.env');
  console.warn('   Get a key from https://aistudio.google.com/ and add it to backend/.env');
  console.warn('   The server will start, but AI planning requests will return setup instructions.');
} else {
  console.log('✅ Gemini API Key detected.');
  console.log(`🧠 Model configured: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}`);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`⚡ Server running on http://${HOST}:${PORT}`);
  console.log(`🩺 Health check: http://${HOST}:${PORT}/api/health`);
  console.log('----------------------------------------------------');
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Gracefully shutting down Z-Pilot backend...');
  server.close(() => {
    console.log('👋 Server stopped.');
    process.exit(0);
  });
});
