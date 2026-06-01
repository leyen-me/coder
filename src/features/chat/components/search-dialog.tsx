import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/locale-provider";

type SearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>

        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("search.placeholder")}
            className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
            autoFocus
          />
        </div>

        <p className="px-5 py-8 text-sm text-muted-foreground">
          {t("search.hint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
