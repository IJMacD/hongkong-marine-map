export type VersionInfo = {
  id: string;
  capturedAt: string;
  edition?: string;
  label: string;
  bytes: number;
  tilejson: string;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  attribution: string;
  name: string;
};

export type TileJSON = {
  tilejson: string;
  name: string;
  description?: string;
  version?: string;
  attribution: string;
  scheme: string;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  center?: [number, number, number];
};
