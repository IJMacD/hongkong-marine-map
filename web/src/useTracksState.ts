import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteTrack as deleteStoredTrack,
  loadTracks,
  loadVisibleTrackIds,
  putTracks,
  renameTrack as renameStoredTrack,
  saveVisibleTrackIds,
} from "./tracksStorage";
import { trackColor, type Track } from "./tracksTypes";

export type VisibleTrack = {
  track: Track;
  color: string;
};

export function useTracksState() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>(() => loadVisibleTrackIds());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    loadTracks()
      .then((stored) => {
        if (cancelled) return;
        setTracks((current) => {
          const known = new Set(stored.map((track) => track.id));
          return [...stored, ...current.filter((track) => !known.has(track.id))];
        });
        const ids = new Set(stored.map((track) => track.id));
        setVisibleIds((current) => current.filter((id) => ids.has(id) || addedIdsRef.current.has(id)));
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setError("Could not load saved tracks.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) saveVisibleTrackIds(visibleIds);
  }, [visibleIds, loaded]);

  const visibleTracks = useMemo<VisibleTrack[]>(() => {
    const visible = new Set(visibleIds);
    return tracks.flatMap((track, index) => (visible.has(track.id) ? [{ track, color: trackColor(index) }] : []));
  }, [tracks, visibleIds]);

  const addTracks = useCallback(async (incoming: Track[]) => {
    if (incoming.length === 0) return;
    for (const track of incoming) addedIdsRef.current.add(track.id);
    setTracks((current) => [...current, ...incoming]);
    setVisibleIds((current) => [...current, ...incoming.map((track) => track.id)]);
    await putTracks(incoming);
  }, []);

  const renameTrack = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTracks((current) => current.map((track) => (track.id === id ? { ...track, name: trimmed } : track)));
    renameStoredTrack(id, trimmed).catch((err: unknown) => console.error(err));
  }, []);

  const deleteTrack = useCallback((id: string) => {
    setTracks((current) => current.filter((track) => track.id !== id));
    setVisibleIds((current) => current.filter((trackId) => trackId !== id));
    deleteStoredTrack(id).catch((err: unknown) => console.error(err));
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setVisibleIds((current) =>
      current.includes(id) ? current.filter((trackId) => trackId !== id) : [...current, id],
    );
  }, []);

  return {
    tracks,
    visibleIds,
    visibleTracks,
    loaded,
    error,
    addTracks,
    renameTrack,
    deleteTrack,
    toggleVisible,
  };
}
