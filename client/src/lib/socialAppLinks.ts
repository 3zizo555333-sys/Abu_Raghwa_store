export type SocialApp = "whatsapp" | "facebook" | "instagram";

const waitForAppOrFallback = (appUrl: string, fallbackUrl: string) => {
  let appOpened = document.visibilityState === "hidden";
  const markAppOpened = () => {
    if (document.visibilityState === "hidden") appOpened = true;
  };

  document.addEventListener("visibilitychange", markAppOpened, { once: true });
  window.location.assign(appUrl);

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", markAppOpened);
    if (!appOpened && document.visibilityState === "visible") window.location.assign(fallbackUrl);
  }, 1200);
};

const asWebUrl = (value: string, base: string) => value.trim().startsWith("http") ? value.trim() : `${base}/${value.trim().replace(/^@/, "")}`;

export const openSocialApp = (app: SocialApp, value: string, message = "السلام عليكم ورحمة الله وبركاته") => {
  if (app === "whatsapp") {
    const phone = value.replace(/\D/g, "");
    const encodedMessage = encodeURIComponent(message);
    waitForAppOrFallback(`whatsapp://send?phone=${phone}&text=${encodedMessage}`, `https://wa.me/${phone}?text=${encodedMessage}`);
    return;
  }

  if (app === "facebook") {
    const webUrl = asWebUrl(value, "https://www.facebook.com");
    waitForAppOrFallback(`fb://facewebmodal/f?href=${encodeURIComponent(webUrl)}`, webUrl);
    return;
  }

  const username = value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.+$/, "");
  const webUrl = `https://www.instagram.com/${username}`;
  waitForAppOrFallback(`instagram://user?username=${encodeURIComponent(username)}`, webUrl);
};

export const getSavedSocialLinks = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("abu_raghwa_settings") || "{}");
    return {
      whatsapp: saved.whatsappNumber || "201069035599",
      facebook: saved.facebookPage || "https://www.facebook.com/aburagwa",
      instagram: saved.instagramHandle || "aburagwa",
    };
  } catch {
    return { whatsapp: "201069035599", facebook: "https://www.facebook.com/aburagwa", instagram: "aburagwa" };
  }
};
