import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  Command,
  Handler,
  IA,
  InteractionEvent,
  On,
} from '@discord-nestjs/core';

import { RemoteImageInfo } from '@jellyfin/sdk/lib/generated-client/models';

import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common/services';

import {
  CommandInteraction,
  Events,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
} from 'discord.js';

import { DiscordMessageService } from '../../clients/discord/discord.message.service';
import { DiscordVoiceService } from '../../clients/discord/discord.voice.service';
import { JellyfinSearchService } from '../../clients/jellyfin/jellyfin.search.service';
import { SearchItem } from '../../models/search/SearchItem';
import { PlaybackService } from '../../playback/playback.service';
import { formatMillisecondsAsHumanReadable } from '../../utils/timeUtils';

import { defaultMemberPermissions } from '../../utils/environment';
import { PlayCommandParams, SearchType } from './play.params';

@Injectable()
@Command({
  name: 'play',
  description: 'Search for an item on your Jellyfin instance',
  defaultMemberPermissions,
})
export class PlayItemCommand {
  private readonly logger: Logger = new Logger(PlayItemCommand.name);

  constructor(
    private readonly jellyfinSearchService: JellyfinSearchService,
    private readonly discordMessageService: DiscordMessageService,
    private readonly discordVoiceService: DiscordVoiceService,
    private readonly playbackService: PlaybackService,
  ) {}

  @Handler()
  async handler(
    @InteractionEvent(SlashCommandPipe) dto: PlayCommandParams,
    @IA() interaction: CommandInteraction,
  ) {
    await interaction.deferReply({ ephemeral: true });

    const baseItems = PlayCommandParams.getBaseItemKinds(dto.type);

    let item: SearchItem | undefined;
    if (dto.name.startsWith('native-')) {
      item = await this.jellyfinSearchService.getById(
        dto.name.replace('native-', ''),
        baseItems,
      );
    } else {
      item = (
        await this.jellyfinSearchService.searchItem(dto.name, 1, baseItems)
      ).find((x) => x);
    }

    if (!item) {
      await interaction.followUp({
        embeds: [
          this.discordMessageService.buildMessage({
            title: 'No results found',
            description:
              '- Check for any misspellings\n- Grant me access to your desired libraries\n- Avoid special characters',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    const guildMember = interaction.member as GuildMember;

    const tryResult =
      this.discordVoiceService.tryJoinChannelAndEstablishVoiceConnection(
        guildMember,
      );

    if (!tryResult.success) {
      const replyOptions = tryResult.reply as InteractionReplyOptions;
      await interaction.editReply({
        embeds: replyOptions.embeds,
      });
      return;
    }

    const tracks = await (
      await item.toTracks(this.jellyfinSearchService)
    ).reverse();
    this.logger.debug(`Extracted ${tracks.length} tracks from the search item`);
    const reducedDuration = tracks.reduce(
      (sum, item) => sum + item.duration,
      0,
    );
    this.logger.debug(
      `Adding ${tracks.length} tracks with a duration of ${reducedDuration} ticks`,
    );
    this.playbackService.getPlaylistOrDefault().enqueueTracks(tracks, dto.next);

    const remoteImages = tracks.flatMap((track) => track.getRemoteImages());
    const remoteImage: RemoteImageInfo | undefined =
      remoteImages.length > 0 ? remoteImages[0] : undefined;

    await interaction.followUp({
      embeds: [
        this.discordMessageService.buildMessage({
          title: `Added ${
            tracks.length
          } tracks to your playlist (${formatMillisecondsAsHumanReadable(
            reducedDuration,
          )})`,
          mixin(embedBuilder) {
            if (!remoteImage?.Url) {
              return embedBuilder;
            }
            return embedBuilder.setThumbnail(remoteImage.Url);
          },
        }),
      ],
      ephemeral: true,
    });
  }

@On(Events.InteractionCreate)
async onAutocomplete(interaction: Interaction) {
  if (!interaction.isAutocomplete()) return;

  const focused = interaction.options.getFocused(true);
  const typeIndex = interaction.options.getInteger('type');
  const type =
    typeIndex !== null ? Object.values(SearchType)[typeIndex] : undefined;
  const searchQuery = (focused.value ?? '').trim();

  this.logger.debug(
    `Running autocomplete for query '${searchQuery || '[empty]'}' (type: ${type})`,
  );

  const baseKinds = PlayCommandParams.getBaseItemKinds(type as SearchType);

  // Always call Jellyfin, even if query is empty
  const results = await this.jellyfinSearchService.searchItem(
    searchQuery,
    25,
    baseKinds,
  );

  if (!results || results.length === 0) {
    await interaction.respond([{ name: 'No results found', value: 'none' }]);
    return;
  }

  // ✅ Batch enrich items
  const { getItemsApi } = await import('@jellyfin/sdk/lib/utils/api/items-api');
  const jellyfinCore = (this.jellyfinSearchService as any).jellyfinService;
  const api = jellyfinCore.getApi();
  const itemsApi = getItemsApi(api);

  // collect IDs
  const ids = results.slice(0, 25).map((r) => r.getId());
  const enrichedResults: any[] = [];

  try {
    const { data } = await itemsApi.getItems({
      ids,
      userId: jellyfinCore.getUserId(),
    });

    for (const fullItem of data.Items || []) {
      enrichedResults.push({
        id: fullItem.Id,
        name: fullItem.Name || 'Unknown',
        type: fullItem.Type || 'Unknown',
        artists:
          fullItem.Artists?.map((a: any) => a.Name || a) ||
          fullItem.AlbumArtists?.map((a: any) => a.Name || a) ||
          [],
      });
    }
  } catch (err) {
    this.logger.error(`Failed to enrich Jellyfin results: ${err}`);
  }

  // ✅ Build Discord autocomplete options
  const response = enrichedResults.map((item) => {
    let emoji = '🎵';
    if (item.type === 'MusicAlbum') emoji = '💿';
    else if (item.type === 'Playlist') emoji = '📜';

    const artistText = item.artists.length
      ? ` (${item.artists.join(', ')})`
      : '';

    return {
      name: `${emoji} ${item.name}${artistText}`.slice(0, 100),
      value: `native-${item.id}`,
    };
  });

  await interaction.respond(response);
  }
}
