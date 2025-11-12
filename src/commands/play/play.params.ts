import { Param, ParamType } from '@discord-nestjs/core';

export class PlayCommandParams {
  @Param({
    required: true,
    description: 'Name of the song, artist, or album on Jellyfin',
    autocomplete: true,
  })
  name!: string;

  @Param({
    description: 'Add to the start of the queue',
    required: false,
    type: ParamType.BOOLEAN,
  })
  next?: boolean;
}
