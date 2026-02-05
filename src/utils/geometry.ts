import type { GeoJsonGeometry, GeoJsonPoint, GeoJsonPolygon, GeoJsonMultiPolygon } from '../types.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface TileDescriptor {
  id: string;
  center: LatLng;
  zoom: number;
}

const EARTH_RADIUS_KM = 6371;

function pointToBoundingBox(point: GeoJsonPoint, radiusKm: number): BoundingBox {
  const [lng, lat] = point.coordinates;

  const latDelta = (radiusKm / 111.0);
  const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180) || 1);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

function polygonToBoundingBox(polygon: GeoJsonPolygon): BoundingBox {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const ring of polygon.coordinates) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

function multiPolygonToBoundingBoxes(multi: GeoJsonMultiPolygon): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  for (const polygon of multi.coordinates) {
    const poly: GeoJsonPolygon = { type: 'Polygon', coordinates: polygon };
    boxes.push(polygonToBoundingBox(poly));
  }

  return boxes;
}

export function geometryToBoundingBoxes(geometry: GeoJsonGeometry): BoundingBox[] {
  if (geometry.type === 'Point') {
    const radius = geometry.radiusKm && geometry.radiusKm > 0 ? geometry.radiusKm : 3;
    return [pointToBoundingBox(geometry, radius)];
  }

  if (geometry.type === 'Polygon') {
    return [polygonToBoundingBox(geometry)];
  }

  if (geometry.type === 'MultiPolygon') {
    return multiPolygonToBoundingBoxes(geometry);
  }

  throw new Error(`Unsupported GeoJSON geometry type: ${(geometry as GeoJsonGeometry).type}`);
}

export function boundingBoxToTiles(
  bbox: BoundingBox,
  approxTileSizeKm = 2.5,
  zoom = 15,
): TileDescriptor[] {
  const tiles: TileDescriptor[] = [];

  const latCenter = (bbox.minLat + bbox.maxLat) / 2;
  const latKmPerDeg = 111.0;
  const lngKmPerDeg = Math.max(0.0001, Math.cos((latCenter * Math.PI) / 180) * 111.0);

  const latSpanDeg = Math.max(0.0001, bbox.maxLat - bbox.minLat);
  const lngSpanDeg = Math.max(0.0001, bbox.maxLng - bbox.minLng);

  const latDegPerTile = approxTileSizeKm / latKmPerDeg;
  const lngDegPerTile = approxTileSizeKm / lngKmPerDeg;

  let latCells = Math.max(1, Math.ceil(latSpanDeg / latDegPerTile));
  let lngCells = Math.max(1, Math.ceil(lngSpanDeg / lngDegPerTile));

  const maxCells = 400;
  const totalCells = latCells * lngCells;

  if (totalCells > maxCells) {
    const scale = Math.sqrt(totalCells / maxCells);
    latCells = Math.max(1, Math.round(latCells / scale));
    lngCells = Math.max(1, Math.round(lngCells / scale));
  }

  const latStep = latSpanDeg / latCells;
  const lngStep = lngSpanDeg / lngCells;

  let idCounter = 0;

  for (let i = 0; i < latCells; i += 1) {
    for (let j = 0; j < lngCells; j += 1) {
      const minLatCell = bbox.minLat + latStep * i;
      const maxLatCell = i === latCells - 1 ? bbox.maxLat : minLatCell + latStep;
      const minLngCell = bbox.minLng + lngStep * j;
      const maxLngCell = j === lngCells - 1 ? bbox.maxLng : minLngCell + lngStep;

      const center: LatLng = {
        lat: (minLatCell + maxLatCell) / 2,
        lng: (minLngCell + maxLngCell) / 2,
      };

      idCounter += 1;

      tiles.push({
        id: `tile-${idCounter}`,
        center,
        zoom,
      });
    }
  }

  return tiles;
}

export function geometryToTiles(
  geometry: GeoJsonGeometry,
  approxTileSizeKm = 2.5,
  zoom = 15,
): TileDescriptor[] {
  const boxes = geometryToBoundingBoxes(geometry);

  const tiles: TileDescriptor[] = [];
  for (const box of boxes) {
    tiles.push(...boundingBoxToTiles(box, approxTileSizeKm, zoom));
  }

  return tiles;
}
