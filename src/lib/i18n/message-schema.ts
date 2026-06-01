export type Messages = {
  titleBar: {
    ariaLabel: string;
    windowNav: string;
    toggleSidebar: string;
    back: string;
    forward: string;
  };
  windowControls: {
    minimize: string;
    maximize: string;
    restore: string;
    close: string;
  };
  sidebar: {
    newChat: string;
    search: string;
    skills: string;
    components: string;
    automations: string;
    settings: string;
    allChats: string;
    filterChats: string;
    showMore: string;
  };
  session: {
    newChat: string;
    fastMode: string;
    commit: string;
    exportSession: string;
    shareLink: string;
    splitLayout: string;
    rightPanel: string;
    workbench: string;
  };
  chat: {
    headline: string;
    composerPlaceholder: string;
    addAttachment: string;
    defaultPermission: string;
    readOnly: string;
    confirmBeforeRun: string;
    send: string;
    localWork: string;
  };
  settings: {
    title: string;
    categories: {
      general: string;
      appearance: string;
    };
    general: {
      languageLabel: string;
      languageDescription: string;
      languageAriaLabel: string;
    };
    appearance: {
      themeLabel: string;
      themeDescription: string;
      themeAriaLabel: string;
    };
  };
  theme: {
    light: string;
    dark: string;
    system: string;
  };
  locale: {
    zh: string;
    en: string;
  };
  starterPrompts: ReadonlyArray<{
    id: string;
    label: string;
    prompt: string;
  }>;
  mockChats: ReadonlyArray<{
    id: string;
    title: string;
    relativeTime: string;
  }>;
};

type Join<K extends string, P extends string> = P extends "" ? K : `${K}.${P}`;

type NestedMessageKey<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends readonly unknown[]
    ? Prefix extends ""
      ? K
      : Join<Prefix, K>
    : T[K] extends string
      ? Prefix extends ""
        ? K
        : Join<Prefix, K>
      : NestedMessageKey<T[K], Prefix extends "" ? K : Join<Prefix, K>>;
}[keyof T & string];

export type MessageKey = NestedMessageKey<Messages>;
