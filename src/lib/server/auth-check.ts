import "server-only";

export type AuthRole = "owner" | "partner" | "couple_group" | "unauthorized";

export type AuthCheckResult = {
  isAuthorized: boolean;
  role: AuthRole;
  displayName: string;
};

function normalizeDigits(val?: string | null): string {
  if (!val) return "";
  return val
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@g\.us$/i, "")
    .replace(/[^\d]/g, "")
    .replace(/^0/, "62");
}

export function getAuthorizedChatDetails(
  rawChatId: string,
  rawSender?: string,
  explicitIsGroup?: boolean
): AuthCheckResult {
  const coupleGroupEnv = process.env.WHATSAPP_COUPLE_GROUP_ID || "";
  const ownerPhoneEnv = process.env.WHATSAPP_OWNER_PHONE || "6285119459703";
  const partnerPhoneEnv = process.env.WHATSAPP_PARTNER_PHONE || "";

  const isGroup = explicitIsGroup !== undefined ? explicitIsGroup : rawChatId.endsWith("@g.us");

  const cleanChat = normalizeDigits(rawChatId);
  const cleanSender = normalizeDigits(rawSender || rawChatId);
  const cleanGroupEnv = normalizeDigits(coupleGroupEnv);
  const cleanOwnerEnv = normalizeDigits(ownerPhoneEnv);
  const cleanPartnerEnv = normalizeDigits(partnerPhoneEnv);

  // 1. WhatsApp Couple Group
  if (isGroup) {
    const isTargetGroup = cleanGroupEnv && cleanChat === cleanGroupEnv;
    const isKnownMember =
      (cleanOwnerEnv && cleanSender === cleanOwnerEnv) ||
      (cleanPartnerEnv && cleanSender === cleanPartnerEnv);

    if (isTargetGroup || isKnownMember) {
      const displayName =
        cleanSender === cleanOwnerEnv
          ? "Kamu"
          : cleanSender === cleanPartnerEnv
          ? "Sayang"
          : "Teman Belajar";

      return {
        isAuthorized: true,
        role: "couple_group",
        displayName,
      };
    }

    return {
      isAuthorized: false,
      role: "unauthorized",
      displayName: "Tamu",
    };
  }

  // 2. Personal DM: Owner
  if (cleanOwnerEnv && cleanSender === cleanOwnerEnv) {
    return {
      isAuthorized: true,
      role: "owner",
      displayName: "Kamu",
    };
  }

  // 3. Personal DM: Partner
  if (cleanPartnerEnv && cleanSender === cleanPartnerEnv) {
    return {
      isAuthorized: true,
      role: "partner",
      displayName: "Sayang",
    };
  }

  return {
    isAuthorized: false,
    role: "unauthorized",
    displayName: "Tamu",
  };
}

export function isAuthorizedChat(
  rawChatId: string,
  rawSender?: string,
  explicitIsGroup?: boolean
): boolean {
  return getAuthorizedChatDetails(rawChatId, rawSender, explicitIsGroup).isAuthorized;
}

export function getAuthorizedSenderType(
  rawChatId: string,
  rawSender?: string
): "owner" | "partner" | "couple_group" | null {
  const details = getAuthorizedChatDetails(rawChatId, rawSender);
  return details.isAuthorized && details.role !== "unauthorized" ? details.role : null;
}
