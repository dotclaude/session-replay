// Type definitions for File System Access API
// https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API

export {};

declare global {
  type FileSystemPermissionMode = "read" | "readwrite";

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode;
  }

  interface FileSystemHandle {
    readonly kind: "file" | "directory";
    readonly name: string;

    queryPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;

    requestPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;

    isSameEntry?(other: FileSystemHandle): Promise<boolean>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: "file";
    getFile(): Promise<File>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: "directory";

    entries(): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;

    keys(): AsyncIterableIterator<string>;

    values(): AsyncIterableIterator<
      FileSystemFileHandle | FileSystemDirectoryHandle
    >;

    getDirectoryHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<FileSystemDirectoryHandle>;

    getFileHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<FileSystemFileHandle>;
  }

  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: FileSystemPermissionMode;
      startIn?:
        | "desktop"
        | "documents"
        | "downloads"
        | "music"
        | "pictures"
        | "videos"
        | FileSystemHandle;
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<
      FileSystemFileHandle | FileSystemDirectoryHandle | null
    >;
  }

  interface HTMLInputElement {
    webkitdirectory: boolean;
  }

  interface File {
    webkitRelativePath?: string;
  }
}
