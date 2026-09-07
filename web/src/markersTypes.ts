export type ChartMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type MarkerSet = {
  id: string;
  name: string;
  markerIds: string[];
};

export type MarkersState = {
  version: 1;
  markers: ChartMarker[];
  sets: MarkerSet[];
  loadedMarkerIds: string[];
  loadedSetIds: string[];
};

export const SET_LINE_COLORS = ["#7eb8da", "#e0b07a", "#8fd4a8", "#d48fd0", "#e07a7a"] as const;

export function setLineColor(index: number): string {
  return SET_LINE_COLORS[index % SET_LINE_COLORS.length];
}

export function emptyMarkersState(): MarkersState {
  return {
    version: 1,
    markers: [],
    sets: [],
    loadedMarkerIds: [],
    loadedSetIds: [],
  };
}

export function nextIndexedName(items: { name: string }[], prefix: string): string {
  const used = new Set(items.map((item) => item.name));
  let n = items.length + 1;
  while (used.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}

export function setNameParts(name: string): { folders: string[]; title: string } {
  const parts = name.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { folders: [], title: name };
  if (parts.length === 1) return { folders: [], title: parts[0] };
  return { folders: parts.slice(0, -1), title: parts[parts.length - 1] };
}

export function joinSetPath(folders: string[], title: string): string {
  return [...folders, title].join("/");
}

export type SetTree = {
  entries: SetTreeEntry[];
};

export type SetTreeEntry =
  | { kind: "folder"; name: string; tree: SetTree }
  | { kind: "set"; set: MarkerSet; index: number };

export function buildSetTree(sets: MarkerSet[]): SetTree {
  const root: SetTree = { entries: [] };
  type FolderSlot = { tree: SetTree; children: Map<string, FolderSlot> };
  const rootSlot: FolderSlot = { tree: root, children: new Map() };

  function folderAt(slot: FolderSlot, name: string): FolderSlot {
    let child = slot.children.get(name);
    if (!child) {
      child = { tree: { entries: [] }, children: new Map() };
      slot.children.set(name, child);
      slot.tree.entries.push({ kind: "folder", name, tree: child.tree });
    }
    return child;
  }

  sets.forEach((set, index) => {
    const { folders } = setNameParts(set.name);
    let slot = rootSlot;
    for (const folder of folders) slot = folderAt(slot, folder);
    slot.tree.entries.push({ kind: "set", set, index });
  });

  return root;
}

export function treeSetIds(tree: SetTree): string[] {
  const ids: string[] = [];
  for (const entry of tree.entries) {
    if (entry.kind === "set") ids.push(entry.set.id);
    else ids.push(...treeSetIds(entry.tree));
  }
  return ids;
}

export function folderPathKey(path: string[]): string {
  return JSON.stringify(path);
}

export function renameFolderSegment(name: string, path: string[], nextSegment: string): string {
  const { folders, title } = setNameParts(name);
  if (path.length === 0 || folders.length < path.length) return name;
  for (let i = 0; i < path.length; i++) {
    if (folders[i] !== path[i]) return name;
  }
  const segments = nextSegment.split("/").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return name;
  const nextFolders = [...folders];
  nextFolders.splice(path.length - 1, 1, ...segments);
  return joinSetPath(nextFolders, title);
}
