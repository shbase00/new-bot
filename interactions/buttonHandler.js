// interactions/buttonHandler.js
// Handles all button clicks (collab_panel pagination & filters)

const { sendCollabPanel } = require('../commands/collab_panel');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    // Only handle button clicks
    if (!interaction.isButton()) return;

    const id = interaction.customId;

    try {
      // ── Collab Panel: Previous page ──────────────────────────────────
      // Format: panel_prev_{filter}_{page}
      if (id.startsWith('panel_prev_')) {
        const parts = id.split('_');
        const filter = parts[2];
        const page = parseInt(parts[3], 10) - 1;
        return await sendCollabPanel(interaction, filter, page, true);
      }

      // ── Collab Panel: Next page ───────────────────────────────────────
      // Format: panel_next_{filter}_{page}
      if (id.startsWith('panel_next_')) {
        const parts = id.split('_');
        const filter = parts[2];
        const page = parseInt(parts[3], 10) + 1;
        return await sendCollabPanel(interaction, filter, page, true);
      }

      // ── Collab Panel: Switch filter ──────────────────────────────────
      // Format: panel_filter_{filter}_{page}
      if (id.startsWith('panel_filter_')) {
        const parts = id.split('_');
        const filter = parts[2];
        const page = parseInt(parts[3], 10);
        return await sendCollabPanel(interaction, filter, page, true);
      }

    } catch (error) {
      console.error('[buttonHandler] Error handling button:', id, error);
      try {
        await interaction.reply({
          content: `❌ Something went wrong. Please try again.`,
          ephemeral: true,
        });
      } catch (_) { /* already replied */ }
    }
  },
};