"use client";

import { useState, useEffect, useCallback } from "react";

export interface LocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  initializeWithValue?: boolean;
}

type StorageEvent = CustomEvent<{ key: string; newValue: unknown }>;

const STORAGE_EVENT_NAME = "teamplus-local-storage";

function dispatchStorageEvent<T>(key: string, newValue: T): void {
  window.dispatchEvent(
    new CustomEvent(STORAGE_EVENT_NAME, {
      detail: { key, newValue },
    }),
  );
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: LocalStorageOptions<T> = {},
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    initializeWithValue = true,
  } = options;

  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? deserializer(item) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue, deserializer]);

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (initializeWithValue) return readValue();
    return initialValue;
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      if (typeof window === "undefined") return;
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        window.localStorage.setItem(key, serializer(newValue));
        setStoredValue(newValue);
        dispatchStorageEvent(key, newValue);
      } catch {
        // localStorage 접근 실패 시 무시
      }
    },
    [key, storedValue, serializer],
  );

  const removeValue = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
      dispatchStorageEvent(key, initialValue);
    } catch {
      // localStorage 접근 실패 시 무시
    }
  }, [key, initialValue]);

  useEffect(() => {
    const handleStorageChange = (event: globalThis.StorageEvent) => {
      if (event.key === key && event.storageArea === window.localStorage) {
        try {
          const newValue = event.newValue
            ? deserializer(event.newValue)
            : initialValue;
          setStoredValue(newValue);
        } catch {
          // 파싱 실패 시 무시
        }
      }
    };

    const handleCustomStorage = (event: Event) => {
      const { key: eventKey, newValue } = (event as StorageEvent).detail;
      if (eventKey === key) {
        setStoredValue(newValue as T);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(STORAGE_EVENT_NAME, handleCustomStorage);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(STORAGE_EVENT_NAME, handleCustomStorage);
    };
  }, [key, deserializer, initialValue]);

  useEffect(() => {
    if (!initializeWithValue) setStoredValue(readValue());
  }, [initializeWithValue, readValue]);

  return [storedValue, setValue, removeValue];
}

export function useSessionStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      if (typeof window === "undefined") return;
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        window.sessionStorage.setItem(key, JSON.stringify(newValue));
        setStoredValue(newValue);
      } catch {
        // sessionStorage 접근 실패 시 무시
      }
    },
    [key, storedValue],
  );

  const removeValue = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, [key, initialValue]);

  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
