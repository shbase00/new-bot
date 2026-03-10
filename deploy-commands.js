// deploy-commands.js
// Run this once to register all slash commands with Discord
// Usage: node deploy-commands.js

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional: deploy to one server instantly

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in your .env file!');
  process.exit(1);
}

// ── Load all command files from /commands folder ──────────────────────────────
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded command: /${command.data.name}`);
  }
}

// ── Deploy to Discord ─────────────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`\n🚀 Deploying ${commands.length} commands...`);

    let data;
    if (guildId) {
      // Guild (server) deploy — instant, good for testing
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✅ Deployed ${data.length} commands to guild ${guildId}`);
    } else {
      // Global deploy — takes up to 1 hour to appear everywhere
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`✅ Deployed ${data.length} commands globally`);
    }

  } catch (error) {
    console.error('❌ Deploy failed:', error.message);
  }
})();
