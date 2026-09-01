import { useEffect, useMemo } from "react";
import type { VersionInfo } from "./types";

type Props = {
  versions: VersionInfo[];
  versionId: string;
  onChange: (id: string) => void;
};

export function VersionSlider({ versions, versionId, onChange }: Props) {
  const chronological = useMemo(
    () => [...versions].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id)),
    [versions],
  );
  const index = Math.max(0, chronological.findIndex((v) => v.id === versionId));
  const current = chronological[index];

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

  return (
    <div className="version-bar">
      <div className="version-label">
        <strong>{current.label}</strong>
        {current.edition ? <span className="edition">Chart {current.edition}</span> : null}
      </div>
      <input
        className="version-slider"
        type="range"
        min={0}
        max={Math.max(0, chronological.length - 1)}
        step={1}
        value={index}
        aria-label="Historical chart version"
        disabled={chronological.length < 2}
        onChange={(event) => {
          const next = chronological[Number(event.target.value)];
          if (next) onChange(next.id);
        }}
      />
      <div className="version-ends">
        <span>{chronological[0]?.label}</span>
        <span>{chronological[chronological.length - 1]?.label}</span>
      </div>
    </div>
  );
}
