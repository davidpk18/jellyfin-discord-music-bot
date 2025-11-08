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

// ✅ Fuse import that works in both ESM and CommonJS (Docker-safe)
import * as FuseModule from 'fuse.js';
const Fuse = (FuseModule as any).default || (FuseModule as any);

@Injectable()
export class JellyfinSearchService {
  private albumCache: Map<string, any[]> = new Map();
  private readonly logger = new Logger(JellyfinSearchService.name);

  constructor(private readonly jellyfinService: JellyfinService) {}

  async searchItem(
    searchTerm: string,
    limit = 25,
    includeItemTypes: BaseItemKind[] = [
      BaseItemKind.Audio,
      BaseItemKind.MusicAlbum,
      BaseItemKind.Playlist,
    ],
  ): Promise<SearchItem[]> {
    const api = this.jellyfinService.getApi();
    const itemsApi = getItemsApi(api);
    const userId = this.jellyfinService.getUserId();
    const DEBUG_FUSE = true;

    try {
      // 🟢 Fallback sample if no searchTerm
      if (!searchTerm?.trim()) {
        const { data } = await itemsApi.getItems({
          includeItemTypes,
          userId,
          recursive: true,
          limit,
          sortBy: ['SortName'],
        });
        return (data.Items || []).map((i) =>
          SearchItem.constructFromBaseItem(i),
        );
      }

      const term = searchTerm.trim().toLowerCase();
      const terms = term.split(/\s+/);

      // 🎯 Primary Jellyfin fetch
      const { data: directData } = await itemsApi.getItems({
        includeItemTypes,
        userId,
        recursive: true,
        searchTerm: term,
        limit: 400,
        sortBy: ['SortName'],
      });

      let results = directData.Items || [];

      // 🧠 Fallback: try individual terms
      if (results.length === 0 && terms.length > 1) {
        const termResults: any[] = [];
        for (const single of terms) {
          const { data } = await itemsApi.getItems({
            includeItemTypes,
            userId,
            recursive: true,
            searchTerm: single,
            limit: 200,
          });
          termResults.push(...(data.Items || []));
        }
        results = Array.from(
          new Map(termResults.map((i) => [i.Id, i])).values(),
        );
        this.logger.log(
          `Multi-term fallback activated — combined results: ${results.length}`,
        );
      }

      // 🧩 Debug: count and log item types
      if (DEBUG_FUSE) {
        const typeCounts: Record<string, number> = {};
        for (const i of results) {
          const typeKey = i?.Type || 'Unknown';
          typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;
        }
        this.logger.log(
          `Fetched from Jellyfin: ${typeCounts['MusicAlbum'] || 0} albums, ${
            typeCounts['Audio'] || 0
          } tracks`,
        );
      }

      // 🔎 Manual multi-term partial match
      const filtered = results.filter((item) => {
        const fields = [
          item.Name,
          item.Album,
          ...(item.Artists || []).map((a: any) =>
            typeof a === 'string' ? a : (a?.Name ?? ''),
          ),
          ...(item.AlbumArtists || []).map((a: any) =>
            typeof a === 'string' ? a : (a?.Name ?? ''),
          ),
        ]
          .filter(Boolean)
          .map((x) => x.toLowerCase());

        return terms.every((t) => fields.some((f) => f.includes(t)));
      });

      // 🧮 Prepare Fuse.js data
      const fuseData = (filtered.length ? filtered : results).map((i) => ({
        ...i,
        name: i.Name || '',
        album: i.Album || '',
        artists: (i.Artists || []).map((a: any) => a?.Name || a).join(' '),
        albumArtists: (i.AlbumArtists || [])
          .map((a: any) => a?.Name || a)
          .join(' '),
      }));

      // 🧩 Add combined “album + artist” field
      for (const item of fuseData) {
        const albumName = (item.album || '').toLowerCase();
        const artistNames =
          `${item.artists} ${item.albumArtists}`.toLowerCase();
        (item as any).albumFullName = `${artistNames} ${albumName}`.trim();
      }

      // 🎛️ Fuse passes
      const fuse = new Fuse(fuseData, {
        keys: [
          { name: 'albumFullName', weight: 0.1 },
          { name: 'album', weight: 0.15 },
          { name: 'name', weight: 0.25 },
          { name: 'artists', weight: 0.5 },
        ],
        threshold: 1,
        distance: 750,
        ignoreLocation: true,
        includeScore: true,
      });

      const fuseAlbums = new Fuse(fuseData, {
        keys: [
          { name: 'albumFullName', weight: 0.15 },
          { name: 'album', weight: 0.3 },
          { name: 'artists', weight: 0.3 },
          { name: 'name', weight: 0.25 },
        ],
        threshold: 1,
        distance: 600,
        ignoreLocation: true,
        includeScore: true,
      });

      const generalResults = fuse.search(term);
      const albumResults = fuseAlbums.search(term);
      const fuzzyResults =
        terms.length >= 2
          ? [...albumResults, ...generalResults]
          : [...generalResults, ...albumResults];

      // 🧩 Merge and rank albums above tracks
      let ranked = Array.from(
        new Map(
          fuzzyResults
            .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
            .map((r) => [r.item.Id, r.item]),
        ).values(),
      );

      let albumAtTop = ranked.find((r) => r.Type === 'MusicAlbum');
      if (albumAtTop) {
        ranked = [albumAtTop, ...ranked.filter((r) => r.Id !== albumAtTop.Id)];
      }

      if (!albumAtTop) {
        const { data: albumSearch } = await itemsApi.getItems({
          includeItemTypes: [BaseItemKind.MusicAlbum],
          userId,
          recursive: true,
          searchTerm: term,
          limit: 3,
          sortBy: ['SortName'],
        });
        if (albumSearch?.Items?.length) {
          albumAtTop = albumSearch.Items[0];
          ranked.unshift(albumAtTop);
          this.logger.log(
            `✅ Injected album "${albumAtTop.Name}" from direct Jellyfin query`,
          );
        }
      }

      if (albumAtTop) {
        try {
          let albumTracks = this.albumCache.get(albumAtTop.Id) || [];
          if (albumTracks.length === 0) {
            const { data: albumChildren } = await itemsApi.getItems({
              parentId: albumAtTop.Id,
              includeItemTypes: [BaseItemKind.Audio],
              userId,
              recursive: true,
              limit: 300,
              sortBy: ['IndexNumber'],
            });
            albumTracks = albumChildren.Items || [];
            this.albumCache.set(albumAtTop.Id, albumTracks);
            this.logger.log(
              `Fetched ${albumTracks.length} tracks from album "${albumAtTop.Name}"`,
            );
          }

          const normalize = (s: string) =>
            s
              ?.toLowerCase()
              ?.replace(/[^\w\s]|_/g, '')
              ?.trim() || '';
          const albumNameNorm = normalize(albumAtTop.Name || '');
          const albumArtistsNorm = (
            (albumAtTop.AlbumArtists || [])
              .map((a: any) => (a?.Name || a || '').toLowerCase())
              .join(' ') || ''
          ).trim();

          const fuseIds = new Set(fuseData.map((f) => f.Id));
          for (const t of albumTracks) {
            if (t && !fuseIds.has(t.Id)) {
              fuseData.push({
                ...t,
                name: t.Name || '',
                album: t.Album || '',
                artists: (t.Artists || [])
                  .map((a: any) => a?.Name || a)
                  .join(' '),
                albumArtists: (t.AlbumArtists || [])
                  .map((a: any) => a?.Name || a)
                  .join(' '),
              });
            }
          }

          const relatedTracks = fuseData
            .filter((r) => {
              if (r.Type !== 'Audio' || !r.Album) return false;
              const trackAlbum = normalize(r.Album);
              const trackArtists = (r.artists || '').toLowerCase();
              const albumMatch =
                trackAlbum.includes(albumNameNorm) ||
                albumNameNorm.includes(trackAlbum);
              const artistOverlap =
                albumArtistsNorm &&
                (albumArtistsNorm
                  .split(/\s+/)
                  .some((a) => trackArtists.includes(a)) ||
                  trackArtists
                    .split(/\s+/)
                    .some((a) => albumArtistsNorm.includes(a)));
              return albumMatch || artistOverlap;
            })
            .sort(sortByDiscAndTrack);

          const uniqueRelated = Array.from(
            new Map(relatedTracks.map((t) => [t.Id, t])).values(),
          );

          if (uniqueRelated.length > 0) {
            this.logger.log(
              `📀 Assembled ${uniqueRelated.length} tracks for "${albumAtTop.Name}"`,
            );
            const albumIndex = ranked.findIndex((r) => r.Id === albumAtTop.Id);
            ranked.splice(albumIndex + 1, 0, ...uniqueRelated);
          }
        } catch (e) {
          this.logger.warn(
            `Failed to fetch tracks for album ${albumAtTop?.Name}: ${e}`,
          );
        }
      }

      const seenIds = new Set<string>();
      const finalRanked = ranked.filter((i) => {
        if (!i?.Id) return false;
        if (seenIds.has(i.Id)) return false;
        seenIds.add(i.Id);
        return true;
      });

      const finalResults = finalRanked
        .map((i) => SearchItem.constructFromBaseItem(i))
        .filter(Boolean)
        .slice(0, limit);

      return finalResults;
    } catch (err) {
      this.logger.error(`Deep search failed: ${err}`);
      return [];
    }
  }

  // === Rest of service unchanged ===

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
      });

      let items = itemResponse.data?.Items ?? [];
      if (itemResponse.status !== 200) items = [];

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
        return [];
      }

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
