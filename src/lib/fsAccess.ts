// Core File System Access API utilities

import { InvalidSessionsDirectoryError, UnsupportedBrowserError } from "./errors";
import {
  loadSessionsDirectoryHandle,
  saveSessionsDirectoryHandle
} from "./sessionsStore";

const PICKER_ID = "sessions-directory";

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function verifyReadPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: "read" };

  if (!handle.queryPermission || !handle.requestPermission) {
    // Some implementations may not expose permission helpers.
    // Try read path later and handle errors there.
    return true;
  }

  const current = await handle.queryPermission(descriptor);

  if (current === "granted") {
    return true;
  }

  if (current === "denied") {
    return false;
  }

  const requested = await handle.requestPermission(descriptor);
  return requested === "granted";
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new UnsupportedBrowserError();
  }

  return await window.showDirectoryPicker({
    id: PICKER_ID,
    mode: "read"
  });
}

export async function resolveSessionsDirectory(
  selected: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle> {
  if (selected.name === ".claude") {
    return selected;
  }

  try {
    // Allows user to select $HOME and still succeed.
    return await selected.getDirectoryHandle(".claude", { create: false });
  } catch {
    throw new InvalidSessionsDirectoryError(selected.name);
  }
}

export async function pickAndSaveSessionsDirectory(): Promise<FileSystemDirectoryHandle> {
  const selected = await pickDirectory();
  const sessionsDir = await resolveSessionsDirectory(selected);

  const hasPermission = await verifyReadPermission(sessionsDir);

  if (!hasPermission) {
    throw new Error("Read permission was not granted for the sessions directory.");
  }

  await saveSessionsDirectoryHandle(sessionsDir);
  return sessionsDir;
}

export async function getSavedSessionsDirectory(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  const saved = await loadSessionsDirectoryHandle();

  if (!saved) {
    console.log('[fsAccess] No handle found in IndexedDB');
    return undefined;
  }

  console.log('[fsAccess] Handle loaded from IndexedDB:', saved.name);

  const hasPermission = await verifyReadPermission(saved);

  if (!hasPermission) {
    console.log('[fsAccess] Permission denied for handle');
    return undefined;
  }

  console.log('[fsAccess] Permission granted, returning handle');
  return saved;
}

export async function getOrPickSessionsDirectory(): Promise<FileSystemDirectoryHandle> {
  const saved = await getSavedSessionsDirectory();

  if (saved) {
    return saved;
  }

  return await pickAndSaveSessionsDirectory();
}
