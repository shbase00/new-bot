// utils/errorHandler.js
// Global error handling — prevents the bot from crashing on unexpected errors

function setupErrorHandlers(client) {

  // ── Discord.js client errors ──────────────────────────────────────────────
  client.on('error', (error) => {
    console.error('[Discord Client Error]', error.message);
  });

  client.on('warn', (warning) => {
    console.warn('[Discord Warning]', warning);
  });

  // ── Node.js unhandled promise rejections ─────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Promise Rejection]', reason);
    // Do NOT crash — just log it
  });

  // ── Node.js uncaught exceptions ──────────────────────────────────────────
  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error.message);
    console.error(error.stack);
    // Do NOT crash — just log it
  });

  console.log('[errorHandler] ✅ Global error handlers registered.');
}

module.exports = { setupErrorHandlers };
