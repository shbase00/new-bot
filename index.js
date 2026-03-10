// ═══════════════════════════════════════════════════════════════════
//  HOW TO USE THIS FILE
//
//  This is NOT a replacement for your existing index.js.
//  It shows you exactly WHAT TO ADD to your existing index.js
//  Read the comments and paste each section into the right place.
// ═══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────
// STEP A: Add these lines near the TOP of your index.js
//         (alongside your other require() lines)
// ──────────────────────────────────────────────────────────────────

const { startAutoBackup } = require('./utils/autoBackup');
const { setupErrorHandlers } = require('./utils/errorHandler');
const buttonHandler = require('./interactions/buttonHandler');

// ──────────────────────────────────────────────────────────────────
// STEP B: When loading commands, make sure this section is present
//         (you likely already have something like this)
//         If you don't, add this block.
// ──────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

// Create a Collection to store commands
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// ──────────────────────────────────────────────────────────────────
// STEP C: Register the button handler as an event listener
//         Add this line somewhere AFTER client is created
// ──────────────────────────────────────────────────────────────────

client.on(buttonHandler.name, (...args) => buttonHandler.execute(...args));

// ──────────────────────────────────────────────────────────────────
// STEP D: Inside your client.once('ready', ...) block, add:
// ──────────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);

  // ADD THESE TWO LINES:
  setupErrorHandlers(client);
  startAutoBackup(client);
});

// ──────────────────────────────────────────────────────────────────
// STEP E: Make sure your interactionCreate handler calls commands.
//         If you already have one, check it looks like this.
//         The errorHandler.js ALSO handles this — so only keep ONE.
// ──────────────────────────────────────────────────────────────────

// NOTE: If you already have an interactionCreate listener that handles
// slash commands, you do NOT need to add this one.
// The error handler in utils/errorHandler.js handles it automatically.
// But if you have NO interactionCreate handler yet, add this:

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Command Error] /${interaction.commandName}:`, error.message);
    const msg = { content: `❌ Error: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});
