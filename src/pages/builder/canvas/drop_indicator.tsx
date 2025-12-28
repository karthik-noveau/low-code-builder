import styles from './style.module.css';

interface DropIndicatorProps {
  position: {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
  };
}

export const DropIndicator = ({ position }: DropIndicatorProps) => {
  return (
    <div
      className={styles.dropIndicator}
      style={{
        gridColumnStart: position.col,
        gridColumnEnd: Math.min(13, position.col + position.colSpan),
        gridRowStart: position.row,
        gridRowEnd: position.row + position.rowSpan,
      }}
    >
      Drop here
    </div>
  );
};
