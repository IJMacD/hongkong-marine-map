import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { isGpxDocument, parseGpx, type GpxImport } from "./gpx";
import { Row } from "./MarkersLibrary";
import { formatTrackSummary, trackColor, trackStats, type Track } from "./tracksTypes";

export type TrackImportNotice = { kind: "ok" | "error"; text: string };

type Props = {
  tracks: Track[];
  visibleIds: string[];
  loadError: string | null;
  onClose: () => void;
  onImport: (result: GpxImport) => Promise<TrackImportNotice>;
  onToggleVisible: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
};

export function TracksPanel({
  tracks,
  visibleIds,
  loadError,
  onClose,
  onImport,
  onToggleVisible,
  onRename,
  onDelete,
  onFocus,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<TrackImportNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const visible = new Set(visibleIds);
  const summaries = useMemo(
    () => new Map(tracks.map((track) => [track.id, formatTrackSummary(trackStats(track))])),
    [tracks],
  );

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        setNotice({ kind: "error", text: "Could not read that file." });
        return;
      }
      const result = parseGpx(text, file.name);
      if (!result) {
        setNotice({
          kind: "error",
          text: isGpxDocument(text) ? "No tracks, waypoints or routes found." : "Not a GPX file.",
        });
        return;
      }
      setNotice(await onImport(result));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-panel tracks-panel" aria-label="Tracks">
      <header className="markers-library-header">
        <button type="button" className="panel-header-btn" onClick={onClose} aria-label="Close tracks">
          <h2>Tracks</h2>
          <span className="panel-caret" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M7 14.5 12 9.5l5 5z" />
            </svg>
          </span>
        </button>
        <div className="panel-header-actions">
          <button type="button" className="text-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            Import
          </button>
        </div>
      </header>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        aria-label="Import GPX file"
        onChange={onFileChange}
      />

      {busy ? <p className="import-status">Importing…</p> : null}
      {notice && !busy ? (
        <p className={`import-status${notice.kind === "error" ? " is-error" : ""}`}>{notice.text}</p>
      ) : null}
      {loadError ? <p className="import-status is-error">{loadError}</p> : null}

      {tracks.length === 0 ? (
        <p className="panel-empty">
          Import a GPX file exported from another app, such as Navionics, Garmin, Strava or OpenCPN. Waypoints are
          added as markers and routes as sets.
        </p>
      ) : (
        <ul className="panel-list">
          {tracks.map((track, index) => (
            <li key={track.id} className="track-item">
              <Row
                checked={visible.has(track.id)}
                onToggle={() => onToggleVisible(track.id)}
                toggleLabel={`Show ${track.name}`}
                name={track.name}
                swatch={trackColor(index)}
                onSelect={() => onFocus(track.id)}
                selectHint="Zoom to track"
                onRename={(name) => onRename(track.id, name)}
                onDelete={() => {
                  if (window.confirm(`Delete track “${track.name}”?`)) onDelete(track.id);
                }}
              />
              <p className="track-stats">{summaries.get(track.id)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
