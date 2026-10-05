import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { bearingTrue, distanceNmi, formatBearing, formatRangeNmi } from "./geo";
import {
  createShareCode,
  fetchShareCode,
  filterShareCodeInput,
  formatImportSummary,
  formatReplaceSummary,
  parseMarkersTransferText,
  SHARE_CODE_LENGTH,
  ShareRequestError,
  visibleMarkersState,
  type ImportSummary,
} from "./markersTransfer";
import {
  buildSetTree,
  folderPathKey,
  setLineColor,
  setNameParts,
  treeSetIds,
  type ChartMarker,
  type MarkerSet,
  type MarkersState,
  type SetTree,
} from "./markersTypes";

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
  onAddSet: (folderPath?: string[]) => MarkerSet;
  onRenameSet: (id: string, name: string) => void;
  onRenameFolder: (path: string[], name: string) => void;
  onDeleteSet: (id: string) => void;
  onToggleSetLoaded: (id: string) => void;
  onSetSetsLoaded: (ids: string[], loaded: boolean) => void;
  onAddMarkerToSet: (setId: string, markerId: string) => void;
  onRemoveMarkerFromSet: (setId: string, index: number) => void;
  onExport: (state: MarkersState) => void;
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
  onRenameFolder,
  onDeleteSet,
  onToggleSetLoaded,
  onSetSetsLoaded,
  onAddMarkerToSet,
  onRemoveMarkerFromSet,
  onExport,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const shareCodeRef = useRef<HTMLInputElement>(null);
  const exportRequestRef = useRef(0);
  const [pending, setPending] = useState<{ document: MarkersState; name: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [enterCode, setEnterCode] = useState(false);
  const [exporting, setExporting] = useState<{
    document: MarkersState;
    code: string | null;
    expiresIn: number;
    error: string | null;
  } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [busy, setBusy] = useState(false);
  const [exportPick, setExportPick] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [expandedSets, setExpandedSets] = useState<Set<string>>(() => new Set());
  const loadedMarkerSet = new Set(loadedMarkerIds);
  const loadedSetSet = new Set(loadedSetIds);
  const setTree = useMemo(() => buildSetTree(sets), [sets]);
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  const libraryEmpty = markers.length === 0 && sets.length === 0;
  const shareCodeValue = exporting?.code ?? null;

  useEffect(() => {
    if (!enterCode) return;
    codeInputRef.current?.focus();
  }, [enterCode]);

  function clearExport() {
    exportRequestRef.current += 1;
    setExporting(null);
    setCopyState("idle");
  }

  function clearTransferUi() {
    clearExport();
    setPending(null);
    setNotice(null);
    setEnterCode(false);
    setCodeDraft("");
    setExportPick(false);
  }

  function applyImport(incoming: MarkersState, mode: "merge" | "replace") {
    const summary = onImport(incoming, mode);
    clearExport();
    setPending(null);
    setEnterCode(false);
    setNotice({
      kind: "ok",
      text: mode === "replace" ? formatReplaceSummary(summary) : formatImportSummary(summary),
    });
  }

  function offerImport(document: MarkersState, name: string) {
    clearExport();
    setNotice(null);
    setEnterCode(false);
    setExportPick(false);
    if (libraryEmpty) {
      applyImport(document, "merge");
      return;
    }
    setPending({ document, name });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      clearTransferUi();
      setNotice({ kind: "error", text: "Could not read that file." });
      return;
    }
    const document = parseMarkersTransferText(text);
    if (!document) {
      clearTransferUi();
      setNotice({ kind: "error", text: "Not a markers file." });
      return;
    }
    offerImport(document, file.name);
  }

  async function redeemCode(raw: string) {
    const code = filterShareCodeInput(raw);
    if (code.length !== SHARE_CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      const document = await fetchShareCode(code);
      offerImport(document, `code ${code}`);
    } catch (err) {
      setPending(null);
      clearExport();
      setEnterCode(true);
      setNotice({
        kind: "error",
        text: err instanceof ShareRequestError ? err.message : "Could not load that share code.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onExportCode(scope: "all" | "visible") {
    if (libraryEmpty || busy) return;
    const full: MarkersState = {
      version: 1,
      markers,
      sets,
      loadedMarkerIds,
      loadedSetIds,
    };
    const document = scope === "visible" ? visibleMarkersState(full) : full;
    if (document.markers.length === 0 && document.sets.length === 0) {
      setExportPick(false);
      clearExport();
      setNotice({ kind: "error", text: "Nothing visible to export." });
      return;
    }
    const requestId = ++exportRequestRef.current;
    setBusy(true);
    setPending(null);
    setNotice(null);
    setEnterCode(false);
    setExportPick(false);
    setCopyState("idle");
    setExporting({ document, code: null, expiresIn: 0, error: null });
    try {
      const result = await createShareCode(document);
      if (requestId !== exportRequestRef.current) return;
      setExporting({ document, code: result.code, expiresIn: result.expiresIn, error: null });
    } catch (err) {
      if (requestId !== exportRequestRef.current) return;
      setExporting({
        document,
        code: null,
        expiresIn: 0,
        error: err instanceof ShareRequestError ? err.message : "Could not create a share code.",
      });
    } finally {
      if (requestId === exportRequestRef.current) setBusy(false);
    }
  }

  function selectShareCode() {
    const field = shareCodeRef.current;
    if (!field) return;
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
  }

  async function copyShareCode(code: string) {
    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(code);
        setCopyState("copied");
        return;
      }
    } catch {
      /* HTTP and some mobile browsers reject clipboard.writeText */
    }
    selectShareCode();
    try {
      if (document.execCommand("copy")) {
        setCopyState("copied");
        return;
      }
    } catch {
      /* ignore */
    }
    setCopyState("failed");
  }

  function addSetIn(folderPath: string[] = []) {
    const set = onAddSet(folderPath);
    if (folderPath.length > 0) {
      const paths: string[][] = [];
      for (let i = 1; i <= folderPath.length; i += 1) paths.push(folderPath.slice(0, i));
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        for (const folder of paths) next.add(folderPathKey(folder));
        return next;
      });
    }
    setExpandedSets((prev) => {
      const next = new Set(prev);
      next.add(set.id);
      return next;
    });
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
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setPending(null);
              setNotice(null);
              clearExport();
              setCodeDraft("");
              setExportPick(false);
              setEnterCode(true);
            }}
          >
            Import
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={libraryEmpty || busy}
            onClick={() => {
              setPending(null);
              setNotice(null);
              setEnterCode(false);
              clearExport();
              setExportPick(true);
            }}
          >
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

      {exportPick ? (
        <div className="import-choice">
          <p>Export the whole library, or only what’s on the chart.</p>
          <button type="button" className="text-btn" disabled={busy} onClick={() => void onExportCode("all")}>
            All
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={busy || (loadedMarkerIds.length === 0 && loadedSetIds.length === 0)}
            onClick={() => void onExportCode("visible")}
          >
            Visible only
          </button>
          <button type="button" className="icon-btn" aria-label="Cancel export" onClick={clearTransferUi}>
            ×
          </button>
        </div>
      ) : exporting ? (
        <div className="import-choice">
          {shareCodeValue ? (
            <>
              <input
                ref={shareCodeRef}
                className="share-code"
                value={shareCodeValue}
                readOnly
                aria-label="Share code"
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
              />
              <p>
                Enter this code on the other device. Expires in{" "}
                {Math.max(1, Math.round(exporting.expiresIn / 60))} min.
              </p>
            </>
          ) : (
            <p className={exporting.error ? "is-error" : undefined}>
              {exporting.error ?? "Getting a share code…"}
            </p>
          )}
          {shareCodeValue ? (
            <button type="button" className="text-btn" onClick={() => void copyShareCode(shareCodeValue)}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy"}
            </button>
          ) : exporting.error ? null : (
            <button type="button" className="text-btn" disabled>
              Copy
            </button>
          )}
          <button type="button" className="text-btn" onClick={() => onExport(exporting.document)}>
            Save file
          </button>
          <button type="button" className="icon-btn" aria-label="Dismiss export" onClick={clearTransferUi}>
            ×
          </button>
        </div>
      ) : pending ? (
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
              if (window.confirm("This deletes markers that are not in the import.")) {
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
      ) : enterCode ? (
        <div className="import-choice">
          <label className="share-code-field">
            <span>Code</span>
            <input
              ref={codeInputRef}
              className="name-input share-code-input"
              value={codeDraft}
              maxLength={SHARE_CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              aria-label="Share code"
              disabled={busy}
              onChange={(event) => {
                const next = filterShareCodeInput(event.target.value);
                setNotice(null);
                setCodeDraft(next);
                if (next.length === SHARE_CODE_LENGTH) void redeemCode(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void redeemCode(codeDraft);
              }}
            />
          </label>
          <button
            type="button"
            className="text-btn"
            disabled={busy || codeDraft.length !== SHARE_CODE_LENGTH}
            onClick={() => void redeemCode(codeDraft)}
          >
            Get
          </button>
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            File
          </button>
          <button type="button" className="icon-btn" aria-label="Cancel import" onClick={clearTransferUi}>
            ×
          </button>
        </div>
      ) : null}
      {notice && !pending && !exporting && !exportPick ? (
        <p className={`import-status${notice.kind === "error" ? " is-error" : ""}`}>{notice.text}</p>
      ) : null}

      <div className="panel-section">
        {markers.length === 0 ? (
          <p className="panel-empty">
            Use the pin tool, then click the chart to place a marker. Or Import a file or share code from another
            device.
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
        <button type="button" className="text-btn" onClick={() => addSetIn()}>
          New set
        </button>
      </header>

      <div className="panel-section">
        {sets.length === 0 ? (
          <p className="panel-empty">Group markers into an ordered route. A marker can appear more than once.</p>
        ) : (
          <SetTreeList
            tree={setTree}
            path={[]}
            markers={markers}
            markerById={markerById}
            selectedId={selectedId}
            loadedSetSet={loadedSetSet}
            expandedFolders={expandedFolders}
            expandedSets={expandedSets}
            onToggleFolder={(key) => {
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            }}
            onToggleSet={(id) => {
              setExpandedSets((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onExpandFolders={(paths) => {
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                for (const folderPath of paths) next.add(folderPathKey(folderPath));
                return next;
              });
            }}
            onSelectMarker={onSelectMarker}
            onRenameSet={onRenameSet}
            onRenameFolder={onRenameFolder}
            onDeleteSet={onDeleteSet}
            onToggleSetLoaded={onToggleSetLoaded}
            onSetSetsLoaded={onSetSetsLoaded}
            onAddSetIn={addSetIn}
            onAddMarkerToSet={onAddMarkerToSet}
            onRemoveMarkerFromSet={onRemoveMarkerFromSet}
          />
        )}
      </div>
    </section>
  );
}

function SetTreeList({
  tree,
  path,
  markers,
  markerById,
  selectedId,
  loadedSetSet,
  expandedFolders,
  expandedSets,
  onToggleFolder,
  onToggleSet,
  onExpandFolders,
  onSelectMarker,
  onRenameSet,
  onRenameFolder,
  onDeleteSet,
  onToggleSetLoaded,
  onSetSetsLoaded,
  onAddSetIn,
  onAddMarkerToSet,
  onRemoveMarkerFromSet,
}: {
  tree: SetTree;
  path: string[];
  markers: ChartMarker[];
  markerById: Map<string, ChartMarker>;
  selectedId: string | null;
  loadedSetSet: Set<string>;
  expandedFolders: Set<string>;
  expandedSets: Set<string>;
  onToggleFolder: (key: string) => void;
  onToggleSet: (id: string) => void;
  onExpandFolders: (paths: string[][]) => void;
  onSelectMarker: (id: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onRenameFolder: (path: string[], name: string) => void;
  onDeleteSet: (id: string) => void;
  onToggleSetLoaded: (id: string) => void;
  onSetSetsLoaded: (ids: string[], loaded: boolean) => void;
  onAddSetIn: (folderPath: string[]) => void;
  onAddMarkerToSet: (setId: string, markerId: string) => void;
  onRemoveMarkerFromSet: (setId: string, index: number) => void;
}) {
  return (
    <ul className={`panel-list set-list${path.length > 0 ? " set-tree-nested" : ""}`}>
      {tree.entries.map((entry) => {
        if (entry.kind === "folder") {
          const folderPath = [...path, entry.name];
          const key = folderPathKey(folderPath);
          const expanded = expandedFolders.has(key);
          const ids = treeSetIds(entry.tree);
          const loadedCount = ids.reduce((count, id) => count + (loadedSetSet.has(id) ? 1 : 0), 0);
          const allLoaded = ids.length > 0 && loadedCount === ids.length;
          const mixed = loadedCount > 0 && !allLoaded;
          return (
            <li key={`folder:${key}`} className="folder-block">
              <Row
                checked={allLoaded}
                indeterminate={mixed}
                onToggle={() => onSetSetsLoaded(ids, !allLoaded)}
                toggleLabel={`Show sets in ${folderPath.join("/")}`}
                name={entry.name}
                caret={{
                  expanded,
                  label: expanded ? `Collapse folder ${entry.name}` : `Expand folder ${entry.name}`,
                  onToggle: () => onToggleFolder(key),
                }}
                onSelect={() => onToggleFolder(key)}
                onRename={(name) => {
                  onRenameFolder(folderPath, name);
                  const segments = name.split("/").map((part) => part.trim()).filter(Boolean);
                  if (segments.length === 0) return;
                  const paths: string[][] = [];
                  const acc = [...path];
                  for (const segment of segments) {
                    acc.push(segment);
                    paths.push([...acc]);
                  }
                  onExpandFolders(paths);
                }}
                onAdd={() => onAddSetIn(folderPath)}
                addLabel={`New set in ${folderPath.join("/")}`}
              />
              {expanded ? (
                <SetTreeList
                  tree={entry.tree}
                  path={folderPath}
                  markers={markers}
                  markerById={markerById}
                  selectedId={selectedId}
                  loadedSetSet={loadedSetSet}
                  expandedFolders={expandedFolders}
                  expandedSets={expandedSets}
                  onToggleFolder={onToggleFolder}
                  onToggleSet={onToggleSet}
                  onExpandFolders={onExpandFolders}
                  onSelectMarker={onSelectMarker}
                  onRenameSet={onRenameSet}
                  onRenameFolder={onRenameFolder}
                  onDeleteSet={onDeleteSet}
                  onToggleSetLoaded={onToggleSetLoaded}
                  onSetSetsLoaded={onSetSetsLoaded}
                  onAddSetIn={onAddSetIn}
                  onAddMarkerToSet={onAddMarkerToSet}
                  onRemoveMarkerFromSet={onRemoveMarkerFromSet}
                />
              ) : null}
            </li>
          );
        }

        const { set, index } = entry;
        const { title } = setNameParts(set.name);
        const expanded = expandedSets.has(set.id);
        return (
          <li key={set.id} className="set-block">
            <Row
              checked={loadedSetSet.has(set.id)}
              onToggle={() => onToggleSetLoaded(set.id)}
              toggleLabel={`Show set ${set.name}`}
              name={title}
              editName={set.name}
              swatch={setLineColor(index)}
              caret={{
                expanded,
                label: expanded ? `Collapse set ${title}` : `Expand set ${title}`,
                onToggle: () => onToggleSet(set.id),
              }}
              onRename={(name) => {
                onRenameSet(set.id, name);
                const nextFolders = setNameParts(name).folders;
                if (nextFolders.length > 0) {
                  const paths: string[][] = [];
                  for (let i = 1; i <= nextFolders.length; i += 1) paths.push(nextFolders.slice(0, i));
                  onExpandFolders(paths);
                }
              }}
              onDelete={() => {
                if (window.confirm(`Delete set “${set.name}”? Markers will be kept.`)) onDeleteSet(set.id);
              }}
            />
            {expanded ? (
              <>
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
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function Row({
  checked,
  indeterminate,
  onToggle,
  toggleLabel,
  name,
  editName,
  selected,
  swatch,
  caret,
  onSelect,
  selectHint,
  onRename,
  onDelete,
  onAdd,
  addLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  toggleLabel: string;
  name: string;
  editName?: string;
  selected?: boolean;
  swatch?: string;
  caret?: { expanded: boolean; label: string; onToggle: () => void };
  onSelect?: () => void;
  selectHint?: string;
  onRename: (name: string) => void;
  onDelete?: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const checkRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <div className="panel-row">
      {caret ? (
        <button
          type="button"
          className={`tree-caret${caret.expanded ? " is-expanded" : ""}`}
          aria-expanded={caret.expanded}
          aria-label={caret.label}
          onClick={caret.onToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9 6.5 15 12l-6 5.5z" />
          </svg>
        </button>
      ) : null}
      <input
        ref={checkRef}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={toggleLabel}
      />
      {swatch ? <span className="set-swatch" style={{ background: swatch }} aria-hidden /> : null}
      <EditableName
        name={name}
        editName={editName}
        selected={selected}
        onSelect={onSelect}
        selectHint={selectHint}
        onRename={onRename}
      />
      {onAdd ? (
        <button type="button" className="icon-btn" aria-label={addLabel ?? `New set in ${name}`} onClick={onAdd}>
          <PlusIcon />
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="icon-btn" aria-label={`Delete ${name}`} onClick={onDelete}>
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
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

export function EditableName({
  name,
  editName,
  selected,
  onSelect,
  selectHint = "Expand",
  onRename,
}: {
  name: string;
  editName?: string;
  selected?: boolean;
  onSelect?: () => void;
  selectHint?: string;
  onRename: (name: string) => void;
}) {
  const stored = editName ?? name;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);

  useEffect(() => {
    setDraft(stored);
  }, [stored]);

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
            setDraft(stored);
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
      title={
        onSelect
          ? stored !== name
            ? `${stored} · double-click to rename`
            : `${selectHint} · double-click to rename`
          : stored !== name
            ? `${stored} · click to rename`
            : "Click to rename"
      }
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
