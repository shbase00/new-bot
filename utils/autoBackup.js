// utils/autoBackup.js
// Runs daily and weekly automatic database backups
// Sends the backup file to your admin channel

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const DB_PATH = process.env.DB_PATH || '/data/collabs.db';
const ADMIN_CHANNEL_ID = process.env.BACKUP_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';

// ─── Start the backup scheduler ──────────────────────────────────────────────
function startAutoBackup(client) {
  if (!ADMIN_CHANNEL_ID) {
    console.warn('[autoBackup] ⚠️  No BACKUP_CHANNEL_ID set in .env — auto backup disabled.');
    return;
  }

  console.log('[autoBackup] ✅ Auto backup scheduler started.');

  // ── Daily backup: runs every 24 hours ─────────────────────────────────────
  setInterval(async () => {
    await sendBackup(client, 'daily');
  }, 24 * 60 * 60 * 1000); // 24 hours in ms

  // ── Weekly backup: runs every 7 days ──────────────────────────────────────
  setInterval(async () => {
    await sendBackup(client, 'weekly');
  }, 7 * 24 * 60 * 60 * 1000); // 7 days in ms

  // ── Send a startup backup immediately on bot launch ───────────────────────
  sendBackup(client, 'startup');
}

// ─── Send backup to admin channel ────────────────────────────────────────────
async function sendBackup(client, label) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error('[autoBackup] DB file not found at:', DB_PATH);
      return;
    }

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error('[autoBackup] Could not find admin channel:', ADMIN_CHANNEL_ID);
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `collabs_${label}_backup_${dateStr}.db`;
    const fileBuffer = fs.readFileSync(DB_PATH);

    const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

    await channel.send({
      content: `🗄️ **Auto Backup** — \`${label.toUpperCase()}\` — ${new Date().toUTCString()}\nDatabase file attached below.`,
      files: [attachment],
    });

    console.log(`[autoBackup] ✅ ${label} backup sent to channel ${ADMIN_CHANNEL_ID}`);

  } catch (error) {
    console.error('[autoBackup] ❌ Backup failed:', error.message);
  }
}

module.exports = { startAutoBackup };
