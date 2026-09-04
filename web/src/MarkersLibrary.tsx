import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { bearingTrue, distanceNmi, formatBearing, formatRangeNmi } from "./geo";
import {
  formatImportSummary,
  formatReplaceSummary,
  parseMarkersTransferText,
  type ImportSummary,
} from "./markersTransfer";
import { setLineColor, type ChartMarker, type MarkerSet, type MarkersState } from "./markersTypes";

type Props = {
  markers: ChartMarker[];
  sets: MarkerSet[];
  loadedMarkerIds: string[];
  loadedSetIds: string[];
  selectedId: string | null;
  onClose: () => void;
  onSelectMarker: (id: string) => void;
  onRenameMarker: (id: string, name: string) => void;
  onDeleteMarker: (id: string) => void;
  onToggleMarkerLoaded: (id: string) => void;
  onAddSet: () => void;
  onRenameSet: (id: string, name: string) => void;
  onDeleteSet: (id: string) => void;
  onToggleSetLoaded: (id: string) => void;
  onAddMarkerToSet: (setId: string, markerId: string) => void;
  onRemoveMarkerFromSet: (setId: string, index: number) => void;
  onExport: () => void;
  onImport: (incoming: MarkersState, mode: "merge" | "replace") => ImportSummary;
};

export function MarkersLibrary({
  markers,
  sets,
  loadedMarkerIds,
  loadedSetIds,
  selectedId,
  onClose,
  onSelectMarker,
  onRenameMarker,
  onDeleteMarker,
  onToggleMarkerLoaded,
  onAddSet,
  onRenameSet,
  onDeleteSet,
  onToggleSetLoaded,
  onAddMarkerToSet,
  onRemoveMarkerFromSet,
  onExport,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ document: MarkersState; name: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const loadedMarkerSet = new Set(loadedMarkerIds);
  const loadedSetSet = new Set(loadedSetIds);
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  const libraryEmpty = markers.length === 0 && sets.length === 0;

  function applyImport(incoming: MarkersState, mode: "merge" | "replace") {
    const summary = onImport(incoming, mode);
    setPending(null);
    setNotice({
      kind: "ok",
      text: mode === "replace" ? formatReplaceSummary(summary) : formatImportSummary(summary),
    });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setPending(null);
      setNotice({ kind: "error", text: "Could not read that file." });
      return;
    }
    const document = parseMarkersTransferText(text);
    if (!document) {
      setPending(null);
      setNotice({ kind: "error", text: "Not a markers file." });
      return;
    }
    setNotice(null);
    if (libraryEmpty) {
      applyImport(document, "merge");
      return;
    }
    setPending({ document, name: file.name });
  }

  return (
    <section className="glass-panel markers-library" aria-label="Markers">
      <header className="markers-library-header">
        <button type="button" className="panel-header-btn" onClick={onClose} aria-label="Close markers">
          <h2>Markers</h2>
          <span className="panel-caret" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M7 14.5 12 9.5l5 5z" />
            </svg>
          </span>
        </button>
        <div className="panel-header-actions">
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button type="button" className="text-btn" onClick={onExport} disabled={libraryEmpty}>
            Export
          </button>
        </div>
      </header>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="Import markers file"
        onChange={onFileChange}
      />

      {pending ? (
        <div className="import-choice">
          <p>
            {pending.document.markers.length === 1 ? "1 marker" : `${pending.document.markers.length} markers`},{" "}
            {pending.document.sets.length === 1 ? "1 set" : `${pending.document.sets.length} sets`}
            {pending.name ? ` from ${pending.name}` : ""}.
          </p>
          <button type="button" className="text-btn" onClick={() => applyImport(pending.document, "merge")}>
            Add to library
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              if (window.confirm("This deletes markers that are not in the file.")) {
                applyImport(pending.document, "replace");
              }
            }}
          >
            Replace library
          </button>
          <button type="button" className="icon-btn" aria-label="Cancel import" onClick={() => setPending(null)}>
            ×
          </button>
        </div>
      ) : notice ? (
        <p className={`import-status${notice.kind === "error" ? " is-error" : ""}`}>{notice.text}</p>
      ) : null}

      <div className="panel-section">
        {markers.length === 0 ? (
          <p className="panel-empty">
            Use the pin tool, then click the chart to place a marker. Or Import a file from another device.
          </p>
        ) : (
          <ul className="panel-list">
            {markers.map((marker) => (
              <li key={marker.id}>
                <Row
                  checked={loadedMarkerSet.has(marker.id)}
                  onToggle={() => onToggleMarkerLoaded(marker.id)}
                  toggleLabel={`Show ${marker.name}`}
                  name={marker.name}
                  selected={marker.id === selectedId}
                  onSelect={() => onSelectMarker(marker.id)}
                  onRename={(name) => onRenameMarker(marker.id, name)}
                  onDelete={() => {
                    if (window.confirm(`Delete marker “${marker.name}”?`)) onDeleteMarker(marker.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <header className="panel-subheader">
        <h3>Sets</h3>
        <button type="button" className="text-btn" onClick={onAddSet}>
          New set
        </button>
      </header>

      <div className="panel-section">
        {sets.length === 0 ? (
          <p className="panel-empty">Group markers into an ordered route. A marker can appear more than once.</p>
        ) : (
          <ul className="panel-list set-list">
            {sets.map((set, index) => (
              <li key={set.id} className="set-block">
                <Row
                  checked={loadedSetSet.has(set.id)}
                  onToggle={() => onToggleSetLoaded(set.id)}
                  toggleLabel={`Show set ${set.name}`}
                  name={set.name}
                  swatch={setLineColor(index)}
                  onRename={(name) => onRenameSet(set.id, name)}
                  onDelete={() => {
                    if (window.confirm(`Delete set “${set.name}”? Markers will be kept.`)) onDeleteSet(set.id);
                  }}
                />
                <ol className="set-members">
                  {set.markerIds.map((markerId, memberIndex) => {
                    const marker = markerById.get(markerId);
                    if (!marker) return null;
                    const prev = memberIndex > 0 ? markerById.get(set.markerIds[memberIndex - 1]) : undefined;
                    const leg = prev
                      ? `${formatBearing(bearingTrue(prev, marker))} ${formatRangeNmi(distanceNmi(prev, marker))}`
                      : null;
                    return (
                      <li key={`${markerId}-${memberIndex}`} className="set-member">
                        <button
                          type="button"
                          className={`set-member-select${marker.id === selectedId ? " is-selected" : ""}`}
                          onClick={() => onSelectMarker(marker.id)}
                        >
                          <span className="set-member-index">{memberIndex + 1}</span>
                          <span className="set-member-name">{marker.name}</span>
                          {leg ? (
                            <span className="set-member-leg" title={`From ${prev?.name ?? "previous marker"}`}>
                              {leg}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${marker.name} from set`}
                          onClick={() => onRemoveMarkerFromSet(set.id, memberIndex)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <AddToSetSelect markers={markers} onAdd={(markerId) => onAddMarkerToSet(set.id, markerId)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({
  checked,
  onToggle,
  toggleLabel,
  name,
  selected,
  swatch,
  onSelect,
  onRename,
  onDelete,
}: {
  checked: boolean;
  onToggle: () => void;
  toggleLabel: string;
  name: string;
  selected?: boolean;
  swatch?: string;
  onSelect?: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="panel-row">
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={toggleLabel} />
      {swatch ? <span className="set-swatch" style={{ background: swatch }} aria-hidden /> : null}
      <EditableName name={name} selected={selected} onSelect={onSelect} onRename={onRename} />
      <button type="button" className="icon-btn" aria-label={`Delete ${name}`} onClick={onDelete}>
        <TrashIcon />
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function EditableName({
  name,
  selected,
  onSelect,
  onRename,
}: {
  name: string;
  selected?: boolean;
  onSelect?: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  if (editing) {
    return (
      <input
        className="name-input"
        value={draft}
        autoFocus
        aria-label="Name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`name-btn${selected ? " is-selected" : ""}`}
      onClick={onSelect ?? (() => setEditing(true))}
      onDoubleClick={() => setEditing(true)}
      title={onSelect ? "Select · double-click to rename" : "Click to rename"}
    >
      {name}
    </button>
  );
}

function AddToSetSelect({
  markers,
  onAdd,
}: {
  markers: ChartMarker[];
  onAdd: (markerId: string) => void;
}) {
  if (markers.length === 0) return null;
  return (
    <select
      className="add-to-set"
      value=""
      aria-label="Add marker to set"
      onChange={(event) => {
        const id = event.target.value;
        if (id) onAdd(id);
      }}
    >
      <option value="">Add marker…</option>
      {markers.map((marker) => (
        <option key={marker.id} value={marker.id}>
          {marker.name}
        </option>
      ))}
    </select>
  );
}
