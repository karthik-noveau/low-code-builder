/**
 * Alignment Guides Component
 * Renders SVG overlay with visual snap guides during drag operations
 *
 * Shows visual feedback when components align with each other:
 * - Vertical lines for column alignment
 * - Horizontal lines for row alignment
 * - Animated pulsing effect
 */

import type { AlignmentGuide } from '../services/snap_engine';
import styles from './alignment_guides.module.css';

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
  canvasRect: DOMRect;
}

/**
 * AlignmentGuides Component
 * Renders alignment guides as SVG lines
 */
export const AlignmentGuides = ({ guides, canvasRect }: AlignmentGuidesProps) => {
  if (guides.length === 0) return null;

  return (
    <svg
      className={styles.guidesOverlay}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasRect.width,
        height: canvasRect.height,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {guides.map((guide, index) => {
        if (guide.type === 'vertical') {
          // Vertical line (for horizontal alignment)
          return (
            <line
              key={`v-${index}`}
              x1={guide.position + 20} // offset by canvas padding
              y1={guide.start + 20}
              x2={guide.position + 20}
              y2={guide.end + 20}
              className={styles.guideLine}
              strokeDasharray="4 4"
            />
          );
        } else {
          // Horizontal line (for vertical alignment)
          return (
            <line
              key={`h-${index}`}
              x1={guide.start + 20}
              y1={guide.position + 20}
              x2={guide.end + 20}
              y2={guide.position + 20}
              className={styles.guideLine}
              strokeDasharray="4 4"
            />
          );
        }
      })}
    </svg>
  );
};
