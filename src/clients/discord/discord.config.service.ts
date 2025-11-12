import {
  DiscordModuleOption,
  DiscordOptionsFactory,
} from '@discord-nestjs/core';
import { Injectable } from '@nestjs/common';
import { GatewayIntentBits } from 'discord.js';

@Injectable()
export class DiscordConfigService implements DiscordOptionsFactory {
  createDiscordOptions(): DiscordModuleOption {
    return {
      token: process.env.DISCORD_CLIENT_TOKEN ?? '',
      discordClientOptions: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildIntegrations,
          GatewayIntentBits.GuildVoiceStates,
        ],
      },
      registerCommandOptions: [
        {
          // ⚙️ Registers for your guild only
          forGuild: process.env.GUILD_ID,

          // 🧹 Automatically remove all existing guild commands
          // before registering new ones each startup
          removeCommandsBefore: true,
        },
      ],
    };
  }
}
