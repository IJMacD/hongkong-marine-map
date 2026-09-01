import { useEffect, useMemo } from "react";
import type { VersionInfo } from "./types";

type Props = {
  versions: VersionInfo[];
  versionId: string;
  onChange: (id: string) => void;
};

function toMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function nearestVersion(versions: VersionInfo[], ms: number): VersionInfo {
  return versions.reduce((best, version) => {
    const bestDelta = Math.abs(toMs(best.capturedAt) - ms);
    const delta = Math.abs(toMs(version.capturedAt) - ms);
    return delta < bestDelta ? version : best;
  });
}

function yearMarks(t0: number, t1: number): { year: number; ms: number }[] {
  const startYear = new Date(t0).getUTCFullYear();
  const endYear = new Date(t1).getUTCFullYear();
  const marks: { year: number; ms: number }[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const ms = Date.parse(`${year}-01-01T00:00:00Z`);
    if (ms >= t0 && ms <= t1) marks.push({ year, ms });
  }
  if (!marks.some((m) => m.year === startYear)) {
    marks.unshift({ year: startYear, ms: t0 });
  }
  return marks;
}

export function VersionSlider({ versions, versionId, onChange }: Props) {
  const chronological = useMemo(
    () => [...versions].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id)),
    [versions],
  );
  const index = Math.max(0, chronological.findIndex((v) => v.id === versionId));
  const current = chronological[index];
  const t0 = chronological.length ? toMs(chronological[0].capturedAt) : 0;
  const t1 = chronological.length ? toMs(chronological[chronological.length - 1].capturedAt) : 0;
  const span = Math.max(1, t1 - t0);
  const years = useMemo(() => yearMarks(t0, t1), [t0, t1]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft" && index > 0) {
        onChange(chronological[index - 1].id);
      } else if (event.key === "ArrowRight" && index < chronological.length - 1) {
        onChange(chronological[index + 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chronological, index, onChange]);

  if (!current) return null;

  const position = (ms: number) => `${((ms - t0) / span) * 100}%`;

  return (
    <div className="version-bar">
      <div className="version-label">
        <strong>{current.label}</strong>
        {current.edition ? <span className="edition">Chart {current.edition}</span> : null}
      </div>
      <div className="version-timeline">
        <div className="version-ticks" aria-hidden>
          {chronological.map((version) => (
            <span
              key={version.id}
              className={`version-tick${version.id === current.id ? " is-active" : ""}`}
              style={{ left: position(toMs(version.capturedAt)) }}
              title={version.label}
            />
          ))}
        </div>
        <input
          className="version-slider"
          type="range"
          min={0}
          max={span}
          step={1}
          value={toMs(current.capturedAt) - t0}
          aria-label="Historical chart version"
          disabled={chronological.length < 2}
          onChange={(event) => {
            const next = nearestVersion(chronological, t0 + Number(event.currentTarget.value));
            if (next.id !== current.id) onChange(next.id);
          }}
        />
      </div>
      <div className="version-years" aria-hidden>
        {years.map((mark) => (
          <span key={mark.year} className="version-year" style={{ left: position(mark.ms) }}>
            {mark.year}
          </span>
        ))}
      </div>
    </div>
  );
}
