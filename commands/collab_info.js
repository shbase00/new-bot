// commands/collab_info.js
// Shows detailed info for a specific collab

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const DB_PATH = process.env.DB_PATH || '/data/collabs.db';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab_info')
    .setDescription('Show detailed info for a specific collab')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name of the collab (or part of it)')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const Database = require('better-sqlite3');
      const db = new Database(DB_PATH, { readonly: true });

      const search = `%${interaction.options.getString('name')}%`;

      const collab = db.prepare(`
        SELECT * FROM collabs WHERE name LIKE ? LIMIT 1
      `).get(search);

      if (!collab) {
        db.close();
        return await interaction.editReply({ content: `❌ No collab found matching that name.` });
      }

      // Count submissions for this collab
      let submissionCount = 0;
      let walletCount = 0;
      try {
        submissionCount = db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE collab_id = ?`).get(collab.id).count;
        walletCount = db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE collab_id = ? AND wallet_sheet IS NOT NULL AND wallet_sheet != ''`).get(collab.id).count;
      } catch (e) { /* ignore if collab_id not in submissions */ }

      db.close();

      // Status emoji
      const statusEmoji = collab.status === 'active' ? '🟢' : '🔴';

      // Format deadline
      let deadlineText = 'Not set';
      if (collab.deadline) {
        const d = new Date(collab.deadline);
        deadlineText = isNaN(d) ? collab.deadline : `<t:${Math.floor(d.getTime() / 1000)}:F>`;
      }

      // Format mint date
      let mintText = 'Not set';
      if (collab.mint_date) {
        const m = new Date(collab.mint_date);
        mintText = isNaN(m) ? collab.mint_date : `<t:${Math.floor(m.getTime() / 1000)}:D>`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} ${collab.name}`)
        .setColor(collab.status === 'active' ? 0x57F287 : 0xED4245)
        .setTimestamp()
        .addFields(
          { name: '📋 Description', value: collab.description || 'None', inline: false },
          { name: '🎯 Status', value: `${statusEmoji} ${collab.status || 'Unknown'}`, inline: true },
          { name: '🎟️ Spots', value: String(collab.spots || 'N/A'), inline: true },
          { name: '💰 Price', value: collab.price || 'N/A', inline: true },
          { name: '📦 Supply', value: String(collab.supply || 'N/A'), inline: true },
          { name: '📅 Mint Date', value: mintText, inline: true },
          { name: '⏰ Deadline', value: deadlineText, inline: true },
          { name: '📝 Submissions', value: String(submissionCount), inline: true },
          { name: '💰 Wallet Sheets', value: String(walletCount), inline: true },
          { name: '📌 Requirements', value: collab.requirements || 'None', inline: false },
        )
        .setFooter({ text: `Collab ID: ${collab.id}` });

      if (collab.image) embed.setThumbnail(collab.image);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[collab_info] Error:', error);
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  },
};
