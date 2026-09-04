import { useEffect, useMemo, useRef, useState } from "react";
import { bearingTrue, distanceNmi, formatBearing, formatCoord, formatRangeNmi, parseCoord } from "./geo";
import { setLineColor, type ChartMarker, type MarkerSet } from "./markersTypes";
import type { LocateState } from "./LocateControl";
import { isGeolocationAvailable, type UserPosition } from "./userLocation";

type Props = {
  marker: ChartMarker;
  markers: ChartMarker[];
  sets: MarkerSet[];
  loadedSetIds: string[];
  userPosition: UserPosition | null;
  locateState: LocateState;
  onRename: (name: string) => void;
  onMove: (lat: number, lng: number) => void;
  onClose: () => void;
  onDelete: () => void;
  onRequestLocate: () => void;
};

export function MarkerDetail({
  marker,
  markers,
  sets,
  loadedSetIds,
  userPosition,
  locateState,
  onRename,
  onMove,
  onClose,
  onDelete,
  onRequestLocate,
}: Props) {
  const [draft, setDraft] = useState(marker.name);
  const [latDraft, setLatDraft] = useState(() => formatCoord(marker.lat));
  const [lngDraft, setLngDraft] = useState(() => formatCoord(marker.lng));
  const skipRenameRef = useRef(false);
  const skipLatRef = useRef(false);
  const skipLngRef = useRef(false);

  useEffect(() => {
    setDraft(marker.name);
  }, [marker.id, marker.name]);

  useEffect(() => {
    setLatDraft(formatCoord(marker.lat));
    setLngDraft(formatCoord(marker.lng));
  }, [marker.id, marker.lat, marker.lng]);

  const fromGps = useMemo(() => {
    if (!userPosition) return null;
    const from = { lat: userPosition.lat, lng: userPosition.lng };
    return {
      bearing: bearingTrue(from, marker),
      range: distanceNmi(from, marker),
    };
  }, [userPosition, marker]);

  const nextLegs = useMemo(() => {
    const byId = new Map(markers.map((item) => [item.id, item]));
    const loaded = new Set(loadedSetIds);
    const legs: {
      key: string;
      setName: string;
      color: string;
      nextName: string;
      bearing: number;
      range: number;
    }[] = [];
    sets.forEach((set, index) => {
      if (!loaded.has(set.id)) return;
      set.markerIds.forEach((id, idx) => {
        if (id !== marker.id || idx === set.markerIds.length - 1) return;
        const next = byId.get(set.markerIds[idx + 1]);
        if (!next) return;
        legs.push({
          key: `${set.id}-${idx}`,
          setName: set.name,
          color: setLineColor(index),
          nextName: next.name,
          bearing: bearingTrue(marker, next),
          range: distanceNmi(marker, next),
        });
      });
    });
    return legs;
  }, [marker, markers, sets, loadedSetIds]);

  return (
    <section className="glass-panel marker-detail" aria-label="Selected marker">
      <header className="panel-header">
        <input
          className="name-input title-input"
          value={draft}
          aria-label="Marker name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (skipRenameRef.current) {
              skipRenameRef.current = false;
              return;
            }
            onRename(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              skipRenameRef.current = true;
              setDraft(marker.name);
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={`Delete ${marker.name}`}
          onClick={() => {
            if (window.confirm(`Delete marker “${marker.name}”?`)) onDelete();
          }}
        >
          <TrashIcon />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Deselect marker">
          ×
        </button>
      </header>
      <div className="coord-fields">
        <CoordField
          label="LAT"
          value={latDraft}
          ariaLabel="Latitude"
          skipRef={skipLatRef}
          onChange={setLatDraft}
          onCommit={() => {
            const parsed = parseCoord(latDraft, "lat");
            if (parsed == null) {
              setLatDraft(formatCoord(marker.lat));
              return;
            }
            setLatDraft(formatCoord(parsed));
            onMove(parsed, marker.lng);
          }}
          onRevert={() => setLatDraft(formatCoord(marker.lat))}
        />
        <CoordField
          label="LON"
          value={lngDraft}
          ariaLabel="Longitude"
          skipRef={skipLngRef}
          onChange={setLngDraft}
          onCommit={() => {
            const parsed = parseCoord(lngDraft, "lng");
            if (parsed == null) {
              setLngDraft(formatCoord(marker.lng));
              return;
            }
            setLngDraft(formatCoord(parsed));
            onMove(marker.lat, parsed);
          }}
          onRevert={() => setLngDraft(formatCoord(marker.lng))}
        />
      </div>

      {fromGps ? (
        <BrgRng legend="From GPS" bearing={fromGps.bearing} range={fromGps.range} />
      ) : !isGeolocationAvailable() || locateState === "error" ? (
        <p className="brg-status">Location unavailable.</p>
      ) : locateState === "locating" ? (
        <p className="brg-status">Finding location…</p>
      ) : (
        <div className="brg-prompt">
          <p>Turn on location to see bearing and range.</p>
          <button type="button" className="text-btn" onClick={onRequestLocate}>
            Show my location
          </button>
        </div>
      )}

      {nextLegs.map((leg) => (
        <BrgRng
          key={leg.key}
          legend={`Next in ${leg.setName}`}
          hint={leg.nextName}
          swatch={leg.color}
          bearing={leg.bearing}
          range={leg.range}
        />
      ))}
    </section>
  );
}

function CoordField({
  label,
  value,
  ariaLabel,
  skipRef,
  onChange,
  onCommit,
  onRevert,
}: {
  label: string;
  value: string;
  ariaLabel: string;
  skipRef: { current: boolean };
  onChange: (value: string) => void;
  onCommit: () => void;
  onRevert: () => void;
}) {
  return (
    <label className="coord-field">
      <span className="brg-label">{label}</span>
      <input
        className="name-input coord-input"
        value={value}
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (skipRef.current) {
            skipRef.current = false;
            return;
          }
          onCommit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            skipRef.current = true;
            onRevert();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
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

function BrgRng({
  legend,
  hint,
  swatch,
  bearing,
  range,
}: {
  legend: string;
  hint?: string;
  swatch?: string;
  bearing: number;
  range: number;
}) {
  return (
    <div className="brg-rng">
      <div className="brg-legend">
        {swatch ? <span className="set-swatch" style={{ background: swatch }} aria-hidden /> : null}
        <span>{legend}</span>
        {hint ? <span className="brg-hint">{hint}</span> : null}
      </div>
      <div className="brg-values">
        <div>
          <span className="brg-label">BRG</span>
          <span className="brg-value">{formatBearing(bearing)}</span>
        </div>
        <div>
          <span className="brg-label">RNG</span>
          <span className="brg-value">{formatRangeNmi(range)}</span>
        </div>
      </div>
    </div>
  );
}
