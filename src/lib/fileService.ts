import { Capacitor, registerPlugin } from "@capacitor/core";

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

type NativeFileResult = { name?: string; text?: string; status?: string };

interface NativeForwardDraftFilePlugin {
  saveFile(options: { name: string; mimeType: string; base64: string }): Promise<NativeFileResult>;
  openTextFile(options: { extensions: string[] }): Promise<NativeFileResult>;
}

const NativeForwardDraftFiles = registerPlugin<NativeForwardDraftFilePlugin>("ForwardDraftFilePlugin");

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

function blobFor(file: PortableFile) {
  return file.content instanceof Blob ? file.content : new Blob([file.content], { type: file.mimeType });
}

export function isNativeFileServiceAvailable() {
  return Boolean(Capacitor.isNativePlatform?.() && Capacitor.isPluginAvailable("ForwardDraftFilePlugin"));
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function isCancelled(error: unknown) {
  const value =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  return value.toLowerCase().includes("cancelled") || code.toLowerCase().includes("cancelled");
}

async function saveWithNativeAdapter(file: PortableFile): Promise<"saved" | "cancelled" | false> {
  if (!isNativeFileServiceAvailable()) return false;

  try {
    const result = await NativeForwardDraftFiles.saveFile({
      name: file.name,
      mimeType: file.mimeType,
      base64: await blobToBase64(blobFor(file)),
    });
    return result.status === "cancelled" ? "cancelled" : "saved";
  } catch (error) {
    if (isCancelled(error)) return "cancelled";
    console.error("Native file save failed", error);
    return false;
  }
}

export async function openNativeTextFile(extensions: string[]) {
  if (!isNativeFileServiceAvailable()) return undefined;

  try {
    const result = await NativeForwardDraftFiles.openTextFile({
      extensions: extensions.map((extension) => extension.replace(/^\./, "")),
    });
    if (!result.name || typeof result.text !== "string") return undefined;
    return { name: result.name, text: result.text };
  } catch (error) {
    if (isCancelled(error)) return null;
    console.error("Native file open failed", error);
    return undefined;
  }
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

async function shareWithHost(file: PortableFile): Promise<"shared" | "cancelled" | false> {
  const share = navigator.share?.bind(navigator);
  if (!share) return false;

  const hostFile = new File([blobFor(file)], file.name, { type: file.mimeType });
  const shareData = {
    title: file.name,
    files: [hostFile],
  };
  if (!navigator.canShare || !navigator.canShare(shareData)) return false;

  try {
    await share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.error("Share sheet failed", error);
    return false;
  }
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

export async function savePortableFile(file: PortableFile, options: SavePortableFileOptions): Promise<FileSaveResult> {
  const savedWithNative = await saveWithNativeAdapter(file);
  if (savedWithNative) return savedWithNative;

  const savedWithPicker = await saveWithBrowserPicker(file, options);
  if (savedWithPicker) return savedWithPicker;

  const sharedWithHost = await shareWithHost(file);
  if (sharedWithHost) return sharedWithHost;

  downloadInBrowser(file);
  return "downloaded";
}

export async function readTextFile(file: HostReadableFile) {
  return {
    name: file.name,
    text: await file.text(),
  };
}
