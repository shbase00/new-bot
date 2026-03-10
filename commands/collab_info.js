// commands/collab_info.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

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
      const search = `%${interaction.options.getString('name')}%`;

      const collab = db.prepare(`SELECT * FROM collabs WHERE name LIKE ? LIMIT 1`).get(search);

      if (!collab) {
        return await interaction.editReply({ content: `❌ No collab found matching that name.` });
      }

      // Count submissions — uses sheet_link column (matching your modals.js)
      const submissionCount = db.prepare(
        `SELECT COUNT(*) as count FROM submissions WHERE collab_id = ?`
      ).get(collab.id).count;

      const walletCount = db.prepare(
        `SELECT COUNT(*) as count FROM submissions WHERE collab_id = ? AND sheet_link IS NOT NULL AND sheet_link != ''`
      ).get(collab.id).count;

      const statusEmoji = collab.status === 'active' ? '🟢' : '🔴';

      // Deadline is stored as a unix timestamp (ms) in your bot
      let deadlineText = 'Not set';
      if (collab.deadline) {
        const secs = Math.floor(collab.deadline / 1000);
        deadlineText = `<t:${secs}:F>`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} ${collab.name}`)
        .setColor(collab.status === 'active' ? 0x57F287 : 0xED4245)
        .setTimestamp()
        .addFields(
          { name: '📋 Description', value: collab.description || 'None', inline: false },
          { name: '🎯 Status',       value: `${statusEmoji} ${collab.status || 'Unknown'}`, inline: true },
          { name: '🎟️ Spots',        value: String(collab.spots || 'N/A'), inline: true },
          { name: '💰 Price',        value: collab.price || 'N/A', inline: true },
          { name: '📦 Supply',       value: String(collab.supply || 'N/A'), inline: true },
          { name: '🗓 Mint Date',    value: collab.date || 'N/A', inline: true },
          { name: '⏰ Deadline',     value: deadlineText, inline: true },
          { name: '📝 Submissions',  value: String(submissionCount), inline: true },
          { name: '💰 Wallet Sheets',value: String(walletCount), inline: true },
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