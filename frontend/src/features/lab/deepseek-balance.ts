const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

export type DeepSeekBalanceInfo = {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
};

export type DeepSeekBalanceResponse = {
  isAvailable: boolean;
  balanceInfos: DeepSeekBalanceInfo[];
};

export async function fetchDeepSeekBalance(
  apiKey: string
): Promise<DeepSeekBalanceResponse> {
  const response = await fetch(DEEPSEEK_BALANCE_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek balance API returned ${response.status}: ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    is_available: boolean;
    balance_infos: Array<{
      currency: string;
      total_balance: string;
      granted_balance: string;
      topped_up_balance: string;
    }>;
  };

  return {
    isAvailable: data.is_available,
    balanceInfos: data.balance_infos.map((info) => ({
      currency: info.currency,
      totalBalance: info.total_balance,
      grantedBalance: info.granted_balance,
      toppedUpBalance: info.topped_up_balance,
    })),
  };
}
