import type { SearchJob } from '../../types.js';
import { geometryToTiles, type TileDescriptor } from '../../utils/geometry.js';

const DEFAULT_TILE_SIZE_KM = 2.5;
const DEFAULT_ZOOM = 15;

export function generateTilesForSearchJob(job: SearchJob): TileDescriptor[] {
  if (job.customGeolocation) {
    return geometryToTiles(job.customGeolocation, DEFAULT_TILE_SIZE_KM, DEFAULT_ZOOM);
  }

  return [
    {
      id: `${job.id}-global`,
      center: { lat: 0, lng: 0 },
      zoom: 3,
    },
  ];
}
