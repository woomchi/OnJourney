"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

export type AlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
};

type PendingDialog =
  | { type: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: "alert"; options: AlertOptions; resolve: () => void };

interface DialogContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function normalizeConfirmOptions(input: ConfirmOptions | string): ConfirmOptions {
  return typeof input === "string" ? { message: input } : input;
}

function normalizeAlertOptions(input: AlertOptions | string): AlertOptions {
  return typeof input === "string" ? { message: input } : input;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        type: "confirm",
        options: normalizeConfirmOptions(options),
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    return new Promise<void>((resolve) => {
      setPending({
        type: "alert",
        options: normalizeAlertOptions(options),
        resolve,
      });
    });
  }, []);

  const closeDialog = useCallback((result: boolean) => {
    if (!pending) return;
    if (pending.type === "confirm") {
      pending.resolve(result);
    } else {
      pending.resolve();
    }
    setPending(null);
  }, [pending]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeDialog(false);
    }
  }, [closeDialog]);

  const isOpen = pending !== null;
  const isConfirm = pending?.type === "confirm";
  const options = pending?.options;

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[250] bg-zinc-900/40 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-[50%] top-[50%] z-[300] w-full max-w-sm translate-x-[-50%] translate-y-[-50%]",
              "border border-zinc-100 bg-white p-6 shadow-2xl duration-200",
              "data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-3xl",
            )}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="text-lg font-black text-zinc-900 leading-tight tracking-tight">
              {options?.title ?? (isConfirm ? "확인" : "알림")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-3 text-sm text-zinc-500 leading-relaxed">
              {options?.message}
            </DialogPrimitive.Description>

            <div className={cn("mt-6 flex gap-3", isConfirm ? "" : "")}>
              {isConfirm ? (
                <>
                  <button
                    type="button"
                    onClick={() => closeDialog(false)}
                    className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-sm hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    {(options as ConfirmOptions)?.cancelLabel ?? "취소"}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeDialog(true)}
                    className={cn(
                      "flex-1 py-3 rounded-2xl font-bold text-sm transition-colors cursor-pointer",
                      (options as ConfirmOptions)?.variant === "destructive"
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-zinc-900 hover:bg-zinc-800 text-white",
                    )}
                  >
                    {(options as ConfirmOptions)?.confirmLabel ?? "확인"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => closeDialog(true)}
                  className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm transition-colors cursor-pointer"
                >
                  {(options as AlertOptions)?.confirmLabel ?? "확인"}
                </button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}
