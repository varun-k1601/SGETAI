import { useEffect, useId, useRef } from "react";

// Shared confirmation dialog. It is named for its original purpose, but the confirmed action is
// not always a delete — `confirmLabel` and `destructive` let a caller reuse the same dialog for a
// reversible action without dressing it up in danger red. Both are optional and default to the
// previous hardcoded behaviour, so the component's original contract is unchanged.
export function ConfirmDeleteModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Delete",
  destructive = true
}) {
  const headingId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;

    // Cancel takes focus, not confirm: this dialog guards actions that cannot be undone, so a
    // stray Enter on open must not be the thing that performs one.
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={headingId}>{title}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-content">
          <p>{message}</p>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button--cancel"
            onClick={onCancel}
            ref={cancelRef}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`modal-button ${destructive ? "modal-button--delete" : "modal-button--confirm"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
