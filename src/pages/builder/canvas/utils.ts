import type { ComponentSchema } from '../../../types/component.types';
import { COMPONENT_TEMPLATES } from '../../../common/constants/component_templates';

export const getDeviceWidth = (devicePreview: 'desktop' | 'tablet' | 'mobile'): string => {
  switch (devicePreview) {
    case 'mobile':
      return '375px';
    case 'tablet':
      return '768px';
    case 'desktop':
    default:
      return '100%';
  }
};

export const getResponsivePosition = (
  component: ComponentSchema,
  devicePreview: 'desktop' | 'tablet' | 'mobile'
) => {
  const basePosition = component.position || { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 };
  const responsive = component.responsive || {};

  switch (devicePreview) {
    case 'mobile':
      return { ...basePosition, colSpan: responsive.mobile?.colSpan || 12 };
    case 'tablet':
      return { ...basePosition, colSpan: responsive.tablet?.colSpan || basePosition.colSpan };
    case 'desktop':
    default:
      return basePosition;
  }
};

export const calculateDropPosition = (
  e: React.DragEvent,
  canvasRect: DOMRect,
  componentType: string
): { col: number; row: number; colSpan: number; rowSpan: number } | null => {
  const x = e.clientX - canvasRect.left - 20; // Subtract padding
  const y = e.clientY - canvasRect.top - 20;

  const colWidth = (canvasRect.width - 40) / 12; // 12 columns minus padding
  const rowHeight = 60; // Each row is 60px

  const col = Math.max(1, Math.min(12, Math.floor(x / colWidth) + 1));
  const row = Math.max(1, Math.floor(y / rowHeight) + 1);

  const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];
  const defaultPosition = template?.defaultProps?.position || { colSpan: 12, rowSpan: 1 };

  return {
    col,
    row,
    colSpan: defaultPosition.colSpan,
    rowSpan: defaultPosition.rowSpan,
  };
};

/**
 * Throttle function to limit execution rate
 * Useful for performance-critical event handlers like drag operations
 *
 * @param func - Function to throttle
 * @param limitMs - Minimum interval between function calls (milliseconds)
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let inThrottle: boolean = false;
  let lastResult: ReturnType<T>;

  return function (this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(this, args);
      setTimeout(() => (inThrottle = false), limitMs);
      return lastResult;
    }
    return lastResult;
  };
}
