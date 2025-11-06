import { REST, Routes, PermissionFlagsBits } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const appId = process.env.DISCORD_APP_ID!;
const guildId = process.env.GUILD_ID!;
const token = process.env.DISCORD_CLIENT_TOKEN!;

// 👇 Add this right here, before you create the REST client
console.log('App ID:', appId, 'Guild ID:', guildId);
// Define your /setchannel schema manually
const commands = [
  {
    name: 'setchannel',
    description: 'Set the text channel the bot should respond in.',
    default_member_permissions: `${PermissionFlagsBits.ManageGuild}`,
    options: [
      {
        name: 'channel',
        description: 'Select the text channel to use.',
        type: 7, // Channel selector
        required: true,
      },
    ],
  },
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log(`🔄 Refreshing slash commands for guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
      body: commands,
    });
    console.log('✅ Successfully registered /setchannel manually.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();
