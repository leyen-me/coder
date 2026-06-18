"use client";

import {
  CheckIcon,
  GitBranchIcon,
  GitForkIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useGit } from "../git-provider";

export function BranchSelector() {
  const { t } = useTranslation();
  const {
    currentBranch,
    branches,
    checkoutBranch,
    createBranch,
    deleteBranch,
  } = useGit();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const handleSelect = useCallback(
    async (branch: string) => {
      setOpen(false);
      if (branch !== currentBranch) {
        try {
          await checkoutBranch(branch);
        } catch {
          // Error handled in provider
        }
      }
    },
    [checkoutBranch, currentBranch],
  );

  const handleCreate = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name) return;
    try {
      await createBranch(name);
      setShowCreate(false);
      setNewBranchName("");
      setSearch("");
    } catch {
      // Error handled in provider
    }
  }, [createBranch, newBranchName]);

  const handleDelete = useCallback(
    async (branch: string) => {
      if (branch === currentBranch) return;
      try {
        await deleteBranch(branch);
      } catch {
        // Error handled in provider
      }
    },
    [currentBranch, deleteBranch],
  );

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                aria-label={t("git.branches")}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                type="button"
              >
                <GitForkIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("git.branches")}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput
              onValueChange={setSearch}
              placeholder={t("git.branches")}
              value={search}
            />
            <CommandList>
              <CommandEmpty>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    setShowCreate(true);
                    setOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <PlusIcon className="size-3.5" />
                  {t("git.createBranch")}
                </Button>
              </CommandEmpty>
              <CommandGroup>
                {branches.map((branch) => (
                  <CommandItem
                    key={branch}
                    onSelect={() => handleSelect(branch)}
                    value={branch}
                  >
                    <GitBranchIcon className="size-3.5" />
                    <span className="flex-1">{branch}</span>
                    {branch === currentBranch ? (
                      <CheckIcon className="size-3.5 text-primary" />
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="size-5 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(branch);
                          }}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <TrashIcon className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("git.deleteBranch")}</TooltipContent>
                    </Tooltip>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog onOpenChange={setShowCreate} open={showCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("git.createBranch")}</DialogTitle>
          </DialogHeader>
          <Input
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder={t("git.branches")}
            value={newBranchName}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("git.cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={!newBranchName.trim()}
              onClick={handleCreate}
              type="button"
            >
              {t("git.createBranch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
