export function ConfirmDeleteModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
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
          <button type="button" className="modal-button modal-button--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-button modal-button--delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
