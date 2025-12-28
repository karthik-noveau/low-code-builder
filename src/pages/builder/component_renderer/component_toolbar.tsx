import styles from './style.module.css';

interface ComponentToolbarProps {
  onDuplicate: () => void;
  onDelete: () => void;
}

export const ComponentToolbar = ({ onDuplicate, onDelete }: ComponentToolbarProps) => {
  return (
    <div className={styles.componentToolbar}>
      <button
        className={styles.toolbarButton}
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        title="Duplicate (Ctrl+D)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
          <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
        </svg>
      </button>
      <button
        className={`${styles.toolbarButton} ${styles.danger}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete (Delete key)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};
