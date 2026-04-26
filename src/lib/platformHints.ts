// Platform detection and hidden folder visibility hints

export type PlatformKind = "mac" | "linux" | "windows" | "unknown";

export function detectPlatform(): PlatformKind {
  const value =
    navigator.userAgentData?.platform?.toLowerCase() ??
    navigator.platform?.toLowerCase() ??
    navigator.userAgent.toLowerCase();

  if (value.includes("mac")) return "mac";
  if (value.includes("linux")) return "linux";
  if (value.includes("win")) return "windows";

  return "unknown";
}

export function getHiddenFolderHint(): string {
  const platform = detectPlatform();

  switch (platform) {
    case "mac":
      return "In the picker, press Cmd + Shift + . to show hidden folders.";
    case "linux":
      return "In many Linux file pickers, press Ctrl + H to show hidden folders.";
    case "windows":
      return "In File Explorer, enable View → Hidden items if the folder is hidden.";
    default:
      return "Enable hidden files in your system file picker if .claude is not visible.";
  }
}
