import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastIcon,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { formatErrorMessage } from "@/lib/utils"

const DEFAULT_TITLES: Record<string, string> = {
  destructive: "Something went wrong",
  success: "Success",
  warning: "Heads up",
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const cleanedDescription =
          variant === "destructive" && typeof description === "string"
            ? formatErrorMessage(description)
            : description

        const resolvedTitle =
          title ?? (variant ? DEFAULT_TITLES[variant as string] : undefined)

        return (
          <Toast key={id} variant={variant} {...props}>
            <ToastIcon variant={variant} />
            <div className="flex-1 grid gap-1">
              {resolvedTitle && <ToastTitle>{resolvedTitle}</ToastTitle>}
              {cleanedDescription && (
                <ToastDescription>{cleanedDescription}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
