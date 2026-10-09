export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "أبو رغوة";

export const APP_LOGO = "https://placehold.co/128x128/E1E7EF/1F2937?text=App";

// إعدادات المدير — تُستكمل من إعدادات التطبيق بعد إنشاء الحساب الأول.
export const ADMIN_EMAIL = "";
export const ADMIN_ROLE = "مدير";

// وسائل التواصل الاجتماعي
export const startLogin = () => { window.location.href = "/"; };
export const SHOP_INFO = { name: "أبو رغوة", phone: "", email: "", address: "" };
export const SOCIAL_MEDIA = {
  whatsapp: {
    number: "01069035599",
    link: "https://wa.me/201069035599",
    icon: "📱"
  },
  facebook: {
    page: "https://www.facebook.com/aburagwa",
    link: "https://www.facebook.com/aburagwa",
    icon: "f"
  },
  instagram: {
    handle: "aburagwa",
    link: "https://www.instagram.com/aburagwa",
    icon: "📷"
  }
};
