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
import { MapPin, AlertCircle, Info, CheckCircle2 } from "lucide-react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  icon?: "info" | "warning" | "pin" | "success";
};

export type AlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  icon?: "info" | "warning" | "pin" | "success";
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

  const iconType = options?.icon || (
    isConfirm
      ? ((options as ConfirmOptions)?.variant === "destructive" ? "warning" : "info")
      : (options?.title?.includes("7/7") || options?.message?.includes("7개") ? "pin" : "info")
  );

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[250] bg-zinc-950/40 backdrop-blur-md data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out transition-all"
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-[50%] top-[50%] z-[300] w-[90vw] max-w-sm translate-x-[-50%] translate-y-[-50%]",
              "border border-zinc-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl duration-200",
              "data-[state=open]:animate-in data-[state=closed]:animate-out rounded-3xl overflow-hidden",
            )}
          >
            {/* 상단 은은한 비주얼 그라데이션 장식 배경 (카드가 더욱 고급스러워 보이도록) */}
            <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-gradient-to-br from-amber-400/20 via-orange-400/10 to-transparent blur-2xl pointer-events-none" />

            {/* 아이콘 뱃지 */}
            <div className="relative z-10 flex flex-col items-start">
              {iconType === "pin" ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-4 shadow-2xs">
                  <MapPin className="w-6 h-6 text-amber-600" strokeWidth={2.2} />
                </div>
              ) : iconType === "warning" ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-500/20 border border-red-500/30 flex items-center justify-center mb-4 shadow-2xs">
                  <AlertCircle className="w-6 h-6 text-red-600" strokeWidth={2.2} />
                </div>
              ) : iconType === "success" ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-2xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" strokeWidth={2.2} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center mb-4 shadow-2xs">
                  <Info className="w-6 h-6 text-blue-600" strokeWidth={2.2} />
                </div>
              )}

              <DialogPrimitive.Title className="text-base font-extrabold text-zinc-900 leading-snug tracking-tight break-keep">
                {options?.title ?? (isConfirm ? "확인" : "알림")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs sm:text-[13px] text-zinc-600 leading-relaxed font-medium whitespace-pre-line break-keep">
                {options?.message}
              </DialogPrimitive.Description>
            </div>

            <div className="mt-6 flex gap-2.5 relative z-10">
              {isConfirm ? (
                <>
                  <button
                    type="button"
                    onClick={() => closeDialog(false)}
                    className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 font-bold text-xs hover:bg-zinc-50 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {(options as ConfirmOptions)?.cancelLabel ?? "취소"}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeDialog(true)}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold text-xs active:scale-[0.98] transition-all cursor-pointer shadow-xs",
                      (options as ConfirmOptions)?.variant === "destructive"
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-zinc-950 hover:bg-zinc-900 text-white border border-white/10",
                    )}
                  >
                    {(options as ConfirmOptions)?.confirmLabel ?? "확인"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => closeDialog(true)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-zinc-950 to-zinc-900 hover:from-zinc-900 hover:to-zinc-800 active:scale-[0.98] text-white font-bold text-xs shadow-md transition-all cursor-pointer border border-white/10"
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
