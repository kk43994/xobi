import { createContext, useContext, useEffect, useRef } from 'react';

export type AgentApplyPayload = {
  response: string;
  action?: string | null;
  suggestions?: string[] | null;
  extracted_info?: Record<string, any> | null;
  data?: Record<string, any> | null;
  raw?: any;
};

export type AgentBridgeSlots = {
  title?: string;
  context?: Record<string, any> | null;
  onApply?: ((payload: AgentApplyPayload) => void) | null;
};

export type AgentBridgeApi = {
  slots: AgentBridgeSlots;
  setSlots: (slots: AgentBridgeSlots) => void;
  clearSlots: () => void;
};

export const AgentBridgeContext = createContext<AgentBridgeApi | null>(null);

export function useAgentBridge() {
  const ctx = useContext(AgentBridgeContext);
  if (!ctx) {
    throw new Error('useAgentBridge must be used within AgentBridgeContext.Provider');
  }
  return ctx;
}

export function useAgentBridgeSlots(slots: AgentBridgeSlots | null | undefined, deps: any[] = []) {
  const { setSlots, clearSlots } = useAgentBridge();
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
