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
