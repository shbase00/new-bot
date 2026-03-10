// commands/export_data.js
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const db = require('../db');

const DB_PATH = process.env.DB_PATH || require('path').join(__dirname, '..', 'collabs.db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export_data')
    .setDescription('Export database as CSV or backup file (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('What to export')
        .setRequired(true)
        .addChoices(
          { name: '📋 Collabs CSV',              value: 'collabs_csv' },
          { name: '📋 Submissions CSV',          value: 'submissions_csv' },
          { name: '💾 Full Database Backup (.db)', value: 'database' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const type = interaction.options.getString('type');
      let fileBuffer, fileName, description;

      if (type === 'collabs_csv') {
        const rows = db.prepare('SELECT * FROM collabs').all();
        fileBuffer = Buffer.from(toCSV(rows), 'utf8');
        fileName = `collabs_${dateStamp()}.csv`;
        description = `✅ Exported **${rows.length}** collabs.`;

      } else if (type === 'submissions_csv') {
        const rows = db.prepare('SELECT * FROM submissions').all();
        fileBuffer = Buffer.from(toCSV(rows), 'utf8');
        fileName = `submissions_${dateStamp()}.csv`;
        description = `✅ Exported **${rows.length}** submissions.`;

      } else if (type === 'database') {
        fileBuffer = fs.readFileSync(DB_PATH);
        fileName = `collabs_backup_${dateStamp()}.db`;
        description = `✅ Full database backup ready.`;
      }

      const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

      await interaction.editReply({ content: description, files: [attachment] });

    } catch (error) {
      console.error('[export_data] Error:', error);
      await interaction.editReply({ content: `❌ Export failed: ${error.message}` });
    }
  },
};

function toCSV(rows) {
  if (!rows || rows.length === 0) return 'No data found.\n';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h] == null ? '' : String(row[h]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}