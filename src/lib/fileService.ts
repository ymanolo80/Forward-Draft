import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ProjectFileReference } from "../types";

export type FileSaveResult = "saved" | "shared" | "downloaded" | "cancelled";

export interface HostReadableFile {
  name: string;
  text: () => Promise<string>;
  fileReference?: ProjectFileReference;
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

export interface PortableFileSaveOutcome {
  status: FileSaveResult;
  fileReference?: ProjectFileReference;
}

type NativeFileResult = { name?: string; text?: string; status?: string; fileRef?: string; modifiedAt?: number };

interface NativeForwardDraftFilePlugin {
  saveFile(options: { name: string; mimeType: string; base64: string }): Promise<NativeFileResult>;
  createTextFile(options: { name: string; mimeType: string; base64: string }): Promise<NativeFileResult>;
  saveTextFile(options: { fileRef: string; base64: string }): Promise<NativeFileResult>;
  openTextFile(options: { extensions: string[] }): Promise<NativeFileResult>;
  getTextFileInfo(options: { fileRef: string }): Promise<NativeFileResult>;
  writeAppFile(options: { name: string; base64: string }): Promise<NativeFileResult>;
  readAppFile(options: { name: string }): Promise<NativeFileResult>;
  listAppFiles(options: { extension: string }): Promise<{ files?: NativeFileResult[] }>;
  deleteAppFile(options: { name: string }): Promise<NativeFileResult>;
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

function fileReferenceFromNativeResult(result: NativeFileResult): ProjectFileReference | undefined {
  if (!result.fileRef || !result.name) return undefined;
  return {
    adapter: "native",
    fileRef: result.fileRef,
    name: result.name,
    modifiedAt: typeof result.modifiedAt === "number" ? result.modifiedAt : undefined,
  };
}

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

async function createWithNativeAdapter(file: PortableFile): Promise<PortableFileSaveOutcome | false> {
  if (!isNativeFileServiceAvailable()) return false;

  try {
    const result = await NativeForwardDraftFiles.createTextFile({
      name: file.name,
      mimeType: file.mimeType,
      base64: await blobToBase64(blobFor(file)),
    });
    if (result.status === "cancelled") return { status: "cancelled" };
    return {
      status: "saved",
      fileReference: fileReferenceFromNativeResult(result),
    };
  } catch (error) {
    if (isCancelled(error)) return { status: "cancelled" };
    console.error("Native file creation failed", error);
    return false;
  }
}

export async function savePortableFileToReference(
  reference: ProjectFileReference,
  file: PortableFile,
): Promise<PortableFileSaveOutcome | false> {
  if (reference.adapter !== "native" || !isNativeFileServiceAvailable()) return false;

  try {
    const result = await NativeForwardDraftFiles.saveTextFile({
      fileRef: reference.fileRef,
      base64: await blobToBase64(blobFor(file)),
    });
    return {
      status: result.status === "cancelled" ? "cancelled" : "saved",
      fileReference: fileReferenceFromNativeResult(result) ?? reference,
    };
  } catch (error) {
    if (isCancelled(error)) return { status: "cancelled" };
    console.error("Native autosave failed", error);
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
    return {
      name: result.name,
      text: result.text,
      fileReference: fileReferenceFromNativeResult(result),
    };
  } catch (error) {
    if (isCancelled(error)) return null;
    console.error("Native file open failed", error);
    return undefined;
  }
}

export async function readNativeTextFileReference(reference: ProjectFileReference) {
  if (reference.adapter !== "native" || !isNativeFileServiceAvailable()) return undefined;

  try {
    const result = await NativeForwardDraftFiles.getTextFileInfo({ fileRef: reference.fileRef });
    if (!result.name || typeof result.text !== "string") return undefined;
    return {
      name: result.name,
      text: result.text,
      fileReference: fileReferenceFromNativeResult(result) ?? reference,
    };
  } catch (error) {
    if (isCancelled(error)) return null;
    console.error("Native file refresh failed", error);
    return undefined;
  }
}

// --- App-owned durable store (native only) -------------------------------
// Picker-free reads/writes in the app's Documents directory, used as the
// always-available durable copy of each project (survives IndexedDB eviction).

export interface AppStoredFile {
  name: string;
  text: string;
  modifiedAt?: number;
}

async function textToBase64(text: string) {
  return blobToBase64(new Blob([text], { type: "text/plain" }));
}

export async function writeAppProjectFile(name: string, text: string): Promise<boolean> {
  if (!isNativeFileServiceAvailable()) return false;
  try {
    await NativeForwardDraftFiles.writeAppFile({ name, base64: await textToBase64(text) });
    return true;
  } catch (error) {
    console.error("App-store write failed", error);
    return false;
  }
}

export async function readAppProjectFile(name: string): Promise<string | undefined> {
  if (!isNativeFileServiceAvailable()) return undefined;
  try {
    const result = await NativeForwardDraftFiles.readAppFile({ name });
    return typeof result.text === "string" ? result.text : undefined;
  } catch {
    return undefined;
  }
}

export async function listAppProjectFiles(extension: string): Promise<AppStoredFile[]> {
  if (!isNativeFileServiceAvailable()) return [];
  try {
    const result = await NativeForwardDraftFiles.listAppFiles({ extension });
    const files = Array.isArray(result.files) ? result.files : [];
    return files
      .filter((file): file is NativeFileResult & { name: string; text: string } =>
        Boolean(file?.name) && typeof file?.text === "string",
      )
      .map((file) => ({ name: file.name, text: file.text, modifiedAt: file.modifiedAt }));
  } catch (error) {
    console.error("App-store list failed", error);
    return [];
  }
}

export async function deleteAppProjectFile(name: string): Promise<void> {
  if (!isNativeFileServiceAvailable()) return;
  try {
    await NativeForwardDraftFiles.deleteAppFile({ name });
  } catch (error) {
    console.error("App-store delete failed", error);
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

export async function createPortableFile(file: PortableFile, options: SavePortableFileOptions): Promise<PortableFileSaveOutcome> {
  const createdWithNative = await createWithNativeAdapter(file);
  if (createdWithNative) return createdWithNative;

  const savedWithPicker = await saveWithBrowserPicker(file, options);
  if (savedWithPicker) return { status: savedWithPicker };

  const sharedWithHost = await shareWithHost(file);
  if (sharedWithHost) return { status: sharedWithHost };

  downloadInBrowser(file);
  return { status: "downloaded" };
}

export async function readTextFile(file: HostReadableFile) {
  return {
    name: file.name,
    text: await file.text(),
    fileReference: file.fileReference,
  };
}
