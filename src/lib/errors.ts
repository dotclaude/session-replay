// Error classes for File System Access API operations

export class UnsupportedBrowserError extends Error {
  constructor() {
    super(
      "This browser does not support directory access. Try Chrome, Edge, Brave, or use the fallback folder upload."
    );
    this.name = "UnsupportedBrowserError";
  }
}

export class InvalidSessionsDirectoryError extends Error {
  constructor(selectedName: string) {
    super(
      `Selected "${selectedName}", but it was not ".claude" and did not contain a ".claude" subdirectory.`
    );
    this.name = "InvalidSessionsDirectoryError";
  }
}

export function friendlyPickerError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return "Directory selection was canceled.";
    }

    if (error.name === "SecurityError") {
      return "The browser blocked directory access. The picker must be opened from a button click on a secure page.";
    }

    if (error.name === "NotAllowedError") {
      return "Permission was not granted for that directory.";
    }

    if (error.name === "NotFoundError") {
      return "The requested directory was not found.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
