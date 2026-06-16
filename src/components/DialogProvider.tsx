import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Replaces the browser's blocking window.alert/confirm/prompt with in-app
// dialogs (the native ones are jarring on iOS and prompt() is unreliable in
// some WKWebView contexts). Reuses the app's existing modal styling.

type PendingDialog =
  | { kind: "alert"; message: string; title: string; resolve: () => void }
  | { kind: "confirm"; message: string; title: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; title: string; resolve: (value: string | null) => void };

export interface DialogApi {
  alert: (message: string, options?: { title?: string }) => Promise<void>;
  confirm: (
    message: string,
    options?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean },
  ) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string, options?: { title?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | undefined>(undefined);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used within a DialogProvider");
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [inputValue, setInputValue] = useState("");

  const api = useMemo<DialogApi>(
    () => ({
      alert: (message, options) =>
        new Promise<void>((resolve) => setPending({ kind: "alert", message, title: options?.title ?? "Forward Draft", resolve })),
      confirm: (message, options) =>
        new Promise<boolean>((resolve) =>
          setPending({
            kind: "confirm",
            message,
            title: options?.title ?? "Forward Draft",
            confirmLabel: options?.confirmLabel ?? "OK",
            cancelLabel: options?.cancelLabel ?? "Cancel",
            danger: options?.danger ?? false,
            resolve,
          }),
        ),
      prompt: (message, defaultValue = "", options) =>
        new Promise<string | null>((resolve) => {
          setInputValue(defaultValue);
          setPending({ kind: "prompt", message, title: options?.title ?? "Forward Draft", resolve });
        }),
    }),
    [],
  );

  const cancel = useCallback(() => {
    setPending((current) => {
      if (current) {
        if (current.kind === "confirm") current.resolve(false);
        else if (current.kind === "prompt") current.resolve(null);
        else current.resolve();
      }
      return null;
    });
  }, []);

  const accept = useCallback(() => {
    setPending((current) => {
      if (current) {
        if (current.kind === "confirm") current.resolve(true);
        else if (current.kind === "prompt") current.resolve(inputValue);
        else current.resolve();
      }
      return null;
    });
  }, [inputValue]);

  useEffect(() => {
    if (!pending) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, cancel]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={pending.title}>
          <form
            className="file-refresh-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              accept();
            }}
          >
            <header>
              <strong>{pending.title}</strong>
            </header>
            <p>{pending.message}</p>
            {pending.kind === "prompt" && (
              <input
                name="dialog-input"
                autoFocus
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />
            )}
            <footer>
              {pending.kind === "alert" ? (
                <button type="submit" className="primary" style={{ gridColumn: "1 / -1" }}>
                  OK
                </button>
              ) : (
                <>
                  <button type="button" onClick={cancel}>
                    {pending.kind === "confirm" ? pending.cancelLabel : "Cancel"}
                  </button>
                  <button type="submit" className={pending.kind === "confirm" && pending.danger ? "danger-command" : "primary"}>
                    {pending.kind === "confirm" ? pending.confirmLabel : "OK"}
                  </button>
                </>
              )}
            </footer>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}
