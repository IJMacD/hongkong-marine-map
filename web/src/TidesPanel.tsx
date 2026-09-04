import { useEffect, useState } from "react";
import {
  formatTidalLabel,
  SLOT_MAX_MINUTES,
  SLOT_STEP_MINUTES,
  type TidalSlot,
} from "./useTidalCurrents";

type Props = {
  slot: TidalSlot;
  loading: boolean;
  error: string | null;
  onChange: (slot: TidalSlot) => void;
};

const HOUR_MARKS = [0, 6, 12, 18];
const LOADING_LINE_DELAY_MS = 400;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function TidesPanel({ slot, loading, error, onChange }: Props) {
  const [showLoading, setShowLoading] = useState(false);
  const position = (minutes: number) => `${(minutes / SLOT_MAX_MINUTES) * 100}%`;

  useEffect(() => {
    if (!loading || error) {
      setShowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowLoading(true), LOADING_LINE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loading, error]);

  const status = error ? error : "";

  return (
    <div className="version-bar tides-bar">
      <div className="version-label tides-label">
        <div className="tides-heading">
          <strong className="tides-time">{formatTidalLabel(slot)}</strong>
          <span
            className={`tides-spinner${showLoading && !error ? " is-on" : ""}`}
            role={showLoading && !error ? "status" : undefined}
            aria-label={showLoading && !error ? "Loading tidal streams" : undefined}
            aria-hidden={showLoading && !error ? undefined : true}
          />
        </div>
        {status ? <span className="tides-status is-error">{status}</span> : null}
        <label className="tides-date">
          <span className="visually-hidden">Date</span>
          <input
            type="date"
            value={slot.date}
            aria-label="Tidal stream date"
            onChange={(event) => {
              const date = event.currentTarget.value;
              if (!date) return;
              onChange({ date, minutes: slot.minutes });
            }}
          />
        </label>
      </div>
      <div className="version-timeline">
        <input
          className="version-slider"
          type="range"
          min={0}
          max={SLOT_MAX_MINUTES}
          step={SLOT_STEP_MINUTES}
          value={slot.minutes}
          aria-label="Time of day"
          onChange={(event) => {
            onChange({ date: slot.date, minutes: Number(event.currentTarget.value) });
          }}
        />
      </div>
      <div className="version-years" aria-hidden>
        {HOUR_MARKS.map((hour) => (
          <span key={hour} className="version-year" style={{ left: position(hour * 60) }}>
            {pad2(hour)}:00
          </span>
        ))}
      </div>
    </div>
  );
}
