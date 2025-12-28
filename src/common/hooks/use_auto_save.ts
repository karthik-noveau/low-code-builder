import { useEffect } from 'react';

/**
 * Custom hook to auto-save draft to localStorage every interval
 * @param saveFn - Function to call for saving
 * @param interval - Interval in milliseconds (default: 2000ms)
 */
export const useAutoSave = (saveFn: () => void, interval: number = 2000): void => {
  useEffect(() => {
    const timer = setInterval(() => {
      saveFn();
    }, interval);

    return () => clearInterval(timer);
  }, [saveFn, interval]);
};
