import { ErrorCode } from "@swarm-vault/shared";

interface ErrorDisplayProps {
  error: string | null;
  errorCode?: ErrorCode;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
  variant?: "inline" | "banner" | "toast";
}

export function ErrorDisplay({
  error,
  errorCode,
  onDismiss,
  onRetry,
  className = "",
  variant = "inline",
}: ErrorDisplayProps) {
  if (!error) return null;

  const baseClasses = "rounded-lg";
  const variantClasses = {
    inline: "bg-red-50 border border-red-200 p-4",
    banner: "bg-red-600 text-white p-4",
    toast: "bg-red-50 border border-red-200 p-4 shadow-lg",
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {variant !== "banner" && (
          <svg
            className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        <div className="flex-1">
          <p
            className={
              variant === "banner" ? "text-white" : "text-red-800"
            }
          >
            {error}
          </p>
          {errorCode && variant !== "banner" && (
            <p className="text-xs text-red-600 mt-1">Error code: {errorCode}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className={`text-sm font-medium hover:underline ${
                variant === "banner"
                  ? "text-white"
                  : "text-red-600 hover:text-red-800"
              }`}
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`p-1 rounded hover:bg-red-100 ${
                variant === "banner" ? "hover:bg-red-700" : ""
              }`}
              aria-label="Dismiss error"
            >
              <svg
                className={`h-4 w-4 ${
                  variant === "banner" ? "text-white" : "text-red-500"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SuccessDisplayProps {
  message: string | null;
  onDismiss?: () => void;
  className?: string;
}

export function SuccessDisplay({
  message,
  onDismiss,
  className = "",
}: SuccessDisplayProps) {
  if (!message) return null;

  return (
    <div
      className={`bg-green-50 border border-green-200 rounded-lg p-4 ${className}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-green-800 flex-1">{message}</p>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-green-100"
            aria-label="Dismiss message"
          >
            <svg
              className="h-4 w-4 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
