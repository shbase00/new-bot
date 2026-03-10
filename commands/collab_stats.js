// commands/collab_stats.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab_stats')
    .setDescription('Show overall collab statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const totalCollabs   = db.prepare(`SELECT COUNT(*) as count FROM collabs`).get().count;
      const activeCollabs  = db.prepare(`SELECT COUNT(*) as count FROM collabs WHERE status = 'active'`).get().count;
      const closedCollabs  = db.prepare(`SELECT COUNT(*) as count FROM collabs WHERE status = 'closed'`).get().count;
      const totalSubmissions = db.prepare(`SELECT COUNT(*) as count FROM submissions`).get().count;

      // Wallet sheets — uses sheet_link column (matching your modals.js)
      let walletSheets = 0;
      try {
        walletSheets = db.prepare(
          `SELECT COUNT(*) as count FROM submissions WHERE sheet_link IS NOT NULL AND sheet_link != ''`
        ).get().count;
      } catch (e) {
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