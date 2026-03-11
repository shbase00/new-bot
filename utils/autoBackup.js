// utils/autoBackup.js

const fs = require('fs');
const { AttachmentBuilder } = require('discord.js');

const DB_PATH        = process.env.DB_PATH || '/data/collabs.db';
const ADMIN_CHANNEL_ID = process.env.BACKUP_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';

function startAutoBackup(client) {
  if (!ADMIN_CHANNEL_ID) {
    console.warn('[autoBackup] ⚠️  No BACKUP_CHANNEL_ID set — auto backup disabled.');
    return;
  }

  console.log('[autoBackup] ✅ Auto backup scheduler started.');

  // ── Startup backup: wait 15 seconds for volume to fully mount ──
  setTimeout(async () => {
    await sendBackup(client, 'startup');
  }, 15000); // 15 second delay

  // ── Daily backup: every 24 hours ───────────────────────────────
  setInterval(async () => {
    await sendBackup(client, 'daily');
  }, 24 * 60 * 60 * 1000);

  // ── Weekly backup: every 7 days ────────────────────────────────
  setInterval(async () => {
    await sendBackup(client, 'weekly');
  }, 7 * 24 * 60 * 60 * 1000);
}

async function sendBackup(client, label) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.error(`[autoBackup] ❌ DB file not found at: ${DB_PATH}`);
      return;
    }

    // Extra check — if file is empty (volume not ready), skip
    const stat = fs.statSync(DB_PATH);
    if (stat.size === 0) {
      console.warn('[autoBackup] ⚠️  DB file is empty — skipping backup.');
      return;
    }

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error('[autoBackup] ❌ Could not find backup channel:', ADMIN_CHANNEL_ID);
      return;
    }

    const dateStr    = new Date().toISOString().slice(0, 10);
    const fileName   = `collabs_${label}_backup_${dateStr}.db`;
    const fileBuffer = fs.readFileSync(DB_PATH);

    const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

    await channel.send({
      content: `🗄️ **Auto Backup** — \`${label.toUpperCase()}\` — ${new Date().toUTCString()}`,
      files: [attachment],
    });

    console.log(`[autoBackup] ✅ ${label} backup sent.`);

  } catch (error) {
    console.error('[autoBackup] ❌ Backup failed:', error.message);
  }
}

module.exports = { startAutoBackup };