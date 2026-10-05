import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartMap, type FocusToken, type TrackFocus } from "./ChartMap";
import type { GpxImport } from "./gpx";
import { MarkerDetail } from "./MarkerDetail";
import { MarkersLibrary } from "./MarkersLibrary";
import { shareOrDownloadMarkers, type ImportSummary } from "./markersTransfer";
import { setLineColor, type MarkersState } from "./markersTypes";
import type { LocateState } from "./LocateControl";
import type { VersionInfo } from "./types";
import { SpeedHeadingPanel } from "./SpeedHeadingPanel";
import { TidesPanel } from "./TidesPanel";
import { TracksPanel, type TrackImportNotice } from "./TracksPanel";
import { trackBounds, type Track, type TrackBounds } from "./tracksTypes";
import { readLocation } from "./urlState";
import { nowTidalSlot, useTidalCurrents } from "./useTidalCurrents";
import { useMarkersState } from "./useMarkersState";
import { useTracksState } from "./useTracksState";
import type { UserPosition } from "./userLocation";
import { VersionSlider } from "./VersionSlider";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function unionBounds(tracks: Track[]): TrackBounds | null {
  let out: TrackBounds | null = null;
  for (const track of tracks) {
    const b = trackBounds(track);
    if (!b) continue;
    out = out
      ? {
          south: Math.min(out.south, b.south),
          west: Math.min(out.west, b.west),
          north: Math.max(out.north, b.north),
          east: Math.max(out.east, b.east),
        }
      : b;
  }
  return out;
}

function boundsIntersect(a: TrackBounds, b: TrackBounds): boolean {
  return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
}

export default function App() {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState(() => readLocation().versionId);
  const markersState = useMarkersState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [locateState, setLocateState] = useState<LocateState>("idle");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tidesOpen, setTidesOpen] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false);
  const hadFixRef = useRef(false);
  const [tidalSlot, setTidalSlot] = useState(() => nowTidalSlot());
  const [focusToken, setFocusToken] = useState<FocusToken | null>(null);
  const tracksState = useTracksState();
  const [tracksOpen, setTracksOpen] = useState(false);
  const [trackFocus, setTrackFocus] = useState<TrackFocus | null>(null);
  const [chartBounds, setChartBounds] = useState<TrackBounds | null>(null);
  const locateRequestRef = useRef<(() => void) | null>(null);
  const tides = useTidalCurrents(tidesOpen, tidalSlot);
  const hasFix = locateState === "following" || locateState === "off-center";

  useEffect(() => {
    if (hasFix && !hadFixRef.current) setMotionOpen(true);
    if (!hasFix) setMotionOpen(false);
    hadFixRef.current = hasFix;
  }, [hasFix]);

  useEffect(() => {
    fetch("/versions.json")
      .then((res) => {
        if (!res.ok) throw new Error(`versions.json ${res.status}`);
        return res.json() as Promise<VersionInfo[]>;
      })
      .then((list) => {
        setVersions(list);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setVersions([]);
      });
  }, []);

  const selected = useMemo(
    () => markersState.markers.find((marker) => marker.id === selectedId) ?? null,
    [markersState.markers, selectedId],
  );

  const setRoutes = useMemo(
    () =>
      markersState.sets.flatMap((set, index) => {
        if (!markersState.loadedSetIds.includes(set.id)) return [];
        const byId = new Map(markersState.markers.map((marker) => [marker.id, marker]));
        const latlngs = set.markerIds.flatMap((id) => {
          const marker = byId.get(id);
          return marker ? [[marker.lat, marker.lng] as [number, number]] : [];
        });
        return [{ id: set.id, color: setLineColor(index), latlngs }];
      }),
    [markersState.markers, markersState.sets, markersState.loadedSetIds],
  );

  const selectedVersion = useMemo(() => {
    if (!versions?.length) return undefined;
    if (versionId === "latest") return versions[0];
    return versions.find((v) => v.id === versionId) ?? versions[0];
  }, [versions, versionId]);

  const onChange = useCallback((id: string) => setVersionId(id), []);

  const onPlace = useCallback(
    (lat: number, lng: number) => {
      const marker = markersState.addMarker(lat, lng);
      setSelectedId(marker.id);
      setPlaceMode(false);
    },
    [markersState],
  );

  const onSelectFromLibrary = useCallback(
    (id: string) => {
      setSelectedId(id);
      const visible = markersState.visibleMarkers.some((marker) => marker.id === id);
      if (visible) setFocusToken((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [markersState.visibleMarkers],
  );

  const onDeleteMarker = useCallback(
    (id: string) => {
      markersState.deleteMarker(id);
      setSelectedId((current) => (current === id ? null : current));
    },
    [markersState],
  );

  const onExportMarkers = useCallback((state: MarkersState) => {
    void shareOrDownloadMarkers(state);
  }, []);

  const onImportMarkers = useCallback(
    (incoming: MarkersState, mode: "merge" | "replace"): ImportSummary => {
      const summary =
        mode === "replace" ? markersState.replaceMarkers(incoming) : markersState.importMarkers(incoming);
      if (mode === "replace") {
        setSelectedId((current) =>
          current && incoming.markers.some((marker) => marker.id === current) ? current : null,
        );
      }
      return summary;
    },
    [markersState],
  );

  const openLibrary = useCallback(() => {
    setLibraryOpen(true);
    setTracksOpen(false);
  }, []);

  const toggleTracks = useCallback(() => {
    if (!tracksOpen) setLibraryOpen(false);
    setTracksOpen(!tracksOpen);
  }, [tracksOpen]);

  const focusBounds = useCallback((bounds: TrackBounds) => {
    setTrackFocus((prev) => ({ bounds, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const onFocusTrack = useCallback(
    (id: string) => {
      const track = tracksState.tracks.find((item) => item.id === id);
      const bounds = track ? trackBounds(track) : null;
      if (bounds) focusBounds(bounds);
    },
    [tracksState.tracks, focusBounds],
  );

  const onImportGpx = useCallback(
    async (result: GpxImport): Promise<TrackImportNotice> => {
      if (result.markers.markers.length > 0) markersState.importMarkers(result.markers);
      let saveFailed = false;
      try {
        await tracksState.addTracks(result.tracks);
      } catch (err) {
        console.error(err);
        saveFailed = true;
      }

      const parts: string[] = [];
      if (result.tracks.length) parts.push(plural(result.tracks.length, "track", "tracks"));
      if (result.waypointCount) parts.push(plural(result.waypointCount, "waypoint", "waypoints"));
      if (result.routeCount) parts.push(plural(result.routeCount, "route", "routes"));
      let text = `Imported ${parts.join(", ")}.`;

      const imported = unionBounds(result.tracks);
      const outside = chartBounds
        ? result.tracks.filter((track) => {
            const bounds = trackBounds(track);
            return bounds != null && !boundsIntersect(bounds, chartBounds);
          })
        : [];
      if (outside.length === result.tracks.length && outside.length > 0) {
        text += ` The ${outside.length === 1 ? "track is" : "tracks are"} outside the chart area.`;
      } else if (outside.length > 0) {
        text += ` ${plural(outside.length, "track is", "tracks are")} outside the chart area.`;
      } else if (imported) {
        focusBounds(imported);
      }

      if (saveFailed) {
        return { kind: "error", text: `${text} Tracks could not be saved and will be lost on reload.` };
      }
      return { kind: "ok", text };
    },
    [markersState, tracksState, chartBounds, focusBounds],
  );

  return (
    <div className="app">
      <ChartMap
        version={selectedVersion}
        markers={markersState.visibleMarkers}
        selectedId={selectedId}
        placeMode={placeMode}
        setRoutes={setRoutes}
        focusToken={focusToken}
        locateRequestRef={locateRequestRef}
        onPlace={onPlace}
        onSelect={setSelectedId}
        onPlaceModeChange={setPlaceMode}
        onUserPosition={setUserPosition}
        onLocateState={setLocateState}
        locateState={locateState}
        motionOpen={motionOpen}
        onMotionToggle={() => setMotionOpen((open) => !open)}
        historyOpen={historyOpen}
        onHistoryToggle={() => setHistoryOpen((open) => !open)}
        tidesOpen={tidesOpen}
        tidalVectors={tides.vectors}
        onTidesToggle={() => setTidesOpen((open) => !open)}
        tracksOpen={tracksOpen}
        onTracksToggle={toggleTracks}
        visibleTracks={tracksState.visibleTracks}
        trackFocus={trackFocus}
        onChartBounds={setChartBounds}
        libraryOpen={libraryOpen || tracksOpen}
        onLibraryClose={() => {
          setLibraryOpen(false);
          setTracksOpen(false);
        }}
      />
      <div
        className={`side-panels${(libraryOpen || tracksOpen) && selected ? " is-stacked" : ""}${historyOpen || tidesOpen ? " has-bottom" : ""}${historyOpen && tidesOpen ? " has-bottom-2" : ""}`}
      >
        {motionOpen && hasFix && userPosition ? <SpeedHeadingPanel position={userPosition} /> : null}
        {libraryOpen ? (
          <MarkersLibrary
            markers={markersState.markers}
            sets={markersState.sets}
            loadedMarkerIds={markersState.loadedMarkerIds}
            loadedSetIds={markersState.loadedSetIds}
            selectedId={selectedId}
            onClose={() => setLibraryOpen(false)}
            onSelectMarker={onSelectFromLibrary}
            onRenameMarker={markersState.renameMarker}
            onDeleteMarker={onDeleteMarker}
            onToggleMarkerLoaded={markersState.toggleMarkerLoaded}
            onAddSet={markersState.addSet}
            onRenameSet={markersState.renameSet}
            onRenameFolder={markersState.renameFolder}
            onDeleteSet={markersState.deleteSet}
            onToggleSetLoaded={markersState.toggleSetLoaded}
            onSetSetsLoaded={markersState.setSetsLoaded}
            onAddMarkerToSet={markersState.addMarkerToSet}
            onRemoveMarkerFromSet={markersState.removeMarkerFromSet}
            onExport={onExportMarkers}
            onImport={onImportMarkers}
          />
        ) : (
          <button type="button" className="markers-toggle" onClick={openLibrary}>
            Markers
          </button>
        )}
        {tracksOpen ? (
          <TracksPanel
            tracks={tracksState.tracks}
            visibleIds={tracksState.visibleIds}
            loadError={tracksState.error}
            onClose={() => setTracksOpen(false)}
            onImport={onImportGpx}
            onToggleVisible={tracksState.toggleVisible}
            onRename={tracksState.renameTrack}
            onDelete={tracksState.deleteTrack}
            onFocus={onFocusTrack}
          />
        ) : null}
        {selected ? (
          <MarkerDetail
            marker={selected}
            markers={markersState.markers}
            sets={markersState.sets}
            loadedSetIds={markersState.loadedSetIds}
            userPosition={userPosition}
            locateState={locateState}
            onRename={(name) => markersState.renameMarker(selected.id, name)}
            onMove={(lat, lng) => markersState.moveMarker(selected.id, lat, lng)}
            onClose={() => setSelectedId(null)}
            onDelete={() => onDeleteMarker(selected.id)}
            onRequestLocate={() => locateRequestRef.current?.()}
          />
        ) : null}
      </div>
      {tidesOpen || historyOpen ? (
        <div className="bottom-stack">
          {tidesOpen ? (
            <TidesPanel slot={tidalSlot} loading={tides.loading} error={tides.error} onChange={setTidalSlot} />
          ) : null}
          {historyOpen ? (
            versions && versions.length > 0 ? (
              <VersionSlider versions={versions} versionId={selectedVersion?.id ?? versionId} onChange={onChange} />
            ) : (
              <div className="version-bar">
                <div className="version-label">
                  {error
                    ? `Could not load chart versions (${error})`
                    : versions === null
                      ? "Loading chart versions…"
                      : "No MBTiles found. Put archives in MBTILES_DIR and reload."}
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
