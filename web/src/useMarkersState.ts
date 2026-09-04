import { useCallback, useEffect, useMemo, useState } from "react";
import { loadMarkersState, saveMarkersState } from "./markersStorage";
import { nextIndexedName, type ChartMarker, type MarkerSet, type MarkersState } from "./markersTypes";

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useMarkersState() {
  const [state, setState] = useState<MarkersState>(() => loadMarkersState());

  useEffect(() => {
    saveMarkersState(state);
  }, [state]);

  const visibleMarkers = useMemo(() => {
    const loadedMarkers = new Set(state.loadedMarkerIds);
    const fromSets = new Set<string>();
    const loadedSets = new Set(state.loadedSetIds);
    for (const set of state.sets) {
      if (!loadedSets.has(set.id)) continue;
      for (const id of set.markerIds) fromSets.add(id);
    }
    return state.markers.filter((marker) => loadedMarkers.has(marker.id) || fromSets.has(marker.id));
  }, [state]);

  const addMarker = useCallback((lat: number, lng: number): ChartMarker => {
    const marker: ChartMarker = {
      id: newId(),
      name: "Marker",
      lat,
      lng,
    };
    setState((prev) => {
      marker.name = nextIndexedName(prev.markers, "Marker");
      return {
        ...prev,
        markers: [...prev.markers, marker],
        loadedMarkerIds: prev.loadedMarkerIds.includes(marker.id)
          ? prev.loadedMarkerIds
          : [...prev.loadedMarkerIds, marker.id],
      };
    });
    return marker;
  }, []);

  const renameMarker = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      markers: prev.markers.map((marker) => (marker.id === id ? { ...marker, name: trimmed } : marker)),
    }));
  }, []);

  const moveMarker = useCallback((id: string, lat: number, lng: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setState((prev) => {
      const current = prev.markers.find((marker) => marker.id === id);
      if (!current || (current.lat === lat && current.lng === lng)) return prev;
      return {
        ...prev,
        markers: prev.markers.map((marker) => (marker.id === id ? { ...marker, lat, lng } : marker)),
      };
    });
  }, []);

  const deleteMarker = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      markers: prev.markers.filter((marker) => marker.id !== id),
      loadedMarkerIds: prev.loadedMarkerIds.filter((markerId) => markerId !== id),
      sets: prev.sets.map((set) => ({ ...set, markerIds: set.markerIds.filter((markerId) => markerId !== id) })),
    }));
  }, []);

  const toggleMarkerLoaded = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      loadedMarkerIds: prev.loadedMarkerIds.includes(id)
        ? prev.loadedMarkerIds.filter((markerId) => markerId !== id)
        : [...prev.loadedMarkerIds, id],
    }));
  }, []);

  const addSet = useCallback((): MarkerSet => {
    const set: MarkerSet = {
      id: newId(),
      name: "Set",
      markerIds: [],
    };
    setState((prev) => {
      set.name = nextIndexedName(prev.sets, "Set");
      return {
        ...prev,
        sets: [...prev.sets, set],
        loadedSetIds: [...prev.loadedSetIds, set.id],
      };
    });
    return set;
  }, []);

  const renameSet = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      sets: prev.sets.map((set) => (set.id === id ? { ...set, name: trimmed } : set)),
    }));
  }, []);

  const deleteSet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      sets: prev.sets.filter((set) => set.id !== id),
      loadedSetIds: prev.loadedSetIds.filter((setId) => setId !== id),
    }));
  }, []);

  const toggleSetLoaded = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      loadedSetIds: prev.loadedSetIds.includes(id)
        ? prev.loadedSetIds.filter((setId) => setId !== id)
        : [...prev.loadedSetIds, id],
    }));
  }, []);

  const addMarkerToSet = useCallback((setId: string, markerId: string) => {
    setState((prev) => ({
      ...prev,
      sets: prev.sets.map((set) => {
        if (set.id !== setId) return set;
        return { ...set, markerIds: [...set.markerIds, markerId] };
      }),
    }));
  }, []);

  const removeMarkerFromSet = useCallback((setId: string, index: number) => {
    setState((prev) => ({
      ...prev,
      sets: prev.sets.map((set) => {
        if (set.id !== setId || index < 0 || index >= set.markerIds.length) return set;
        const markerIds = [...set.markerIds];
        markerIds.splice(index, 1);
        return { ...set, markerIds };
      }),
    }));
  }, []);

  return {
    ...state,
    visibleMarkers,
    addMarker,
    renameMarker,
    moveMarker,
    deleteMarker,
    toggleMarkerLoaded,
    addSet,
    renameSet,
    deleteSet,
    toggleSetLoaded,
    addMarkerToSet,
    removeMarkerFromSet,
  };
}
