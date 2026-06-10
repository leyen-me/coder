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
    plugins: string;
    automations: string;
    settings: string;
    allChats: string;
    filterChats: string;
    agentRunning: string;
  };
  session: {
    newChat: string;
    generatingTitle: string;
    fastMode: string;
    commit: string;
    exportSession: string;
    shareLink: string;
    splitLayout: string;
    rightPanel: string;
    workbench: string;
    bottomPanel: string;
    agentProcesses: string;
    agentProcessesRunning: string;
  };
  chat: {
    headline: string;
    composerPlaceholder: string;
    addAttachment: string;
    removeAttachment: string;
    removeReference: string;
    mentionSearching: string;
    mentionNoWorkspace: string;
    mentionNoResults: string;
    attachmentErrorAccept: string;
    attachmentErrorMultimodalUnsupported: string;
    attachmentErrorMaxSize: string;
    attachmentErrorMaxFiles: string;
    externalDropWorkspaceRequired: string;
    externalDropOutsideWorkspace: string;
    externalDropPathUnresolved: string;
    externalDropInvalidPath: string;
    externalDropUnsupportedRuntime: string;
    defaultPermission: string;
    readOnly: string;
    confirmBeforeRun: string;
    send: string;
    stop: string;
    localWork: string;
    selectWorkspace: string;
    clearWorkspace: string;
    workspaceSelected: string;
    selectGitBranch: string;
    gitBranchLoading: string;
    thinking: string;
    thinkingInProgress: string;
    thinkingPlaceholder: string;
    systemPrompt: string;
    thoughtForSeconds: string;
    answer: string;
    toolDetailTitle: string;
    copyMessage: string;
    editMessage: string;
    editingMessage: string;
    cancelEdit: string;
    forkMessage: string;
    forkSessionTitle: string;
    regenerateMessage: string;
    noModel: string;
    thinkingToggle: string;
    thinkingToggleLabel: string;
    thinkingEnabled: string;
    thinkingDisabled: string;
    contextUsageTrigger: string;
    contextUsageInput: string;
    contextUsageOutput: string;
    contextUsageReasoning: string;
    contextUsageCache: string;
  };
  time: {
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
    weeksAgo: string;
    monthsAgo: string;
  };
  settings: {
    title: string;
    categories: {
      general: string;
      appearance: string;
      modelProvider: string;
      webTools: string;
      data: string;
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
    modelProvider: {
      providerLabel: string;
      providerDescription: string;
      providerAriaLabel: string;
      providers: {
        deepseek: string;
        glm: string;
        custom: string;
      };
      endpointLabel: string;
      endpointDescription: string;
      baseUrlLabel: string;
      baseUrlDescription: string;
      baseUrlPlaceholder: string;
      baseUrlAriaLabel: string;
      apiKeySourceLabel: string;
      apiKeySourceDescription: string;
      apiKeySourceAriaLabel: string;
      apiKeySources: {
        manual: string;
        env: string;
      };
      apiKeyLabel: string;
      apiKeyDescription: string;
      apiKeyPlaceholder: string;
      apiKeyAriaLabel: string;
      apiKeyEnvVarLabel: string;
      apiKeyEnvVarDescription: string;
      apiKeyEnvVarPlaceholder: string;
      apiKeyEnvVarAriaLabel: string;
      modelsLabel: string;
      modelsDescription: string;
      presetModelsDescription: string;
      modelsPlaceholder: string;
      modelsAriaLabel: string;
      modelIdLabel: string;
      modelIdPlaceholder: string;
      modelIdAriaLabel: string;
      modelLabelLabel: string;
      modelLabelPlaceholder: string;
      modelLabelAriaLabel: string;
      contextWindowLabel: string;
      contextWindowAriaLabel: string;
      contextWindowBadge: string;
      thinkingBadge: string;
      multimodalBadge: string;
      supportsThinkingLabel: string;
      supportsMultimodalLabel: string;
      addModelButton: string;
      removeModelAriaLabel: string;
      emptyModelsHint: string;
      thinkingConfigDescription: string;
      thinkingEnabledParamsLabel: string;
      thinkingEnabledParamsAriaLabel: string;
      thinkingDisabledParamsLabel: string;
      thinkingDisabledParamsAriaLabel: string;
      thinkingDefaultEnabledLabel: string;
    };
    webTools: {
      tavilyApiKeySourceLabel: string;
      tavilyApiKeySourceDescription: string;
      tavilyApiKeySourceAriaLabel: string;
      apiKeySources: {
        manual: string;
        env: string;
      };
      tavilyApiKeyLabel: string;
      tavilyApiKeyDescription: string;
      tavilyApiKeyPlaceholder: string;
      tavilyApiKeyAriaLabel: string;
      tavilyApiKeyEnvVarLabel: string;
      tavilyApiKeyEnvVarDescription: string;
      tavilyApiKeyEnvVarPlaceholder: string;
      tavilyApiKeyEnvVarAriaLabel: string;
      allowPrivateNetworkAccessLabel: string;
      allowPrivateNetworkAccessDescription: string;
      allowPrivateNetworkAccessAriaLabel: string;
    };
    data: {
      clearChatHistoryLabel: string;
      clearChatHistoryDescription: string;
      clearButton: string;
      confirmTitle: string;
      confirmDescription: string;
      confirmCancel: string;
      confirmAction: string;
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
  search: {
    title: string;
    placeholder: string;
    hint: string;
  };
  pages: {
    history: { title: string };
    skills: { title: string };
    plugins: { title: string };
    automations: { title: string };
    chatSession: { title: string };
    comingSoon: string;
  };
  rightPanel: {
    fileTree: string;
    browser: string;
    explorer: string;
    noWorkspace: string;
    loading: string;
    browserPlaceholder: string;
    closePreview: string;
    previewLoading: string;
    previewBinary: string;
    previewTooLarge: string;
    previewGitignored: string;
    previewSecretsWarning: string;
    previewTruncated: string;
    menuOpen: string;
    menuClosePreview: string;
    menuAddToChat: string;
    menuCopyPath: string;
    menuCopyAbsolutePath: string;
    menuCopy: string;
    menuCut: string;
    menuPaste: string;
    menuRename: string;
    menuDelete: string;
    menuRevealInExplorer: string;
    menuOpenWithDefaultApp: string;
    menuExpand: string;
    menuCollapse: string;
    menuNewFile: string;
    menuNewFolder: string;
    menuRefresh: string;
    menuCollapseAll: string;
    menuShowHiddenFiles: string;
    dialogNewFileTitle: string;
    dialogNewFileDescription: string;
    dialogNewFolderTitle: string;
    dialogNewFolderDescription: string;
    dialogRenameTitle: string;
    dialogRenameDescription: string;
    dialogDeleteTitle: string;
    dialogDeleteFileDescription: string;
    dialogDeleteFolderDescription: string;
    dialogNamePlaceholder: string;
    dialogCancel: string;
    dialogConfirm: string;
    errorNameRequired: string;
    toastCopied: string;
    toastCopiedForPaste: string;
    toastCutForPaste: string;
    toastPasted: string;
    toastRenamed: string;
    toastFolderCreated: string;
    toastFileCreated: string;
    toastDeleted: string;
  };
  terminal: {
    agentProcesses: string;
    runningCount: string;
    noProcesses: string;
    killProcess: string;
    closeSession: string;
    addSession: string;
    loading: string;
    unavailable: string;
  };
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
