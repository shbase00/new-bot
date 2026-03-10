// commands/collab_stats.js
// Shows overall statistics for all collabs and submissions

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const DB_PATH = process.env.DB_PATH || '/data/collabs.db';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab_stats')
    .setDescription('Show overall collab statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const Database = require('better-sqlite3');
      const db = new Database(DB_PATH, { readonly: true });

      // --- Fetch stats ---
      const totalCollabs = db.prepare(`SELECT COUNT(*) as count FROM collabs`).get().count;
      const activeCollabs = db.prepare(`SELECT COUNT(*) as count FROM collabs WHERE status = 'active'`).get().count;
      const closedCollabs = db.prepare(`SELECT COUNT(*) as count FROM collabs WHERE status = 'closed'`).get().count;
      const totalSubmissions = db.prepare(`SELECT COUNT(*) as count FROM submissions`).get().count;

      // Wallet sheets = submissions that have a wallet_sheet value filled in
      let walletSheets = 0;
      try {
        walletSheets = db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE wallet_sheet IS NOT NULL AND wallet_sheet != ''`).get().count;
      } catch (e) {
        // wallet_sheet column might not exist in older schemas
        walletSheets = 'N/A';
      }

      // Top collab by submissions
      let topCollab = { name: 'N/A', count: 0 };
      try {
        const top = db.prepare(`
          SELECT c.name, COUNT(s.id) as count
          FROM collabs c
          LEFT JOIN submissions s ON s.collab_id = c.id
          GROUP BY c.id
          ORDER BY count DESC
          LIMIT 1
        `).get();
        if (top) topCollab = top;
      } catch (e) { /* ignore */ }

      db.close();

      // --- Build embed ---
      const embed = new EmbedBuilder()
        .setTitle('📊 Collab Statistics')
        .setColor(0x5865F2)
        .setTimestamp()
        .addFields(
          {
            name: '📁 Collabs',
            value: [
              `> **Total:** ${totalCollabs}`,
              `> 🟢 **Active:** ${activeCollabs}`,
              `> 🔴 **Closed:** ${closedCollabs}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '📝 Submissions',
            value: [
              `> **Total:** ${totalSubmissions}`,
              `> 💰 **Wallet Sheets:** ${walletSheets}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🏆 Most Active Collab',
            value: `> **${topCollab.name}** — ${topCollab.count} submissions`,
            inline: false,
          }
        )
        .setFooter({ text: 'Collab Manager Bot' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[collab_stats] Error:', error);
      await interaction.editReply({ content: `❌ Error fetching stats: ${error.message}` });
    }
  },
};
