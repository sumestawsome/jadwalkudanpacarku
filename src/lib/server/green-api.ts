import "server-only";

export type GreenApiCredentials = {
  idInstance?: string;
  apiTokenInstance?: string;
  baseUrl?: string;
};

/**
 * Normalizes a target string or chatId to Green-API chatId format:
 * - Group: {groupId}@g.us
 * - Personal: {phone}@c.us
 */
export function formatGreenApiChatId(target: string, isGroup?: boolean): string {
  const clean = target.trim();
  if (!clean) return "";

  if (isGroup || clean.endsWith("@g.us") || clean.includes("-") || clean.startsWith("120363")) {
    const rawGroup = clean.replace(/@g\.us$/i, "").replace(/@c\.us$/i, "");
    return `${rawGroup}@g.us`;
  }

  // Personal phone number
  const cleanPhone = clean
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/[^\d]/g, "")
    .replace(/^0/, "62");

  return `${cleanPhone}@c.us`;
}

export function getGreenApiConfig(credentials?: GreenApiCredentials) {
  const idInstance = (
    credentials?.idInstance ||
    process.env.GREEN_API_ID_INSTANCE ||
    process.env.NEXT_PUBLIC_GREEN_API_ID_INSTANCE ||
    ""
  ).trim();

  const apiTokenInstance = (
    credentials?.apiTokenInstance ||
    process.env.GREEN_API_TOKEN_INSTANCE ||
    ""
  ).trim();

  let baseUrl = (
    credentials?.baseUrl ||
    process.env.GREEN_API_BASE_URL ||
    "https://api.green-api.com"
  ).trim();

  baseUrl = baseUrl.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\/$/, "");

  return { idInstance, apiTokenInstance, baseUrl };
}

/**
 * Sends a WhatsApp text message via Green-API HTTP REST endpoint.
 */
export async function sendGreenApiTextMessage(
  chatId: string,
  message: string,
  credentials?: GreenApiCredentials
): Promise<{ ok: boolean; idMessage?: string; error?: string }> {
  const { idInstance, apiTokenInstance, baseUrl } = getGreenApiConfig(credentials);

  if (!idInstance || !apiTokenInstance) {
    const errorMsg = "Green-API idInstance or apiTokenInstance is not configured.";
    console.error(`[GreenApi] ${errorMsg}`);
    return { ok: false, error: errorMsg };
  }

  const formattedChatId = formatGreenApiChatId(chatId);
  if (!formattedChatId) {
    return { ok: false, error: "Target chatId is invalid or empty." };
  }

  const endpoint = `${baseUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId: formattedChatId,
        message,
      }),
    });

    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { rawText: responseText };
    }

    if (!response.ok) {
      const errMsg = (data.error || data.message || `HTTP ${response.status}`) as string;
      console.error(`[GreenApi] Failed to send message to ${formattedChatId}:`, errMsg);
      return { ok: false, error: errMsg };
    }

    return {
      ok: true,
      idMessage: (data.idMessage as string) || undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[GreenApi] Network error sending message to ${formattedChatId}:`, err);
    return { ok: false, error: errMsg };
  }
}
