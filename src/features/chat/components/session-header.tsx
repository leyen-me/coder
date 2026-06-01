import { SessionToolbar } from "./session-toolbar";

type SessionHeaderProps = {
  title: string;
};

export function SessionHeader({ title }: SessionHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <h1 className="truncate text-sm font-medium">{title}</h1>
      <SessionToolbar />
    </header>
  );
}
