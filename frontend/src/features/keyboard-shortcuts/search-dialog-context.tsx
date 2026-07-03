import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SearchDialog } from "@/features/chat/components/search-dialog";

type SearchDialogContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
};

const SearchDialogContext = createContext<SearchDialogContextValue | null>(null);

export function SearchDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      setOpen: setIsOpen,
    }),
    [close, isOpen, open]
  );

  return (
    <SearchDialogContext.Provider value={value}>
      {children}
      <SearchDialog open={isOpen} onOpenChange={setIsOpen} />
    </SearchDialogContext.Provider>
  );
}

export function useSearchDialog(): SearchDialogContextValue {
  const context = useContext(SearchDialogContext);

  if (!context) {
    throw new Error("useSearchDialog must be used within SearchDialogProvider");
  }

  return context;
}
