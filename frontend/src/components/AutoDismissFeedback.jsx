import { useEffect } from "react";

export function AutoDismissFeedback({
  feedback,
  onClear,
  duration = 3000,
  className = "",
}) {
  const message = typeof feedback === "string" ? feedback : feedback?.message;
  const type = typeof feedback === "string" ? "" : feedback?.type;
  const feedbackClass = ["feedback-banner", type, className].filter(Boolean).join(" ");

  useEffect(() => {
    if (!message || !onClear) {
      return undefined;
    }

    const timeoutId = window.setTimeout(onClear, duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, message, onClear]);

  if (!message) {
    return null;
  }

  return (
    <div className={feedbackClass}>
      {message}
    </div>
  );
}
