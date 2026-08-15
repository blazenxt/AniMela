"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Kind = "movie" | "tv";

export interface WatchItem {
  id: number;
  type: Kind;
  title: string;
  poster_path?: string | null;
  addedAt: number;
}

export interface ContinueItem {
  id: number;
  type: Kind;
  title: string;
  poster_path?: string | null;
  season?: number;
  episode?: number;
  updatedAt: number;
}

interface LibraryValue {
  watchlist: WatchItem[];
  continueWatching: ContinueItem[];
  isWatched: (id: number) => boolean;
  toggleWatch: (item: Omit<WatchItem, "addedAt">) => void;
  recordContinue: (item: Omit<ContinueItem, "updatedAt">) => void;
  removeContinue: (id: number) => void;
  clearContinue: () => void;
}

const LibraryContext = createContext<LibraryValue | null>(null);

const WATCH_KEY = "animela:watchlist";
const CONTINUE_KEY = "animela:continue";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / disabled — ignore
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueItem[]>([]);

  useEffect(() => {
    setWatchlist(read<WatchItem>(WATCH_KEY));
    setContinueWatching(read<ContinueItem>(CONTINUE_KEY));
  }, []);

  const toggleWatch = useCallback((item: Omit<WatchItem, "addedAt">) => {
    setWatchlist((prev) => {
      const exists = prev.some((w) => w.id === item.id);
      const next = exists
        ? prev.filter((w) => w.id !== item.id)
        : [{ ...item, addedAt: Date.now() }, ...prev];
      write(WATCH_KEY, next);
      return next;
    });
  }, []);

  const recordContinue = useCallback((item: Omit<ContinueItem, "updatedAt">) => {
    setContinueWatching((prev) => {
      const next = [
        { ...item, updatedAt: Date.now() },
        ...prev.filter((c) => c.id !== item.id),
      ].slice(0, 50);
      write(CONTINUE_KEY, next);
      return next;
    });
  }, []);

  const removeContinue = useCallback((id: number) => {
    setContinueWatching((prev) => {
      const next = prev.filter((c) => c.id !== id);
      write(CONTINUE_KEY, next);
      return next;
    });
  }, []);

  const clearContinue = useCallback(() => {
    setContinueWatching([]);
    write(CONTINUE_KEY, []);
  }, []);

  const isWatched = useCallback((id: number) => watchlist.some((w) => w.id === id), [watchlist]);

  const value = useMemo<LibraryValue>(
    () => ({
      watchlist,
      continueWatching,
      isWatched,
      toggleWatch,
      recordContinue,
      removeContinue,
      clearContinue,
    }),
    [watchlist, continueWatching, isWatched, toggleWatch, recordContinue, removeContinue, clearContinue]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
