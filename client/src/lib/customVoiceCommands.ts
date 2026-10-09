export type VoiceCommandAction =
  | "understand_text"
  | "open_dashboard"
  | "open_products"
  | "open_sales"
  | "open_recipes"
  | "open_offers"
  | "open_shortages"
  | "open_voice"
  | "open_catalog";

export interface CustomVoiceCommand {
  id: string;
  phrase: string;
  action: VoiceCommandAction;
  createdAt: string;
}

export interface VoiceInstruction {
  kind: "navigate" | "search" | "back" | "exit" | "unknown";
  route?: string;
  response: string;
}

export const VOICE_COMMAND_ACTIONS: Array<{ value: VoiceCommandAction; label: string; route?: string; response: string }> = [
  { value: "understand_text", label: "يفهم الجملة تلقائيًا (موصى به)", response: "جاري فهم الأمر" },
  { value: "open_dashboard", label: "فتح لوحة التحكم", route: "/dashboard", response: "جاري فتح لوحة التحكم" },
  { value: "open_products", label: "فتح المنتجات وأسعار البيع", route: "/products", response: "جاري فتح المنتجات" },
  { value: "open_sales", label: "فتح تسجيل مبيعة", route: "/sales", response: "جاري فتح تسجيل المبيعات" },
  { value: "open_recipes", label: "فتح التركيبات", route: "/recipes", response: "جاري فتح التركيبات" },
  { value: "open_offers", label: "فتح العروض الذكية", route: "/smart-offers", response: "جاري فتح العروض الذكية" },
  { value: "open_shortages", label: "فتح النواقص", route: "/shortages", response: "جاري فتح النواقص" },
  { value: "open_voice", label: "فتح الأوامر الصوتية", route: "/voice", response: "جاري فتح الأوامر الصوتية" },
  { value: "open_catalog", label: "فتح كتالوج المحل", route: "/catalog-manager", response: "جاري فتح كتالوج المحل" },
];

export const normalizeVoicePhrase = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[ًٌٍَُِّْـ]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/[^\u0600-\u06FFa-z0-9\s]/g, " ")
  .replace(/\s+/g, " ");

export const findCustomVoiceCommand = (spokenText: string, commands: CustomVoiceCommand[]) => {
  const normalizedSpoken = normalizeVoicePhrase(spokenText);
  return commands.find(command => normalizeVoicePhrase(command.phrase) === normalizedSpoken)
    || commands.find(command => normalizeVoicePhrase(command.phrase).length >= 5 && normalizedSpoken.includes(normalizeVoicePhrase(command.phrase)));
};

export const getVoiceAction = (action: VoiceCommandAction) => VOICE_COMMAND_ACTIONS.find(item => item.value === action);

const searchTermFrom = (text: string) => text
  .replace(/ابحث عن|بحث عن|دور على|دورلي على|هاتلي|فين/gi, "")
  .replace(/منتج|المنتج|تركيبة|التركيبة|اسم/gi, "")
  .trim();

export const interpretVoiceInstruction = (spokenText: string): VoiceInstruction => {
  const text = normalizeVoicePhrase(spokenText);
  const isSearch = /ابحث|بحث|دور|هاتلي|فين/.test(text);
  if (isSearch) {
    const term = searchTermFrom(text);
    if (!term) return { kind: "unknown", response: "اكتب اسم المنتج أو التركيبة بعد كلمة ابحث" };
    const type = /تركيبة|تركيبات|خلطة|خلطات/.test(text) ? "recipes" : "products";
    return { kind: "search", route: `/advanced-search?type=${type}&query=${encodeURIComponent(term)}`, response: `جاري البحث عن ${term}` };
  }

  if (/رجوع|العودة|ارجع|القائمة السابقة|خلف/.test(text)) return { kind: "back", response: "جاري الرجوع للصفحة السابقة" };
  if (/خروج|اخرج|اقفل التطبيق|غلق التطبيق/.test(text)) return { kind: "exit", route: "/", response: "جاري الخروج إلى صفحة البداية" };

  const destinations: Array<{ words: RegExp; route: string; response: string }> = [
    { words: /فاتورة|فواتير|تصوير الفواتير/, route: "/invoice-camera", response: "جاري فتح صفحة الفواتير" },
    { words: /كاشير|بيع سريع|نقطة بيع/, route: "/sales", response: "جاري فتح البيع السريع" },
    { words: /مبيعات|تسجيل مبيعة|بيع/, route: "/sales", response: "جاري فتح المبيعات" },
    { words: /منتجات|بضاعة|اصناف/, route: "/products", response: "جاري فتح المنتجات" },
    { words: /تركيبات|تركيبة|خلطات|خلطة/, route: "/recipes", response: "جاري فتح التركيبات" },
    { words: /عروض|عرض|خصومات/, route: "/smart-offers", response: "جاري فتح العروض" },
    { words: /نواقص|ناقص/, route: "/shortages", response: "جاري فتح النواقص" },
    { words: /اجل|موردين|الموردين/, route: "/credits-suppliers", response: "جاري فتح الأجل والموردين" },
    { words: /موظفين|العاملين/, route: "/employees", response: "جاري فتح الموظفين" },
    { words: /كتالوج|طلبات العملاء/, route: "/catalog-manager", response: "جاري فتح الكتالوج" },
    { words: /رئيسية|لوحة التحكم|الهوم|البيت/, route: "/dashboard", response: "جاري فتح لوحة التحكم" },
  ];
  const destination = destinations.find(item => item.words.test(text));
  return destination ? { kind: "navigate", route: destination.route, response: destination.response } : { kind: "unknown", response: "لم أفهم الجملة. جرّب: افتح صفحة الفواتير، ابحث عن منتج كذا، أو ارجع للقائمة." };
};

export const resolveCustomVoiceInstruction = (command: CustomVoiceCommand): VoiceInstruction => {
  const inferredInstruction = interpretVoiceInstruction(command.phrase);
  if (inferredInstruction.kind !== "unknown") return inferredInstruction;
  if (command.action === "understand_text") return inferredInstruction;
  const action = getVoiceAction(command.action);
  return action?.route ? { kind: "navigate", route: action.route, response: action.response } : inferredInstruction;
};
