export type FileSaveResult = "saved" | "shared" | "downloaded" | "cancelled";

export interface HostReadableFile {
  name: string;
  text: () => Promise<string>;
}

export interface PortableFile {
  name: string;
  mimeType: string;
  content: BlobPart;
}

interface SavePortableFileOptions {
  description: string;
  accept: Record<string, string[]>;
}

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type FileShareNavigator = Navigator & {
  canShare?: (data: { files: File[]; title?: string }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
};

function blobFor(file: PortableFile) {
  return file.content instanceof Blob ? file.content : new Blob([file.content], { type: file.mimeType });
}

function downloadInBrowser(file: PortableFile) {
  const blob = blobFor(file);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function saveWithBrowserPicker(file: PortableFile, options: SavePortableFileOptions): Promise<"saved" | "cancelled" | false> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker || !window.isSecureContext) return false;

  try {
    const handle = await picker({
      suggestedName: file.name,
      types: [
        {
          description: options.description,
          accept: options.accept,
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blobFor(file));
    await writable.close();
    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.error("Save picker failed", error);
    return false;
  }
}

async function shareFromBrowser(file: PortableFile): Promise<"shared" | "cancelled" | false> {
  const shareFile = new File([blobFor(file)], file.name, { type: file.mimeType });
  const shareData = { files: [shareFile], title: file.name };
  const shareNavigator = navigator as FileShareNavigator;
  if (!shareNavigator.share || !shareNavigator.canShare?.(shareData)) return false;

  try {
    await shareNavigator.share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.error("File share failed", error);
    return false;
  }
}

export async function savePortableFile(file: PortableFile, options: SavePortableFileOptions): Promise<FileSaveResult> {
  const savedWithPicker = await saveWithBrowserPicker(file, options);
  if (savedWithPicker) return savedWithPicker;

  const shared = await shareFromBrowser(file);
  if (shared) return shared;

  downloadInBrowser(file);
  return "downloaded";
}

export async function readTextFile(file: HostReadableFile) {
  return {
    name: file.name,
    text: await file.text(),
  };
}
