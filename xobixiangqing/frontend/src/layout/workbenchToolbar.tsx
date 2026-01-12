import { createContext, useContext, useEffect, useRef } from 'react';

export type WorkbenchToolbarSlots = {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
};

export type WorkbenchToolbarApi = {
  slots: WorkbenchToolbarSlots;
  setSlots: (slots: WorkbenchToolbarSlots) => void;
  clearSlots: () => void;
};

export const WorkbenchToolbarContext = createContext<WorkbenchToolbarApi | null>(null);

export function useWorkbenchToolbar() {
  const ctx = useContext(WorkbenchToolbarContext);
  if (!ctx) {
    throw new Error('useWorkbenchToolbar must be used within WorkbenchToolbarContext.Provider');
  }
  return ctx;
}

export function useWorkbenchToolbarSlots(slots: WorkbenchToolbarSlots | null | undefined, deps: any[] = []) {
  const { setSlots, clearSlots } = useWorkbenchToolbar();
  const clearRef = useRef(clearSlots);

  useEffect(() => {
    clearRef.current = clearSlots;
  }, [clearSlots]);
  useEffect(() => {
    if (slots) setSlots(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => clearRef.current(), []);
}
