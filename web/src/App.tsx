import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartMap } from "./ChartMap";
import type { VersionInfo } from "./types";
import { readLocation } from "./urlState";
import { VersionSlider } from "./VersionSlider";

export default function App() {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState(() => readLocation().versionId);

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

  const selected = useMemo(() => {
    if (!versions?.length) return undefined;
    if (versionId === "latest") return versions[0];
    return versions.find((v) => v.id === versionId) ?? versions[0];
  }, [versions, versionId]);

  const onChange = useCallback((id: string) => setVersionId(id), []);

  return (
    <div className="app">
      <ChartMap version={selected} />
      {versions && versions.length > 0 ? (
        <VersionSlider versions={versions} versionId={selected?.id ?? versionId} onChange={onChange} />
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
      )}
    </div>
  );
}
