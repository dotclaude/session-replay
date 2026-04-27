import { createContext, useContext } from 'react';
import { SessionProvider } from './SessionProvider.ts';

const nullProvider = new SessionProvider(null);

export const SessionProviderContext = createContext({
  provider: nullProvider,
  reinitialise: async () => {},
});

export function useSessionProvider() {
  return useContext(SessionProviderContext);
}
