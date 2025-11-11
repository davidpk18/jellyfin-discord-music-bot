import {
  BaseItemDto,
  BaseItemKind,
  RemoteImageResult,
  SearchHint as JellyfinSearchHint,
} from '@jellyfin/sdk/lib/generated-client/models';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import { getRemoteImageApi } from '@jellyfin/sdk/lib/utils/api/remote-image-api';
import { getSearchApi } from '@jellyfin/sdk/lib/utils/api/search-api';
import { Injectable, Logger } from '@nestjs/common';
import { AlbumSearchItem } from '../../models/search/AlbumSearchItem';
import { PlaylistSearchItem } from '../../models/search/PlaylistSearchItem';
import { SearchItem } from '../../models/search/SearchItem';
import { JellyfinService } from './jellyfin.service';
import { sortByDiscAndTrack } from '../../utils/sortByDiscAndTrack';

// ✅ Fuse import (Docker-safe)
//import * as FuseModule from 'fuse.js';
//const Fuse = (FuseModule as any).default || (FuseModule as any);

@Injectable()
export class JellyfinSearchService {
  private albumCache: Map<string, any[]> = new Map();
  private readonly logger = new Logger(JellyfinSearchService.name);

  private readonly defaultFields: any[] = [
    'Artists',
    'AlbumArtists',
    'Album',
    'ParentId',
    'AlbumId',
    'IndexNumber',
    'ProductionYear',
    'MediaSources',
  ];

  constructor(private readonly jellyfinService: JellyfinService) {}

  // ────────────────────────────────────────────────
  // 🔍 Core Search
  // ────────────────────────────────────────────────
  async searchItem(
    searchTerm: string,
    limit = 25,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _includeItemTypes: BaseItemKind[] = [
      BaseItemKind.Audio,
      BaseItemKind.MusicAlbum,
      BaseItemKind.MusicArtist,
      BaseItemKind.Playlist,
    ],
  ): Promise<SearchItem[]> {
    const api = this.jellyfinService.getApi();
    const searchApi = getSearchApi(api);
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinService.getUserId();

    if (!searchTerm?.trim()) return [];

    const term = searchTerm.trim();
    this.logger.log(`🔍 Native Jellyfin search for "${term}"`);

    try {
      // 1️⃣ Query /Search/Hints — just like the web UI
      const { data: hints } = await searchApi.get({
        userId,
        searchTerm: term,
        includeItemTypes: [
          'Audio',
          'MusicAlbum',
          'MusicArtist',
          'Playlist',
        ] as any,
        limit,
      });

      const hintItems: SearchItem[] = [];
      if (hints?.SearchHints?.length) {
        for (const hint of hints.SearchHints) {
          const item = this.transformToSearchHintFromHint(hint);
          if (item) hintItems.push(item);
        }
        this.logger.log(
          `💡 /Search/Hints returned ${hintItems.length} results for "${term}"`,
        );
      }

      // 2️⃣ Expand artist results (fetch their albums + tracks)
      const artistHints =
        hints?.SearchHints?.filter((h) => h.Type === 'MusicArtist') || [];

      for (const artist of artistHints) {
        this.logger.log(`🎤 Expanding artist "${artist.Name}"`);
        const [albumsRes, tracksRes] = await Promise.all([
          itemsApi.getItems({
            userId,
            includeItemTypes: ['MusicAlbum'] as any,
            recursive: true,
            limit: 100,
            sortBy: ['SortName'],
            albumArtistIds: [artist.Id ?? ''], // ✅ Correct way to link artist to albums
          }),
          itemsApi.getItems({
            userId,
            includeItemTypes: ['Audio'] as any,
            recursive: true,
            limit: 300,
            sortBy: ['IndexNumber'],
            artistIds: [artist.Id ?? ''], // ✅ Correct way to link artist to tracks
          }),
        ]);

        const albums = (albumsRes.data?.Items ?? []).map((i) =>
          SearchItem.constructFromBaseItem(i),
        );
        const tracks = (tracksRes.data?.Items ?? []).map((i) =>
          SearchItem.constructFromBaseItem(i),
        );

        this.logger.log(
          `📀 ${artist.Name}: ${albums.length} albums, ${tracks.length} tracks`,
        );
        hintItems.push(...albums, ...tracks);
      }

      // 3️⃣ Fallback: direct /Items search (if nothing found)
      if (hintItems.length === 0) {
        const { data: itemsData } = await itemsApi.getItems({
          userId,
          searchTerm: term,
          includeItemTypes: ['Audio', 'MusicAlbum', 'MusicArtist'] as any,
          recursive: true,
          limit: 300,
          sortBy: ['SortName'],
        });

        if (itemsData?.Items?.length) {
          this.logger.log(
            `📦 /Items fallback returned ${itemsData.Items.length} items`,
          );
          hintItems.push(
            ...itemsData.Items.map((i) => SearchItem.constructFromBaseItem(i)),
          );
        }
      }

      // 4️⃣ Remove duplicates safely
      const seen = new Set<string>();
      const unique = hintItems.filter((i: any) => {
        const id = i?.id ?? i?.Id ?? i?.getId?.();
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      if (unique.length > 0) {
        this.logger.log(
          `✅ Returning ${unique.length} unique results for "${term}"`,
        );
        return unique.slice(0, limit);
      }
    } catch (err) {
      this.logger.error(`Deep search failed: ${err}`);
    }

    // 🟡 Artist + Album Fallback — catches "<artist> <album>" phrases
    try {
      const normalized = (searchTerm || '').trim().toLowerCase();
      const parts = normalized.split(/\s+/).filter(Boolean);

      this.logger.log(
        `🧩 [Fallback] Checking artist+album for "${normalized}" (parts=${parts.length})`,
      );

      if (parts.length >= 2) {
        const api = this.jellyfinService.getApi();
        const userId = this.jellyfinService.getUserId();
        const itemsApi = getItemsApi(api);

        // Step 1: multi-token search loop
        let candidateAlbums: any[] = [];
        for (const token of parts) {
          const { data: partial } = await itemsApi.getItems({
            userId,
            includeItemTypes: [BaseItemKind.MusicAlbum],
            recursive: true,
            searchTerm: token,
            limit: 100,
            sortBy: ['SortName'],
          });
          candidateAlbums.push(...(partial?.Items ?? []));
        }

        // Deduplicate by ID
        const seen = new Set<string>();
        candidateAlbums = candidateAlbums.filter((a) => {
          if (!a.Id || seen.has(a.Id)) return false;
          seen.add(a.Id);
          return true;
        });

        this.logger.log(
          `🧩 [Fallback] Album candidates found across tokens: ${candidateAlbums.length}`,
        );

        if (candidateAlbums.length) {
          // Step 2: pick best-scoring album
          const scoreAlbum = (alb: any) => {
            const aa = (alb?.AlbumArtists ?? [])
              .map((a: any) => (typeof a === 'string' ? a : (a?.Name ?? '')))
              .join(' ')
              .toLowerCase();
            const name = (alb?.Name ?? '').toLowerCase();
            const combined = `${aa} ${name}`;
            let s = 0;
            for (const p of parts) if (combined.includes(p)) s++;
            return s;
          };

          const best = [...candidateAlbums].sort(
            (a, b) => scoreAlbum(b) - scoreAlbum(a),
          )[0];
          this.logger.log(
            `🧩 [Fallback] Best album match: ${best?.Name ?? 'none'} (score=${scoreAlbum(best)})`,
          );

          if (best?.Id) {
            // Step 3: fetch all tracks
            const { data: children } = await itemsApi.getItems({
              userId,
              parentId: best.Id,
              includeItemTypes: [BaseItemKind.Audio],
              recursive: true,
              limit: 500,
              sortBy: ['IndexNumber'],
            });

            const trackItems = (children?.Items ?? [])
              .slice()
              .sort(sortByDiscAndTrack as any);
            this.logger.log(
              `🧩 [Fallback] Tracks fetched for "${best?.Name}": ${trackItems.length}`,
            );

            const albumFirst: SearchItem[] = [
              this.transformToSearchHintFromBaseItemDto(best) as SearchItem,
              ...trackItems.map((it) => SearchItem.constructFromBaseItem(it)),
            ].filter(Boolean);

            if (albumFirst.length > 1) {
              this.logger.log(
                `🎯 [Fallback] Artist+Album HIT: ${best?.Name} (+${trackItems.length} tracks)`,
              );
              return albumFirst.slice(0, limit);
            } else {
              this.logger.warn(
                `⚠️ [Fallback] Album found but no tracks returned.`,
              );
            }
          }
        } else {
          this.logger.warn(
            `⚠️ [Fallback] No albums matched any tokens of "${normalized}"`,
          );
        }
      } else {
        this.logger.verbose(
          `🧩 [Fallback] Query too short (${parts.length} parts)`,
        );
      }
    } catch (e) {
      this.logger.warn(`💥 [Fallback] Artist+Album error: ${e}`);
    }
    // 🧩 If all searches and fallbacks failed
    this.logger.warn(
      `❌ No results for "${searchTerm}" after all fallback attempts.`,
    );
    return [];
  }

  // ────────────────────────────────────────────────
  // Playlist / Album / Item helpers
  // ────────────────────────────────────────────────
  async getPlaylistItems(id: string): Promise<SearchItem[]> {
    const api = this.jellyfinService.getApi();
    const playlistApi = getPlaylistsApi(api);

    const axiosResponse = await playlistApi.getPlaylistItems({
      userId: this.jellyfinService.getUserId(),
      playlistId: id,
    });

    if (axiosResponse.status !== 200 || !axiosResponse.data.Items) return [];
    return axiosResponse.data.Items.map((hint) =>
      SearchItem.constructFromBaseItem(hint),
    );
  }

  async getAlbumItems(albumId: string): Promise<SearchItem[]> {
    const api = this.jellyfinService.getApi();
    const userId = this.jellyfinService.getUserId();
    const itemsApi = getItemsApi(api);
    const searchApi = getSearchApi(api);

    try {
      const itemResponse = await itemsApi.getItems({
        parentId: albumId,
        userId,
        includeItemTypes: [BaseItemKind.Audio],
        sortBy: ['IndexNumber'],
        recursive: true,
        fields: this.defaultFields,
      });

      let items = itemResponse.data?.Items ?? [];
      if (itemResponse.status !== 200) items = [];

      // ⚠️ Fallback 1: use /Search if album returned no direct children
      if (!items || items.length === 0) {
        const searchResponse = await searchApi.get({
          parentId: albumId,
          userId,
          mediaTypes: [BaseItemKind[BaseItemKind.Audio]],
          searchTerm: '%',
        });

        if (
          searchResponse.status === 200 &&
          searchResponse.data?.SearchHints?.length
        ) {
          const hints = searchResponse.data.SearchHints || [];
          this.logger.log(
            `✅ Fallback via searchApi succeeded (${hints.length} items).`,
          );
          return hints
            .sort(sortByDiscAndTrack)
            .map((hint: any) => SearchItem.constructFromHint(hint));
        }

        this.logger.warn(`⚠️ Fallback via searchApi also returned no items.`);

        // 🧠 Fallback 2: Manual artist+album combined term match
        // This recovers results for "<artist> <album>" combos
        try {
          const { data: manual } = await itemsApi.getItems({
            userId,
            recursive: true,
            includeItemTypes: [BaseItemKind.MusicAlbum, BaseItemKind.Audio],
            limit: 500,
            sortBy: ['SortName'],
          });

          const allItems = manual?.Items ?? [];
          const albumData = allItems.filter((item) => {
            if (!item.Album && !item.Artists?.length) return false;

            const fields = [
              item.Name,
              item.Album,
              ...(item.Artists || []).map((a: any) =>
                typeof a === 'string' ? a : a?.Name || '',
              ),
              ...(item.AlbumArtists || []).map((a: any) =>
                typeof a === 'string' ? a : a?.Name || '',
              ),
            ]
              .filter(Boolean)
              .map((x) => x.toLowerCase());

            const terms = (albumId || '').toLowerCase().split(/\s+/);
            return terms.every((t) => fields.some((f) => f.includes(t)));
          });

          if (albumData.length > 0) {
            this.logger.log(
              `✅ Manual "<artist> <album>" term match recovered ${albumData.length} results.`,
            );
            return albumData
              .sort(sortByDiscAndTrack)
              .map((item) => SearchItem.constructFromBaseItem(item));
          }
        } catch (manualErr) {
          this.logger.error(
            `💥 Manual term match fallback failed: ${manualErr}`,
          );
        }

        return [];
      }

      // ✅ If album children exist normally
      items.sort(sortByDiscAndTrack);
      return items.map((item) => SearchItem.constructFromBaseItem(item));
    } catch (err) {
      this.logger.error(`getAlbumItems: unexpected failure — ${err}`);
      return [];
    }
  }

  async getById(
    id: string,
    includeItemTypes: BaseItemKind[],
  ): Promise<SearchItem | undefined> {
    const api = this.jellyfinService.getApi();
    const itemsApi = getItemsApi(api);

    const { data } = await itemsApi.getItems({
      ids: [id],
      userId: this.jellyfinService.getUserId(),
      includeItemTypes,
      fields: this.defaultFields,
    });

    if (!data.Items || data.Items.length !== 1) return undefined;
    return this.transformToSearchHintFromBaseItemDto(data.Items[0]);
  }

  async getAllById(
    ids: string[],
    includeItemTypes: BaseItemKind[] = [BaseItemKind.Audio],
  ): Promise<SearchItem[]> {
    const api = this.jellyfinService.getApi();
    const itemsApi = getItemsApi(api);

    const { data } = await itemsApi.getItems({
      ids,
      userId: this.jellyfinService.getUserId(),
      includeItemTypes,
      fields: this.defaultFields,
    });

    if (!data.Items || data.Items.length === 0) return [];
    return data.Items.map((item) =>
      this.transformToSearchHintFromBaseItemDto(item),
    ).filter(Boolean) as SearchItem[];
  }

  async getRemoteImageById(id: string, limit = 20): Promise<RemoteImageResult> {
    const api = this.jellyfinService.getApi();
    const remoteImageApi = getRemoteImageApi(api);

    try {
      const axiosResponse = await remoteImageApi.getRemoteImages({
        itemId: id,
        includeAllLanguages: true,
        limit,
      });
      if (axiosResponse.status !== 200)
        return { Images: [], Providers: [], TotalRecordCount: 0 };
      return axiosResponse.data;
    } catch (err) {
      this.logger.error(`Failed to retrieve remote images: ${err}`);
      return { Images: [], Providers: [], TotalRecordCount: 0 };
    }
  }

  async getRandomTracks(limit: number) {
    const api = this.jellyfinService.getApi();
    const itemsApi = getItemsApi(api);

    try {
      const response = await itemsApi.getItems({
        includeItemTypes: [BaseItemKind.Audio],
        limit,
        sortBy: ['Random'],
        userId: this.jellyfinService.getUserId(),
        recursive: true,
        fields: this.defaultFields,
      });

      if (!response.data.Items) return [];
      return response.data.Items.map((item) =>
        SearchItem.constructFromBaseItem(item),
      );
    } catch (err) {
      this.logger.error(
        `Unable to retrieve random items from Jellyfin: ${err}`,
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────
  // Converters
  // ────────────────────────────────────────────────
  private transformToSearchHintFromHint(jellyfinHint: JellyfinSearchHint) {
    switch (jellyfinHint.Type) {
      case BaseItemKind[BaseItemKind.Audio]:
        return SearchItem.constructFromHint(jellyfinHint);
      case BaseItemKind[BaseItemKind.MusicAlbum]:
        return AlbumSearchItem.constructFromHint(jellyfinHint);
      case BaseItemKind[BaseItemKind.Playlist]:
        return PlaylistSearchItem.constructFromHint(jellyfinHint);
      default:
        return undefined;
    }
  }

  private transformToSearchHintFromBaseItemDto(baseItemDto: BaseItemDto) {
    switch (baseItemDto.Type) {
      case BaseItemKind[BaseItemKind.Audio]:
        return SearchItem.constructFromBaseItem(baseItemDto);
      case BaseItemKind[BaseItemKind.MusicAlbum]:
        return AlbumSearchItem.constructFromBaseItem(baseItemDto);
      case BaseItemKind[BaseItemKind.Playlist]:
        return PlaylistSearchItem.constructFromBaseItem(baseItemDto);
      default:
        return undefined;
    }
  }
}
