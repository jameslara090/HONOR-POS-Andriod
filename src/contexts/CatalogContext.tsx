import { createContext, useContext, type ReactNode } from 'react';
import { useCatalog } from '../hooks/useCatalog';

type CatalogContextValue = ReturnType<typeof useCatalog>;

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useCatalogContext(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalogContext must be used within CatalogProvider');
  return ctx;
}
