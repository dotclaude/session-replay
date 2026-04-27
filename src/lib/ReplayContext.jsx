import { createContext, useContext } from 'react';

export const ReplayContext = createContext({ projectId: null, sessionId: null, steps: [], session: null });

export function useReplayContext() {
  return useContext(ReplayContext);
}
