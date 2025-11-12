import { Command, Handler, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  EmbedBuilder,
  Events,
  Interaction,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  InteractionReplyOptions,
  GuildMember,
} from 'discord.js';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getArtistsApi } from '@jellyfin/sdk/lib/utils/api/artists-api';
import {
  BaseItemKind,
  ItemFilter,
} from '@jellyfin/sdk/lib/generated-client/models';

import { JellyfinSearchService } from '../../clients/jellyfin/jellyfin.search.service';
import { DiscordMessageService } from '../../clients/discord/discord.message.service';
import { DiscordVoiceService } from '../../clients/discord/discord.voice.service';
import { PlaybackService } from '../../playback/playback.service';

type Tab = 'artists' | 'albums' | 'songs';

@Injectable()
@Command({
  name: 'browse',
  description: 'Browse your Jellyfin music library (Artists / Albums / Songs).',
})
export class BrowseMusicCommand {
  private readonly logger = new Logger(BrowseMusicCommand.name);
  private artistPageCache = new Map<string, number>();
  private albumPageCache = new Map<string, number>();
  private songPageCache = new Map<string, number>();

  constructor(
    private readonly jellyfinSearchService: JellyfinSearchService,
    private readonly discordMessageService: DiscordMessageService,
    private readonly discordVoiceService: DiscordVoiceService,
    private readonly playbackService: PlaybackService,
  ) {
    setInterval(
      () => {
        this.artistPageCache.clear();
        this.albumPageCache.clear();
        this.songPageCache.clear();
      },
      30 * 60 * 1000,
    );
  }

  @Handler()
  async handle(interaction: CommandInteraction) {
    await interaction.reply({
      embeds: [this.buildHomeEmbed()],
      components: [this.buildMainMenuButtons()],
      ephemeral: true,
    });
  }

  private buildHomeEmbed() {
    return new EmbedBuilder()
      .setTitle('🎶 Jellyfin Music Browser')
      .setColor('#00AAFF')
      .setDescription(
        [
          'Browse your Jellyfin music library below. Choose a category to begin:',
          '',
          '🎤 **Artists** — explore performers',
          '💿 **Albums** — explore records',
          '🎵 **Songs** — explore tracks',
          '',
          '_Tip:_ Selecting an item from a dropdown will now play it immediately!',
        ].join('\n'),
      );
  }

  private buildMainMenuButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('browse:artists:0')
        .setLabel('🎤 Artists')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('browse:albums:0')
        .setLabel('💿 Albums')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('browse:songs:0')
        .setLabel('🎵 Songs')
        .setStyle(ButtonStyle.Success),
    );
  }

  private buildNavRow(tab: Tab, page: number, total: number, limit: number) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('browse:home')
        .setLabel('🏠 Back to Menu')
        .setStyle(ButtonStyle.Primary),
    );

    if (page > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`browse:${tab}:${page - 1}`)
          .setLabel('⬅️ Prev')
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if ((page + 1) * limit < total) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`browse:${tab}:${page + 1}`)
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    return row;
  }

  @On(Events.InteractionCreate)
  async onInteraction(interaction: Interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    try {
      if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === 'browse:home') {
          await interaction.update({
            embeds: [this.buildHomeEmbed()],
            components: [this.buildMainMenuButtons()],
          });
          return;
        }

        const parts = id.split(':');
        if (parts.length === 3 && parts[0] === 'browse') {
          const tab = parts[1] as Tab;
          const page = parseInt(parts[2], 10) || 0;
          if (tab === 'artists')
            return await this.showArtists(interaction, page);
          if (tab === 'albums') return await this.showAlbums(interaction, page);
          if (tab === 'songs') return await this.showSongs(interaction, page);
        }

        if (
          parts.length === 4 &&
          parts[0] === 'artist' &&
          parts[2] === 'tracks'
        ) {
          const artistId = parts[1];
          const page = parseInt(parts[3], 10) || 0;
          return await this.showArtistTracks(interaction, artistId, page);
        }
      }

      if (interaction.isStringSelectMenu()) {
        const [kind, scope] = interaction.customId.split(':');
        if (kind !== 'select') return;

        if (scope === 'artists') {
          const chosen = interaction.values[0];
          const [, artistId] = chosen.split(':');
          return await this.showArtistTracks(interaction, artistId, 0);
        }

        if (scope === 'artistTracks') {
          const raw = interaction.values[0];
          const [, artistId, page, , trackId] = raw.split(':');
          return await this.playItem(interaction, 'song', trackId);
        }

        if (scope === 'albums') {
          const chosen = interaction.values[0];
          const [, , albumId] = chosen.split(':');
          return await this.playItem(interaction, 'album', albumId);
        }

        if (scope === 'songs') {
          const chosen = interaction.values[0];
          const [, , songId] = chosen.split(':');
          return await this.playItem(interaction, 'song', songId);
        }
      }
    } catch (err) {
      this.logger.error(`❌ Interaction handling error: ${err}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ Something went wrong handling this interaction.',
          ephemeral: true,
        });
      }
    }
  }

  private async getMusicLibraryId(): Promise<string | undefined> {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const { data } = await itemsApi.getItems({ userId, recursive: false });
    const lib = (data.Items || []).find(
      (i) =>
        i.CollectionType === 'music' ||
        (i.Name && i.Name.toLowerCase().includes('music')),
    );
    if (!lib) this.logger.warn('⚠️ No music library found.');
    return lib?.Id;
  }

  private truncate(txt: string | undefined | null, max: number) {
    const s = txt ?? '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  private escapeMd(text: string) {
    return text
      .replace(/([_*~`>])/g, '\\$1')
      .replace(/\n/g, ' ')
      .trim();
  }

  private buildNumberedDropdown(
    customId: string,
    items: { label: string; value: string }[],
  ) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select to play…');
    let pageNum = 0;
    const parts = customId.split(':');
    const pagePart = parts[parts.length - 1];
    if (!isNaN(parseInt(pagePart, 10))) pageNum = parseInt(pagePart, 10);
    const startAbsIndex = pageNum * 20;

    items.slice(0, 25).forEach((opt, i) => {
      const absNum = startAbsIndex + i + 1;
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${absNum} — ${this.truncate(opt.label, 90)}`)
          .setValue(opt.value),
      );
    });

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select,
    );
  }

  private async showArtists(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    page = 0,
  ) {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const artistsApi = getArtistsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const parentId = await this.getMusicLibraryId();
    const limit = 20;

    let { data } = await artistsApi.getArtists({
      userId,
      parentId,
      startIndex: page * limit,
      limit,
    });
    if (!data.Items?.length) {
      const fb = await artistsApi.getAlbumArtists({
        userId,
        parentId,
        startIndex: page * limit,
        limit,
      });
      data = fb.data;
    }

    const items = data.Items || [];
    const total = data.TotalRecordCount ?? items.length;
    const list = items
      .map(
        (a, idx) =>
          `**${page * limit + idx + 1}.** 🎤 **${a.Name ?? 'Unknown Artist'}**`,
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🎤 Artists — Page ${page + 1}`)
      .setColor('#00cc88')
      .setDescription(items.length ? list : 'No artists found.');

    this.artistPageCache.set(interaction.user.id, page);

    const nav = this.buildNavRow('artists', page, total, limit);
    const ddOptions = items.map((a) => ({
      label: a.Name ?? 'Unknown Artist',
      value: `artists:${a.Id}`,
    }));
    const selectRow = this.buildNumberedDropdown(
      `select:artists:${page}`,
      ddOptions,
    );
    await interaction.update({ embeds: [embed], components: [nav, selectRow] });
  }

  private async showArtistTracks(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    artistId: string,
    page = 0,
  ) {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const { data } = await itemsApi.getItems({
      includeItemTypes: [BaseItemKind.Audio],
      userId,
      recursive: true,
      sortBy: ['SortName'],
      filters: [ItemFilter.IsNotFolder],
      artistIds: [artistId],
    });

    const allTracks = data.Items || [];
    const limit = 20;
    const start = page * limit;
    const pageTracks = allTracks.slice(start, start + limit);
    const total = allTracks.length;
    if (!pageTracks.length) {
      await interaction.update({
        embeds: [
          this.discordMessageService.buildMessage({
            title: 'No tracks found for this artist.',
          }),
        ],
        components: [],
      });
      return;
    }

    const artistName =
      this.truncate(
        (typeof allTracks[0]?.Artists?.[0] === 'string'
          ? allTracks[0]?.Artists?.[0]
          : (allTracks[0]?.Artists?.[0] as any)?.Name ||
            (typeof allTracks[0]?.AlbumArtists?.[0] === 'string'
              ? allTracks[0]?.AlbumArtists?.[0]
              : (allTracks[0]?.AlbumArtists?.[0] as any)?.Name) ||
            'Artist') as string,
        64,
      ) ?? 'Artist';

    const list = pageTracks
      .map(
        (t, idx) =>
          `**${start + idx + 1}.** 🎵 **${this.truncate(t.Name ?? 'Unknown Track', 52)}**${
            t.Album ? ` — _${this.truncate(t.Album, 38)}_` : ''
          }`,
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🎶 ${artistName} — Tracks (Page ${page + 1})`)
      .setColor('#aa66ff')
      .setDescription(list);

    const cachedPage = this.artistPageCache.get(interaction.user.id) ?? 0;

    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`browse:artists:${cachedPage}`)
        .setLabel('🔙 Artists')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`artist:${artistId}:tracks:${Math.max(page - 1, 0)}`)
        .setLabel('⬅️ Prev')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`artist:${artistId}:tracks:${page + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled((page + 1) * limit >= total),
    );

    const key = `${interaction.user.id}:${artistId}`;
    this.artistPageCache.set(key, page);

    const ddOptions = pageTracks.map((t) => ({
      label: `${t.Name ?? 'Unknown Track'} — ${t.Album ?? ''}`,
      value: `artistTracks:${artistId}:${page}:track:${t.Id}`,
    }));
    const selectRow = this.buildNumberedDropdown(
      `select:artistTracks:${artistId}:${page}`,
      ddOptions,
    );

    await interaction.update({ embeds: [embed], components: [nav, selectRow] });
  }

  private async showAlbums(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    page = 0,
  ) {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const parentId = await this.getMusicLibraryId();
    const limit = 20;

    const { data } = await itemsApi.getItems({
      includeItemTypes: [BaseItemKind.MusicAlbum],
      userId,
      parentId,
      recursive: true,
      startIndex: page * limit,
      limit,
      sortBy: ['SortName'],
    });

    const items = data.Items || [];
    const total = data.TotalRecordCount ?? items.length;
    this.albumPageCache.set(interaction.user.id, page);

    const list = items
      .map((a, idx) => {
        const num = page * limit + idx + 1;
        const name = this.escapeMd(
          this.truncate(a.Name ?? 'Unknown Album', 52),
        );
        const artist = (a.AlbumArtists || a.Artists || [])
          .map((x: any) => (typeof x === 'string' ? x : x?.Name || ''))
          .filter(Boolean)
          .join(', ');
        const artistTxt = artist
          ? ` — _${this.escapeMd(this.truncate(artist, 40))}_`
          : '';
        return `**${num}.** 💿 **${name}**${artistTxt}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`💿 Albums — Page ${page + 1}`)
      .setColor('#aa66ff')
      .setDescription(items.length ? list : 'No albums found.');

    const nav = this.buildNavRow('albums', page, total, limit);
    const ddOptions = items.map((a) => ({
      label: a.Name ?? 'Unknown Album',
      value: `albums:${page}:${a.Id}`,
    }));
    const selectRow = this.buildNumberedDropdown(
      `select:albums:${page}`,
      ddOptions,
    );
    await interaction.update({ embeds: [embed], components: [nav, selectRow] });
  }

  private async showSongs(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    page = 0,
  ) {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const parentId = await this.getMusicLibraryId();
    const limit = 20;

    const { data } = await itemsApi.getItems({
      includeItemTypes: [BaseItemKind.Audio],
      userId,
      parentId,
      recursive: true,
      startIndex: page * limit,
      limit,
      sortBy: ['SortName'],
    });

    const items = data.Items || [];
    const total = data.TotalRecordCount ?? items.length;
    this.songPageCache.set(interaction.user.id, page);

    const list = items
      .map((s, idx) => {
        const num = page * limit + idx + 1;
        const name = this.escapeMd(this.truncate(s.Name ?? 'Unknown Song', 54));
        const artist = (s.AlbumArtists || s.Artists || [])
          .map((x: any) => (typeof x === 'string' ? x : x?.Name || ''))
          .filter(Boolean)
          .join(', ');
        const artistTxt = artist
          ? ` — _${this.escapeMd(this.truncate(artist, 40))}_`
          : '';
        return `**${num}.** 🎵 **${name}**${artistTxt}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🎵 Songs — Page ${page + 1}`)
      .setColor('#3399ff')
      .setDescription(items.length ? list : 'No songs found.');

    const nav = this.buildNavRow('songs', page, total, limit);
    const ddOptions = items.map((s) => ({
      label: s.Name ?? 'Unknown Song',
      value: `songs:${page}:${s.Id}`,
    }));
    const selectRow = this.buildNumberedDropdown(
      `select:songs:${page}`,
      ddOptions,
    );
    await interaction.update({ embeds: [embed], components: [nav, selectRow] });
  }

  private async playItem(
    interaction: StringSelectMenuInteraction,
    entity: string,
    itemId: string,
  ) {
    const api = this.jellyfinSearchService['jellyfinService'].getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinSearchService['jellyfinService'].getUserId();
    const { data } = await itemsApi.getItems({ ids: [itemId], userId });
    const item = data.Items?.[0];
    if (!item?.Id) {
      await interaction.reply({
        content: '⚠️ Item not found.',
        ephemeral: true,
      });
      return;
    }

    const itemIdStr = item.Id as string;
    const guildMember = interaction.member as GuildMember;
    const tryResult =
      this.discordVoiceService.tryJoinChannelAndEstablishVoiceConnection(
        guildMember,
      );
    if (!tryResult.success) {
      await interaction.reply(tryResult.reply as InteractionReplyOptions);
      return;
    }

    const searchItem = await this.jellyfinSearchService.getById(itemIdStr, [
      BaseItemKind.Audio,
      BaseItemKind.MusicAlbum,
      BaseItemKind.Playlist,
    ]);
    if (!searchItem) {
      await interaction.reply({
        content: '⚠️ Could not resolve playable item.',
        ephemeral: true,
      });
      return;
    }

    const tracks = await searchItem.toTracks(this.jellyfinSearchService);
    this.playbackService.getPlaylistOrDefault().enqueueTracks(tracks, false);

    const remoteImage = tracks[0]?.getRemoteImages()?.[0];
    await interaction.reply({
      embeds: [
        this.discordMessageService.buildMessage({
          title: `▶️ ${item.Name}`,
          description: `Added ${tracks.length} track${tracks.length > 1 ? 's' : ''} to your playlist.`,
          mixin(embed) {
            if (remoteImage?.Url) embed.setThumbnail(remoteImage.Url);
            return embed;
          },
        }),
      ],
      ephemeral: true,
    });
  }
}
