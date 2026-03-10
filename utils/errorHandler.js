// utils/errorHandler.js
// Global error handling — prevents the bot from crashing on unexpected errors

function setupErrorHandlers(client) {
  // ── Discord.js client errors ───────────────────────────────────────────────
  client.on('error', (error) => {
    console.error('[Discord Client Error]', error.message);
  });

  client.on('warn', (warning) => {
    console.warn('[Discord Warning]', warning);
  });

  // ── Node.js unhandled promise rejections ──────────────────────────────────
  // These happen when an async function throws and nothing catches it
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Promise Rejection]');
    console.error('Reason:', reason);
    // Do NOT crash — just log it
  });

  // ── Node.js uncaught exceptions ───────────────────────────────────────────
  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error.message);
    console.error(error.stack);
    // Do NOT crash — just log it
  });

  // ── Discord interaction errors ────────────────────────────────────────────
  // Catches errors thrown inside command execute() functions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands?.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Command Error] /${interaction.commandName}:`, error.message);

      const errorMsg = {
        content: `❌ **An error occurred while running this command.**\n\`${error.message}\``,
        ephemeral: true,
      };

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorMsg);
        } else {
          await interaction.reply(errorMsg);
        }
      } catch (replyError) {
        console.error('[Command Error] Could not send error message:', replyError.message);
      }
    }
  });

  console.log('[errorHandler] ✅ Global error handlers registered.');
}

module.exports = { setupErrorHandlers };
