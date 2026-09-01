const DEFAULT_VIEW = { zoom: 11, lat: 22.32, lng: 114.17 };

export function readLocation(): {
  versionId: string;
  zoom: number;
  lat: number;
  lng: number;
} {
  const versionId = new URLSearchParams(window.location.search).get("v") || "latest";
  const hash = window.location.hash.replace(/^#/, "");
  const [z, lat, lng] = hash.split("/");
  const zoom = Number(z);
  const latitude = Number(lat);
  const longitude = Number(lng);
  if ([zoom, latitude, longitude].every(Number.isFinite)) {
    return { versionId, zoom, lat: latitude, lng: longitude };
  }
  return { versionId, ...DEFAULT_VIEW };
}

export function writeLocation(versionId: string, zoom: number, lat: number, lng: number) {
  const next = `?v=${encodeURIComponent(versionId)}#${zoom}/${lat.toFixed(5)}/${lng.toFixed(5)}`;
  if (`${window.location.search}${window.location.hash}` !== next) {
    history.replaceState(null, "", next);
  }
}
