import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartMap, type FocusToken } from "./ChartMap";
import { MarkerDetail } from "./MarkerDetail";
import { MarkersLibrary } from "./MarkersLibrary";
import { shareOrDownloadMarkers, type ImportSummary } from "./markersTransfer";
import { setLineColor, type MarkersState } from "./markersTypes";
import type { LocateState } from "./LocateControl";
import type { VersionInfo } from "./types";
import { readLocation } from "./urlState";
import { useMarkersState } from "./useMarkersState";
import type { UserPosition } from "./userLocation";
import { VersionSlider } from "./VersionSlider";

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
  const [focusToken, setFocusToken] = useState<FocusToken | null>(null);
  const locateRequestRef = useRef<(() => void) | null>(null);

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

  const onExportMarkers = useCallback(() => {
    void shareOrDownloadMarkers({
      version: 1,
      markers: markersState.markers,
      sets: markersState.sets,
      loadedMarkerIds: markersState.loadedMarkerIds,
      loadedSetIds: markersState.loadedSetIds,
    });
  }, [markersState.markers, markersState.sets, markersState.loadedMarkerIds, markersState.loadedSetIds]);

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
        historyOpen={historyOpen}
        onHistoryToggle={() => setHistoryOpen((open) => !open)}
      />
      <div className={`side-panels${libraryOpen && selected ? " is-stacked" : ""}${historyOpen ? " has-history" : ""}`}>
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
            onDeleteSet={markersState.deleteSet}
            onToggleSetLoaded={markersState.toggleSetLoaded}
            onAddMarkerToSet={markersState.addMarkerToSet}
            onRemoveMarkerFromSet={markersState.removeMarkerFromSet}
            onExport={onExportMarkers}
            onImport={onImportMarkers}
          />
        ) : (
          <button type="button" className="markers-toggle" onClick={() => setLibraryOpen(true)}>
            Markers
          </button>
        )}
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
  );
}
