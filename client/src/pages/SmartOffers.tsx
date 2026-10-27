import { browserState } from "@/lib/browserState";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Share2, Printer, RotateCw, CheckCircle2, Plus, Trash2, Sparkles, Gift, Award, Calendar, History, Download, Facebook, Users, Star, MessageCircle, FileSpreadsheet, Check, TrendingUp, TrendingDown, Award as AwardIcon, ShoppingCart, XCircle, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { getPieceCost, getPieceSalePrice } from "@/lib/profit";
import { trpc } from "@/lib/trpc";
import { useShopFeatureState } from "@/lib/supabase/featureState";
import { listCatalogDisplayData } from "@/lib/supabase/operations";
import { createOfferForStrategy, type OfferCandidate } from "@/lib/offerStrategy";
import { createOfferId } from "@/lib/offerIds";
import { updateLoyaltyRewardPoints, upsertLoyaltyRewardLevel } from "@/lib/loyaltyRewards";
import { calculateManualOfferPrice, type ManualDiscountType } from "@/lib/manualOffer";
import { createOfferExpiryWindow, formatOfferTimeRemaining, getOfferExpiryInfo, parseLegacyOfferDate } from "@/lib/offerExpiry";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { MarketingShareButton } from "@/components/MarketingShareComposer";
import { listStoreOfferOrders, saveStoreOffer, updateStoreOfferOrderStatus, type CloudOfferOrder } from "@/lib/supabase/storeOffers";
import { createLoyaltyMilestone, listLoyaltyExperienceSettings, saveReferralCampaign, updateLoyaltyMilestone, uploadLoyaltyMilestoneImage, type LoyaltyMilestoneRow } from "@/lib/supabase/loyaltyExperience";
import { OfferVideoScriptButton } from "@/components/OfferVideoScript";
import { generateCatalogOfferBanner, removeCatalogOfferImage, uploadCatalogOfferImage } from "@/lib/supabase/offerImages";

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitsPerPackage: number;
  wholesalePricePerUnit: number;
  wholesalePricePerPiece: number;
  wholesalePrice?: number;
  retailPrice: number;
  wholesaleRetailPrice?: number;
  bulkPrice: number;
  imageUrl?: string;
}

interface Recipe {
  id: string;
  name: string;
  salePrice: number;
  totalCost: number;
  costPerUnit?: number;
  productionQuantity?: number;
  imageUrl?: string;
}

interface SmartOffer {
  id: string;
  title: string;
  bannerTitle?: string;
  promoText?: string;
  bgColor?: string;
  bgGradient?: string;
  backgroundMode?: "solid" | "gradient";
  gradientStartColor?: string;
  gradientEndColor?: string;
  strategyName: string;
  items: Array<{ name: string; costPrice: number; retailPrice: number; offerPrice: number; type: "product" | "recipe"; imageUrl?: string }>;
  originalTotalRetail: number;
  totalCostPrice: number;
  offerPrice: number;
  discountAmount: number;
  discountPercent: number;
  description: string;
  type: string;
  startDate: string;
  endDate: string;
  startAt?: number;
  endAt?: number;
  qrCodeDataUrl?: string;
  scanCount?: number;
  isActivated?: boolean;
  loyaltyPoints?: number;
  bannerImageUrl?: string;
  bannerImageStoragePath?: string;
  bannerCustomImage?: string;
  bannerCustomImageStoragePath?: string;
}

const OFFER_GRADIENT_PRESETS = [
  { label: "فخم أسود وذهبي", value: "linear-gradient(135deg, #0c0907 0%, #3b1d0b 52%, #f59e0b 100%)", start: "#0c0907", end: "#f59e0b" },
  { label: "ملكي بنفسجي", value: "linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)", start: "#1d4ed8", end: "#6d28d9" },
  { label: "فوسفوري زمردي", value: "linear-gradient(135deg, #84cc16 0%, #047857 100%)", start: "#84cc16", end: "#047857" },
  { label: "كحلي نيلي", value: "linear-gradient(135deg, #0f172a 0%, #312e81 100%)", start: "#0f172a", end: "#312e81" },
  { label: "ناري دافئ", value: "linear-gradient(135deg, #991b1b 0%, #f97316 55%, #facc15 100%)", start: "#991b1b", end: "#facc15" },
] as const;

interface OfferStrategy {
  id: string;
  name: string;
  category: "daily" | "weekly" | "monthly" | "seasonal" | "custom";
  description: string;
}

interface CustomerLoyalty {
  name: string;
  customerCode?: string;
  phone: string;
  points: number;
  usedCoupons: string[];
  transactions?: Array<{ id: string; points: number; source: string; description: string; createdAt: string }>;
}

interface RewardLevel {
  id?: string;
  points: number;
  giftName: string;
  giftCost?: number;
  rewardImageUrl?: string | null;
  isMystery?: boolean;
  confirmed?: boolean;
}

interface GiftDeliveryLog {
  customerCode?: string;
  customerName: string;
  customerPhone: string;
  giftName: string;
  pointsDeducted: number;
  giftCost?: number;
  date: string;
}

const DEFAULT_STRATEGIES: OfferStrategy[] = [
  { id: "bogo_1_1", name: "1. اشترِ 1 واحصل على 1 مجاناً (BOGO 1+1)", category: "daily", description: "اشترِ قطعة واحصل على قطعة أخرى مجاناً." },
  { id: "bogo_2_1", name: "2. اشترِ 2 واحصل على 1 مجاناً (2+1 مجاناً)", category: "weekly", description: "اشترِ قطعتين واحصل على الثالثة مجاناً." },
  { id: "bogo_half", name: "3. القطعة الثانية بنصف السعر (خصم 50%)", category: "daily", description: "خصم 50% على القطعة الثانية." },
  { id: "bundle_cleaning", name: "4. باكدج التوفير التكاملي (مسحوق + معطر + كلور)", category: "custom", description: "باكدج متكامل من منتجات التنظيف بسعر آمن." },
  { id: "bundle_bridal", name: "5. باكدج تجهيز العروسة / التجهيز المنزلي", category: "custom", description: "باكدج تجهيز منزلي شامل." },
  { id: "mix_match", name: "6. التشكيلة الحرة (اختر أي 3 أصناف بسعر موحد)", category: "weekly", description: "اختر أي 3 أصناف بسعر موحد." },
  { id: "volume_tier", name: "7. الخصم المتدرج للكميات (كلما زادت الكمية قل السعر)", category: "weekly", description: "كلما زادت الكمية قل السعر مع الحفاظ على التكلفة." },
  { id: "spend_save", name: "8. خصم الحد الأدنى (اشترِ بـ 300 ج واحصل على خصم 50 ج)", category: "monthly", description: "خصم عند تجاوز حد شراء محدد." },
  { id: "free_gift_thresh", name: "9. هدية فورية عند وصول حد شراء معين", category: "custom", description: "هدية فورية عند الوصول إلى حد الشراء." },
  { id: "loss_leader", name: "10. صنف الجذب الحارق (سعر الجملة/التكلفة لجلب الزبائن)", category: "daily", description: "سعر جذب لا يقل عن سعر الجملة/التكلفة." },
  { id: "flash_sale", name: "11. فلاش سيل / الساعات الذهبية (خصم لساعتين فقط)", category: "daily", description: "خصم محدود خلال الساعات الذهبية." },
  { id: "clearance", name: "12. تصفية المخزون الراكد (سعر التكلفة لتحريك السيولة)", category: "custom", description: "تصفية آمنة للمخزون الراكد دون بيع بأقل من التكلفة." },
  { id: "double_points", name: "13. مضاعفة نقاط الولاء (نقاط 2x أو 3x)", category: "monthly", description: "نقاط ولاء مضاعفة أو ثلاثية." },
  { id: "family_bulk", name: "14. الحجم العائلي التوفيري (جراكن وعبوات ضخمة)", category: "monthly", description: "حجم عائلي توفيري للعبوات الكبيرة." },
  { id: "refill_discount", name: "15. خصم إعادة التعبئة بالعبوة الفارغة (Refill)", category: "monthly", description: "خصم عند إعادة التعبئة بالعبوة الفارغة." },
  { id: "weekend_special", name: "16. عروض نهاية الأسبوع (الخميس والجمعة)", category: "weekly", description: "عرض خاص لنهاية الأسبوع." },
  { id: "payday_stock", name: "17. عروض بداية الشهر والرواتب (تموين البيت)", category: "weekly", description: "عرض تموين البيت مع بداية الشهر." },
  { id: "sample_pack", name: "18. عينة تجريبية مجانية مع المنتج الأساسي", category: "custom", description: "عينة مجانية مع المنتج الأساسي." },
  { id: "flat_price", name: "19. السعر الموحد للرف (أي قطعة بـ 20 ج)", category: "custom", description: "سعر موحد للأصناف المختارة." },
  { id: "mystery_bag", name: "20. شنطة التوفير العشوائية / المفاجآت", category: "custom", description: "شنطة مفاجآت بقيمة توفير آمنة." },
  { id: "slow_day", name: "21. منشط الأيام الهادئة (خصم خاص لأيام الركود)", category: "daily", description: "خصم خاص لأيام الركود مع حماية التكلفة." },
  { id: "vip_tier", name: "22. عرض حصري لكبار العملاء (VIP)", category: "monthly", description: "عرض حصري لعملاء VIP." },
  { id: "cross_cat", name: "23. اشترِ منظف واحصل على خصم على أدوات النظافة", category: "weekly", description: "خصم متقاطع بين فئات التنظيف." },
  { id: "seasonal", name: "24. عروض المواسم والأعياد", category: "seasonal", description: "عرض موسمي أو احتفالي." },
  { id: "scratch_win", name: "25. كارت اكشط واربح مع كل عملية شراء", category: "seasonal", description: "كارت اكشط واربح مع كل عملية شراء." }
];

const RANDOM_GIFT_POOL = [
  "كيس مسحوق غسيل 1 كيلو هدية 🎁",
  "جركن صابون سائل 4 لتر مميز 🧴",
  "باكدج منظفات منزلية شاملة 🌟",
  "هدية نقدية 100 جنيه كاش 💵",
  "تيشيرت أصلي عليه شعار أبو رغوة 👕",
  "فرخة مجمدة هدية العميل المميز 🍗",
  "عبوة معطر جو فاخر 300 مل 🌸",
  "علبة إسفنج وليفة منظفة هدية 🧽"
];

const DEFAULT_REWARDS: RewardLevel[] = [
  { points: 20, giftName: "كيس مسحوق غسيل 1 كيلو هدية 🎁", confirmed: true },
  { points: 50, giftName: "جركن صابون سائل 4 لتر مميز 🧴", confirmed: true },
  { points: 100, giftName: "باكدج منظفات منزلية شاملة 🌟", confirmed: true },
  { points: 200, giftName: "هدية كبرى خاصة (100 ج أو تيشيرت أو فرخة) ⭐", confirmed: true }
];

function buildOfferCandidates(products: Product[], recipes: Recipe[]): OfferCandidate[] {
  const validProducts: OfferCandidate[] = products
    .map(product => {
      const cost = getPieceCost(product);
      const retailSector = getPieceSalePrice(product);
      return { id: product.id, name: product.name, costPrice: cost, retailPrice: retailSector > 0 ? retailSector : Math.round(cost * 1.25), type: "product" as const, imageUrl: product.imageUrl };
    })
    .filter(item => item.retailPrice > item.costPrice);
  const validRecipes: OfferCandidate[] = recipes
    .map(recipe => {
      const cost = Number(recipe.costPerUnit) || ((Number(recipe.totalCost) || 0) / Math.max(1, Number(recipe.productionQuantity) || 1));
      return { id: recipe.id, name: recipe.name, costPrice: cost, retailPrice: Number(recipe.salePrice) || 0, type: "recipe" as const, imageUrl: recipe.imageUrl };
    })
    .filter(item => item.retailPrice > item.costPrice);
  return [...validProducts, ...validRecipes];
}

export default function SmartOffers() {
  const [location, navigate] = useLocation();
  const { isSeller } = useStaffAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [currentOffer, setCurrentOffer] = useState<SmartOffer | null>(null);
  const [bgColorDraft, setBgColorDraft] = useState("#0c0907");
  useEffect(() => { setBgColorDraft(currentOffer?.bgColor || "#0c0907"); }, [currentOffer?.id, currentOffer?.bgColor]);
  const [selectedCategory, setSelectedCategory] = useState<string>("daily");
  const [customStrategies, setCustomStrategies] = useShopFeatureState<OfferStrategy[]>("abu_raghwa_custom_strategies", []);
  const strategies = useMemo(() => [...DEFAULT_STRATEGIES, ...customStrategies.filter(strategy => strategy.id.startsWith("custom_"))], [customStrategies]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("s1");
  const [creationMode, setCreationMode] = useState<"automatic" | "manual">("automatic");
  const [manualItemKey, setManualItemKey] = useState("");
  const [manualDiscountType, setManualDiscountType] = useState<ManualDiscountType>("percent");
  const [manualDiscountValue, setManualDiscountValue] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [editablePrice, setEditablePrice] = useState<string>("");
  
  const [validityDays, setValidityDays] = useState<string>("7");
  const [offerLoyaltyPoints, setOfferLoyaltyPoints] = useState<string>("");
  const [legacySavedOffersList, setLegacySavedOffersList] = useShopFeatureState<SmartOffer[]>("abu_raghwa_saved_offers", []);
  const publishedOffersQuery = trpc.offers.list.useQuery(undefined, { staleTime: 0, refetchOnMount: "always", retry: false });
  const savedOffersList = (publishedOffersQuery.data as SmartOffer[] | null | undefined) ?? legacySavedOffersList;
  const [now, setNow] = useState(() => Date.now());
  const [bannerImageUploading, setBannerImageUploading] = useState(false);
  const [bannerImageGenerating, setBannerImageGenerating] = useState(false);
  const [showResultsReport, setShowResultsReport] = useState(false);

  const [customersList, setCustomersList] = useState<CustomerLoyalty[]>([]);
  const [showCustomers, setShowCustomers] = useState(false);
  const [cloudOfferOrders, setCloudOfferOrders] = useState<CloudOfferOrder[]>([]);
  const [rewardLevels, setRewardLevels] = useShopFeatureState<RewardLevel[]>("abu_reward_levels", DEFAULT_REWARDS);
  const [deliveryLogs, setDeliveryLogs, , flushDeliveryLogs] = useShopFeatureState<GiftDeliveryLog[]>("abu_gift_delivery_logs", []);
  const [newRewardPoints, setNewRewardPoints] = useState("");
  const [rewardPointDrafts, setRewardPointDrafts] = useState<Record<number, string>>({});
  const [newRewardGift, setNewRewardGift] = useState("");
  const [newRewardCost, setNewRewardCost] = useState("");
  const [newRewardImageUrl, setNewRewardImageUrl] = useState<string | null>(null);
  const [newRewardMystery, setNewRewardMystery] = useState(false);
  const [rewardImageUploading, setRewardImageUploading] = useState(false);
  const [referralForm, setReferralForm] = useState({ title: "شارك التوفير مع حبايبك واكسب نقاط مجانية!", messageTemplate: "ادعُ أصدقاءك للتسجيل في نظام ولاء أبو رغوة واكسب 50 نقطة عن كل صديق!", pointsPerFriend: 50, isActive: true });
  const [savingReferral, setSavingReferral] = useState(false);
  const [catalogSessionReady, setCatalogSessionReady] = useState(() => Boolean(browserState.get("abu_catalog_admin_token")));
  const catalogLogin = trpc.catalog.loginWithStaffSession.useMutation({ onSuccess: result => { try { browserState.set("abu_catalog_admin_token", result.token); } catch {} setCatalogSessionReady(true); }, onError: () => { setCustomersList([]); setCatalogSessionReady(false); } });
  const loyaltyCustomersQuery = trpc.catalog.listLoyaltyCustomers.useQuery(undefined, { enabled: catalogSessionReady, retry: false, refetchInterval: catalogSessionReady ? 10_000 : false });
  const offerPurchaseRequestsQuery = trpc.catalog.listOfferPurchaseRequests.useQuery(undefined, { enabled: catalogSessionReady, retry: false, refetchInterval: catalogSessionReady ? 10_000 : false });
  const knownOfferRequestIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const pending = (offerPurchaseRequestsQuery.data || []).filter(request => request.status === "pending");
    const ids = new Set(pending.map(request => request.id));
    if (knownOfferRequestIds.current) {
      const fresh = pending.find(request => !knownOfferRequestIds.current?.has(request.id));
      if (fresh) toast.info(`طلب شراء عرض جديد من العميل ${fresh.customerName}`, { duration: 7000 });
    }
    knownOfferRequestIds.current = ids;
  }, [offerPurchaseRequestsQuery.data]);
  const redeemLoyaltyReward = trpc.catalog.redeemLoyaltyReward.useMutation();
  const manuallyAwardReferralPoints = trpc.catalog.manuallyAwardReferralPoints.useMutation();
  const generateOfferBannerTitle = trpc.system.generateOfferBannerTitle.useMutation();
  const approveOfferPurchase = trpc.catalog.approveOfferPurchaseRequest.useMutation();
  const cancelOfferPurchase = trpc.catalog.cancelOfferPurchaseRequest.useMutation();

  const [showAddStrategyModal, setShowAddStrategyModal] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyDesc, setNewStrategyDesc] = useState("");

  const saveOfferMutation = trpc.offers.save.useMutation();
  const trpcUtils = trpc.useUtils();
  const manualCandidates = buildOfferCandidates(products, recipes);
  const [manualItemType, manualItemId] = manualItemKey.split(":");
  const selectedManualCandidate = manualCandidates.find(item => item.type === manualItemType && item.id === manualItemId);
  const manualPreview = selectedManualCandidate && manualDiscountValue.trim() !== ""
    ? calculateManualOfferPrice(selectedManualCandidate.retailPrice, selectedManualCandidate.costPrice, manualDiscountType, Number(manualDiscountValue))
    : null;
  const currentOfferExpiry = currentOffer ? getOfferExpiryInfo(currentOffer, now) : null;
  const editOfferId = new URLSearchParams(location.split("?")[1] || "").get("edit");
  const toMarketingPost = (offer: SmartOffer) => ({
    kind: "offer" as const,
    title: offer.title,
    price: Number(offer.offerPrice) || 0,
    oldPrice: Number(offer.originalTotalRetail) || 0,
    discountAmount: Number(offer.discountAmount) || 0,
    discountPercent: Number(offer.discountPercent) || 0,
    description: offer.description || `عرض لفترة محدودة حتى ${offer.endDate}.`,
    link: `${window.location.origin}/public-offer?id=${offer.id}`,
  });

  useEffect(() => {
    if (!isSeller) catalogLogin.mutate();
    // اجلب رمز لوحة الإدارة من جلسة الموظف الحالية عند فتح صفحة العروض.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller]);

  useEffect(() => {
    let active = true;
    void listCatalogDisplayData({ includeProductImages: true }).then(data => {
      if (!active) return;
      setProducts(data.registeredProducts.map(product => ({
        id: product.id, code: String(product.code || ""), name: product.name, unit: product.unit,
        unitsPerPackage: product.unitsPerPackage,
        wholesalePricePerUnit: Number(product.wholesalePricePerUnit ?? product.wholesaleRetailPrice ?? product.retailPrice ?? 0),
        wholesalePricePerPiece: Number(product.wholesalePricePerPiece ?? product.wholesaleRetailPrice ?? product.retailPrice ?? 0),
        wholesalePrice: product.wholesaleRetailPrice,
        retailPrice: product.retailPrice, wholesaleRetailPrice: product.wholesaleRetailPrice, bulkPrice: product.bulkPrice, imageUrl: product.imageUrl || undefined,
      })));
      setRecipes((data.recipes as any[]).map(recipe => ({
        id: String(recipe.id), name: String(recipe.name || ""), salePrice: Number(recipe.retail_price || 0),
        totalCost: Number(recipe.total_cost || 0), costPerUnit: recipe.cost_per_unit == null ? undefined : Number(recipe.cost_per_unit),
        productionQuantity: recipe.production_quantity == null ? undefined : Number(recipe.production_quantity), imageUrl: recipe.image_signed_url || recipe.image_url || undefined,
      })));
    }).catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات العروض من Supabase."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isSeller) return;
    let active = true;
    void listLoyaltyExperienceSettings().then(experience => {
      if (!active) return;
      const cloudLevels: RewardLevel[] = experience.milestones.map((level: LoyaltyMilestoneRow) => ({
        id: level.id, points: level.points_required, giftName: level.reward_name, rewardImageUrl: level.reward_image_url, isMystery: level.is_mystery, confirmed: true,
      }));
      if (cloudLevels.length) setRewardLevels(cloudLevels);
      if (experience.referral) setReferralForm({ title: experience.referral.title, messageTemplate: experience.referral.message_template, pointsPerFriend: experience.referral.points_per_friend, isActive: experience.referral.is_active });
    }).catch(() => { /* legacy levels remain available when cloud settings are unavailable */ });
    return () => { active = false; };
  }, [isSeller, setRewardLevels]);
  useEffect(() => {
    if (!loyaltyCustomersQuery.data) return;
    setCustomersList(loyaltyCustomersQuery.data as CustomerLoyalty[]);
  }, [loyaltyCustomersQuery.data]);
  useEffect(() => {
    if (isSeller) return;
    let active = true;
    const refresh = async () => {
      try {
        const orders = await listStoreOfferOrders();
        if (active) setCloudOfferOrders(orders);
      } catch { /* keep the existing legacy request panel available */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isSeller]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (editOfferId) {
      const requestedOffer = savedOffersList.find(offer => offer.id === editOfferId);
      if (requestedOffer && currentOffer?.id !== requestedOffer.id) {
        setCurrentOffer(requestedOffer);
        setEditablePrice(String(requestedOffer.offerPrice));
      }
      return;
    }
    if (!currentOffer && savedOffersList[0]) {
      setCurrentOffer(savedOffersList[0]);
      setEditablePrice(savedOffersList[0].offerPrice.toString());
    }
  }, [currentOffer, editOfferId, savedOffersList]);

  const handleUpdateRewardGift = (index: number, newGift: string) => {
    const updated = [...rewardLevels];
    updated[index].giftName = newGift;
    updated[index].confirmed = false;
    setRewardLevels(updated);
    toast.info("💡 تم تعديل الهدية، يرجى الضغط على زر 'تأكيد وتثبيت الهدية' لحفظها لتظهر للعملاء");
  };

  const handleUpdateRewardCost = (index: number, value: string) => {
    const updated = [...rewardLevels];
    updated[index].giftCost = value.trim() === "" ? undefined : Math.max(0, Number(value) || 0);
    updated[index].confirmed = false;
    setRewardLevels(updated);
  };

  const handleUpdateRewardPoints = (index: number, value: string) => {
    const points = Number(value);
    const result = updateLoyaltyRewardPoints(rewardLevels, index, points);
    if (result.error === "invalid") {
      toast.error("اكتب عدد نقاط صحيحًا أكبر من صفر");
      setRewardPointDrafts(current => ({ ...current, [index]: String(rewardLevels[index]?.points ?? "") }));
      return;
    }
    if (result.error === "duplicate") {
      toast.error(`يوجد مستوى آخر عند ${points} نقطة. اختر عددًا مختلفًا لتجنب تكرار مستوى الهدية.`);
      setRewardPointDrafts(current => ({ ...current, [index]: String(rewardLevels[index]?.points ?? "") }));
      return;
    }
    if (result.error) return;
    setRewardLevels(result.levels);
    setRewardPointDrafts({});
    toast.info("تم تعديل عدد النقاط. اضغط «تأكيد وتثبيت الهدية» لحفظ المستوى الجديد للعملاء.");
  };

  const handleConfirmRewardLevel = async (index: number) => {
    const level = rewardLevels[index];
    if (!level) return;
    try {
      const payload = { pointsRequired: level.points, rewardName: level.giftName, description: "", isMystery: Boolean(level.isMystery), rewardImageUrl: level.rewardImageUrl || null };
      const saved = level.id ? await updateLoyaltyMilestone(level.id, payload) : await createLoyaltyMilestone(payload);
      const updated = rewardLevels.map((item, itemIndex) => itemIndex === index ? { ...item, id: saved.id, confirmed: true, rewardImageUrl: saved.reward_image_url, isMystery: saved.is_mystery } : item);
      setRewardLevels(updated);
      toast.success(`✅ تم تأكيد وتثبيت هدية مستوى (${level.points} نقطة) وحفظها سحابياً.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ مستوى الهدية سحابياً.");
    }
  };

  const handleAddManualRewardLevel = () => {
    const points = Math.floor(Number(newRewardPoints));
    const giftName = newRewardGift.trim();
    const giftCost = newRewardCost.trim() === "" ? undefined : Math.max(0, Number(newRewardCost) || 0);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("⚠️ اكتب عدد نقاط صحيحاً أكبر من صفر، مثل 500 أو 600");
      return;
    }
    if (!giftName) {
      toast.error("⚠️ اكتب اسم الهدية لهذا المستوى");
      return;
    }

    const replacing = rewardLevels.some(level => level.points === points);
    const nextLevels = upsertLoyaltyRewardLevel(rewardLevels, points, giftName).map(level => level.points === points ? { ...level, giftCost, rewardImageUrl: newRewardImageUrl, isMystery: newRewardMystery, confirmed: false } : level);
    setRewardLevels(nextLevels);
    setNewRewardPoints("");
    setNewRewardGift("");
    setNewRewardCost("");
    setNewRewardImageUrl(null);
    setNewRewardMystery(false);
    toast.success(replacing ? `تم استبدال هدية مستوى ${points} نقطة؛ اضغط تأكيد لتثبيتها.` : `تمت إضافة مستوى ${points} نقطة؛ اضغط تأكيد لتثبيته.`);
  };

  const handleRewardImageUpload = async (file: File, index?: number) => {
    setRewardImageUploading(true);
    try {
      const url = await uploadLoyaltyMilestoneImage(file, index === undefined ? crypto.randomUUID() : `level-${index}`);
      if (index === undefined) setNewRewardImageUrl(url);
      else setRewardLevels(current => current.map((level, itemIndex) => itemIndex === index ? { ...level, rewardImageUrl: url, confirmed: false } : level));
      toast.success("تم رفع صورة الهدية. اضغط تأكيد وتثبيت لحفظ المستوى.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع صورة الهدية."); }
    finally { setRewardImageUploading(false); }
  };
  const handleSaveReferralSettings = async () => {
    setSavingReferral(true);
    try { await saveReferralCampaign(referralForm); toast.success("تم حفظ إعدادات حملة دعوة الأصدقاء سحابياً."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ إعدادات الحملة."); }
    finally { setSavingReferral(false); }
  };
  const handleGenerateBannerTitle = async () => {
    if (!currentOffer) return;
    try {
      const result = await generateOfferBannerTitle.mutateAsync({ offerTitle: currentOffer.title, strategy: currentOffer.strategyName, description: currentOffer.description });
      updateCurrentOfferField("bannerTitle", result.title);
      toast.success("تم توليد عنوان بانر جذاب ويمكنك تعديله قبل الحفظ.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر توليد عنوان البانر."); }
  };
  const handleManualReferral = async (customer: CustomerLoyalty) => {
    const friendName = window.prompt(`اكتب اسم الصديق الجديد الذي دعا إليه ${customer.name}:`, "صديق جديد");
    if (friendName === null) return;
    try {
      const result = await manuallyAwardReferralPoints.mutateAsync({ phone: customer.phone || undefined, customerCode: (customer as CustomerLoyalty & { customerCode?: string }).customerCode, friendName: friendName.trim() || "صديق جديد", points: referralForm.pointsPerFriend || 50 });
      if (result.profile) setCustomersList(current => current.map(item => item.phone === customer.phone ? result.profile as CustomerLoyalty : item));
      void loyaltyCustomersQuery.refetch();
      toast.success(`تمت إضافة ${result.pointsAwarded} نقطة إحالة إلى ${customer.name}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إضافة نقاط الإحالة."); }
  };
  const handleSpinWheelForReward = (index: number) => {
    const randomGift = RANDOM_GIFT_POOL[Math.floor(Math.random() * RANDOM_GIFT_POOL.length)];
    handleUpdateRewardGift(index, randomGift);
    toast.success(`🎡 اختارت عجلة الهدايا: "${randomGift}"`);
  };

  const handleConfirmGiftDelivery = async (customerPhone: string, rewardItem: RewardLevel, mode: "deduct" | "reset") => {
    try {
      const result = await redeemLoyaltyReward.mutateAsync({ phone: customerPhone, giftName: rewardItem.giftName, points: rewardItem.points, mode });
      const profile = result.profile;
      if (!profile) throw new Error("تعذر تحديث رصيد العميل");
      const updatedCustomers = customersList.some(customer => customer.phone === profile.phone)
        ? customersList.map(customer => customer.phone === profile.phone ? profile as CustomerLoyalty : customer)
        : [profile as CustomerLoyalty, ...customersList];
      setCustomersList(updatedCustomers);
      void loyaltyCustomersQuery.refetch();
      const newLog: GiftDeliveryLog = {
        customerCode: profile.customerCode,
        customerName: profile.name,
        customerPhone: profile.phone,
        giftName: rewardItem.giftName,
        giftCost: Number(rewardItem.giftCost || 0),
        pointsDeducted: result.pointsDeducted,
        date: new Date().toLocaleDateString("ar-EG")
      };
      const updatedLogs = [newLog, ...deliveryLogs];
      setDeliveryLogs(updatedLogs);
      if (!await flushDeliveryLogs()) toast.error("تم تحديث نقاط العميل، لكن تعذر حفظ سجل الهدية السحابي.");
      toast.success(`🎁 تم تأكيد تسليم الهدية "${rewardItem.giftName}" وتحديث الرصيد الموحد.`);
    } catch {
      toast.error("تعذر تحديث رصيد العميل. افتح إدارة الكتالوج أولًا أو حاول مرة أخرى.");
    }
  };

  const handleExportCustomersCSV = () => {
    if (customersList.length === 0) {
      toast.error("⚠️ لا توجد بيانات عملاء لتصديرها");
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,\uFEFFاسم العميل,رقم الهاتف,رصيد النقاط,عدد الكوبونات\n";
    customersList.forEach(c => {
      csvContent += `"${c.name}","${c.phone}",${c.points},${c.usedCoupons?.length || 0}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `abu_raghwa_loyalty_customers_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("📥 تم تصدير سجل العملاء بنجاح!");
  };

  const handleWhatsAppCustomer = (cust: CustomerLoyalty) => {
    const matchedReward = [...rewardLevels].filter(r => r.confirmed).reverse().find(r => cust.points >= r.points);
    const giftText = matchedReward ? `🎁 هديتك المستحقة حالياً: *${matchedReward.giftName}*` : "اجمع المزيد من النقاط واحصل على هدية مميزة قريباً!";
    const activeOfferLink = currentOffer ? `${window.location.origin}/public-offer?id=${currentOffer.id}` : window.location.origin;

    const msg = `مرحباً يا ${cust.name} 🌟\n\nنود إعلامك من *محلات أبو رغوة للمنظفات* أن رصيدك الحالي من نقاط الولاء بلغ *${cust.points} نقطة*.\n${giftText}\n\n🔗 *رابط الكوبون وأحدث العروض:*\n${activeOfferLink}\n\n📞 للاستفسار: 01069035599\n🎁 هنسيب علامة في بيتك!`;
    const phoneNum = cust.phone.startsWith("+") ? cust.phone : `+2${cust.phone}`;
    window.open(`https://api.whatsapp.com/send?phone=${phoneNum}&text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleAddCustomStrategy = () => {
    if (!newStrategyName.trim()) {
      toast.error("⚠️ يرجى إدخال اسم الاستراتيجية الجديدة");
      return;
    }
    const customObj: OfferStrategy = {
      id: `custom_${Date.now()}`,
      name: newStrategyName.trim(),
      category: "custom",
      description: newStrategyDesc.trim() || "استراتيجية مخصصة تم إضافتها بواسطة المدير"
    };

    setCustomStrategies(current => [...current, customObj]);

    setNewStrategyName("");
    setNewStrategyDesc("");
    setShowAddStrategyModal(false);
    toast.success("✅ تمت إضافة الاستراتيجية الجديدة بنجاح!");
  };

  const handleDeleteStrategy = (id: string) => {
    if (!id.startsWith("custom_")) {
      toast.error("⚠️ لا يمكن حذف الاستراتيجيات الأساسية الافتراضية");
      return;
    }
    setCustomStrategies(current => current.filter(strategy => strategy.id !== id));
    toast.success("🗑️ تم حذف الاستراتيجية بنجاح");
  };

  const generateRandomOffer = async () => {
    setIsSpinning(true);
    const allItems = buildOfferCandidates(products, recipes);

    if (allItems.length === 0) {
      toast.error("⚠️ لا توجد منتجات صالحة للعروض (يجب أن يكون السعر القطاعي أعلى من تكلفة الجملة).");
      setIsSpinning(false);
      return;
    }

    const currentStrategyObj = strategies.find(s => s.id === selectedStrategyId) || strategies[0];
    const previewWindow = createOfferExpiryWindow(Number(validityDays) || 7);

    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 40));
      const rand = allItems[Math.floor(Math.random() * allItems.length)];
      setCurrentOffer({
        id: createOfferId("offer"),
        title: `عرض ${rand.name}`,
        strategyName: currentStrategyObj.name,
        items: [{ name: rand.name, costPrice: rand.costPrice, retailPrice: rand.retailPrice, offerPrice: rand.retailPrice, type: rand.type, imageUrl: rand.imageUrl }],
        originalTotalRetail: rand.retailPrice,
        totalCostPrice: rand.costPrice,
        offerPrice: rand.retailPrice,
        discountAmount: 0,
        discountPercent: 0,
        description: currentStrategyObj.description,
        type: selectedCategory,
        ...previewWindow,
        scanCount: 0,
        isActivated: false,
        promoText: "أقوى عروض التوفير",
        bgColor: "#0c0907",
        bgGradient: OFFER_GRADIENT_PRESETS[0].value,
        backgroundMode: "gradient",
        gradientStartColor: OFFER_GRADIENT_PRESETS[0].start,
        gradientEndColor: OFFER_GRADIENT_PRESETS[0].end
      });
    }

    const generatedDraft = createOfferForStrategy(allItems, currentStrategyObj);
    if (!generatedDraft) {
      toast.error("⚠️ الاستراتيجية المختارة لا يمكن تنفيذها بأمان بالأسعار الحالية دون خسارة. أضف منتجاً أو تركيبة ذات هامش ربح أكبر.");
      setIsSpinning(false);
      return;
    }

    const discountAmount = Math.max(0, generatedDraft.originalTotalRetail - generatedDraft.offerPrice);
    const discountPercent = generatedDraft.originalTotalRetail > 0 ? Math.round((discountAmount / generatedDraft.originalTotalRetail) * 100) : 0;

    const newOfferId = createOfferId("offer");
    const daysNum = Number(validityDays) || 7;
    const offerWindow = createOfferExpiryWindow(daysNum);
    const tempOffer: SmartOffer = {
      id: newOfferId,
      title: generatedDraft.title,
      strategyName: currentStrategyObj.name,
      items: generatedDraft.items,
      originalTotalRetail: generatedDraft.originalTotalRetail,
      totalCostPrice: generatedDraft.totalCostPrice,
      offerPrice: generatedDraft.offerPrice,
      discountAmount,
      discountPercent,
      description: generatedDraft.description,
      loyaltyPoints: Math.max(0, Math.trunc(Number(offerLoyaltyPoints) || 0)),
      type: selectedCategory,
      ...offerWindow,
      scanCount: 0,
      isActivated: false,
      promoText: "أقوى عروض التوفير",
      bgColor: "#0c0907",
      bgGradient: OFFER_GRADIENT_PRESETS[0].value,
      backgroundMode: "gradient",
      gradientStartColor: OFFER_GRADIENT_PRESETS[0].start,
      gradientEndColor: OFFER_GRADIENT_PRESETS[0].end
    };

    setCurrentOffer(tempOffer);
    setEditablePrice(generatedDraft.offerPrice.toString());
    setIsSpinning(false);
    toast.success("🎯 تم توليد العرض بنجاح! راجع التفاصيل ثم اضغط 'تأكيد وتفعيل العرض' لتوليد باركود الكوبون الحقيقي.");
  };

  const createManualOffer = () => {
    const allItems = buildOfferCandidates(products, recipes);
    const [type, id] = manualItemKey.split(":");
    const selectedItem = allItems.find(item => item.type === type && item.id === id);
    if (!selectedItem) {
      toast.error("اختر منتجًا أو تركيبة صالحة من القائمة أولًا");
      return;
    }
    const result = calculateManualOfferPrice(selectedItem.retailPrice, selectedItem.costPrice, manualDiscountType, Number(manualDiscountValue));
    if (!result.valid) {
      toast.error(result.error || "تعذر إنشاء العرض اليدوي");
      return;
    }
    const days = Number(validityDays);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("اكتب عدد أيام صالحًا للعرض");
      return;
    }
    const label = manualDiscountType === "percent" ? `خصم ${result.discountPercent}%` : `خصم ${result.discountAmount} ج.م`;
    const offerWindow = createOfferExpiryWindow(days);
    const offer: SmartOffer = {
      id: createOfferId("manual_offer"),
      title: manualTitle.trim() || `عرض يدوي على ${selectedItem.name}`,
      strategyName: `عرض يدوي — ${label}`,
      items: [{ name: selectedItem.name, costPrice: selectedItem.costPrice, retailPrice: selectedItem.retailPrice, offerPrice: result.offerPrice, type: selectedItem.type, imageUrl: selectedItem.imageUrl }],
      originalTotalRetail: selectedItem.retailPrice,
      totalCostPrice: selectedItem.costPrice,
      offerPrice: result.offerPrice,
      discountAmount: result.discountAmount,
      discountPercent: result.discountPercent,
      description: manualDescription.trim() || `${label} على ${selectedItem.name} من السعر القطاعي دون النزول تحت تكلفة الجملة.`,
      loyaltyPoints: Math.max(0, Math.trunc(Number(offerLoyaltyPoints) || 0)),
      type: "manual",
      ...offerWindow,
      scanCount: 0,
      isActivated: false,
      promoText: "أقوى عروض التوفير",
      bgColor: "#0c0907",
      bgGradient: OFFER_GRADIENT_PRESETS[0].value,
      backgroundMode: "gradient",
      gradientStartColor: OFFER_GRADIENT_PRESETS[0].start,
      gradientEndColor: OFFER_GRADIENT_PRESETS[0].end,
    };
    setCurrentOffer(offer);
    setEditablePrice(result.offerPrice.toString());
    toast.success("تم إنشاء العرض اليدوي. راجعه ثم اضغط تأكيد وتفعيل العرض لإصدار QR والبون.");
  };

  // تأكيد وتفعيل العرض وحفظه عبر الخادم العام لضمان عمله من أي هاتف زبون
  const handleActivateAndPublishOffer = async () => {
    if (!currentOffer) return;
    const itemCostTotal = currentOffer.items.reduce((sum, item) => sum + Math.max(0, Number(item.costPrice) || 0), 0);
    if (Number(currentOffer.offerPrice) < itemCostTotal || Number(currentOffer.offerPrice) < Number(currentOffer.totalCostPrice)) {
      toast.error("سعر العرض لا يمكن أن يقل عن سعر الجملة/التكلفة لضمان عدم الخسارة");
      return;
    }

    const activatedOffer: SmartOffer = {
      ...currentOffer,
      isActivated: true
    };

    // توليد QR قبل الحفظ حتى يحمل السجل السحابي الصورة النهائية نفسها.
    const shortUrl = `${window.location.origin}/public-offer?id=${activatedOffer.id}`;
    const qrDataUrl = await QRCode.toDataURL(shortUrl, { width: 350, margin: 4, errorCorrectionLevel: "M" });
    const finalOffer: SmartOffer = { ...activatedOffer, qrCodeDataUrl: qrDataUrl };
    // المسار القديم محفوظ عمداً للتوافق، والجدول السحابي الجديد هو النسخة الإضافية الدائمة.
    try {
      const savedCloudOffer = await saveStoreOffer({ id: finalOffer.id, title: finalOffer.title, bannerTitle: finalOffer.bannerTitle, promoText: finalOffer.promoText, imageUrl: finalOffer.bannerImageUrl || null, bgColor: finalOffer.bgColor, bgGradient: finalOffer.bgGradient, bannerCustomImage: finalOffer.bannerCustomImage || null, description: finalOffer.description, strategy: finalOffer.strategyName, originalPrice: finalOffer.originalTotalRetail, offerPrice: finalOffer.offerPrice, startDate: finalOffer.startDate, pointsReward: finalOffer.loyaltyPoints, offerData: finalOffer as unknown as Record<string, unknown>, startAt: finalOffer.startAt, endAt: finalOffer.endAt, status: "active" });
      if (!savedCloudOffer?.id || savedCloudOffer.store_id !== savedCloudOffer.shop_id) throw new Error("لم يؤكد الخادم هوية المتجر أو معرف العرض المحفوظ.");
      try {
        await saveOfferMutation.mutateAsync({ id: finalOffer.id, offerData: JSON.stringify(finalOffer) });
      } catch (legacyError) {
        console.warn("Legacy offer mirror failed after direct Supabase save", legacyError);
      }
    } catch (e) {
      console.error("Failed to save offer to cloud", e);
      const reason = e instanceof Error ? e.message : "خطأ غير معروف";
      toast.error(`تعذر إتمام حفظ العرض في السحابة: ${reason}`);
      return;
    }
    const existingGlobalOffers = JSON.parse(browserState.get("abu_raghwa_global_offers") || "{}");
    existingGlobalOffers[finalOffer.id] = finalOffer;
    browserState.set("abu_raghwa_global_offers", JSON.stringify(existingGlobalOffers));
    setLegacySavedOffersList(previous => [finalOffer, ...previous.filter(o => o.id !== finalOffer.id)]);
    await trpcUtils.offers.list.invalidate();

    setCurrentOffer(finalOffer);
    toast.success("تم تفعيل وحفظ العرض في السحابة بنجاح ✅");
  };

  const handlePriceChange = (val: string) => {
    setEditablePrice(val);
    const num = Number(val);
    if (!isNaN(num) && currentOffer) {
      if (num < currentOffer.totalCostPrice) {
        toast.error("⚠️ لا يمكن حفظ سعر أقل من تكلفة الجملة حتى لا يحدث خسارة للمحل.");
        setEditablePrice(currentOffer.offerPrice.toString());
        return;
      }
      if (num >= currentOffer.originalTotalRetail) {
        toast.error("⚠️ تنبيه: سعر العرض يجب أن يكون أقل من السعر القطاعي!");
      }
      const updated = {
        ...currentOffer,
        offerPrice: num,
        discountAmount: Math.max(0, currentOffer.originalTotalRetail - num),
        discountPercent: Math.max(0, Math.round(((currentOffer.originalTotalRetail - num) / currentOffer.originalTotalRetail) * 100))
      };
      setCurrentOffer(updated);
    }
  };
  const updateCurrentOfferField = (field: "title" | "bannerTitle" | "promoText" | "bgColor" | "bgGradient" | "backgroundMode" | "gradientStartColor" | "gradientEndColor" | "description" | "startDate" | "endDate", value: string) => {
    setCurrentOffer(previous => {
      if (!previous) return previous;
      const parsedDate = field === "startDate" || field === "endDate" ? parseLegacyOfferDate(value) : null;
      return { ...previous, [field]: value, ...(parsedDate ? field === "startDate" ? { startAt: parsedDate } : { endAt: parsedDate } : {}) };
    });
  };
  const handleBannerImageUpload = async (file?: File) => {
    if (!file || !currentOffer || !file.type.startsWith("image/")) return;
    setBannerImageUploading(true);
    try {
      const uploaded = await uploadCatalogOfferImage(currentOffer.id, file);
      const previousPath = currentOffer.bannerImageStoragePath;
      setCurrentOffer(previous => previous ? { ...previous, bannerImageUrl: uploaded.publicUrl, bannerImageStoragePath: uploaded.storagePath } : previous);
      if (previousPath) void removeCatalogOfferImage(previousPath).catch(() => undefined);
      toast.success("تم رفع صورة العرض وحفظ رابطها في Storage.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع صورة العرض.");
    } finally {
      setBannerImageUploading(false);
    }
  };
  const handleGenerateOfferBanner = async () => {
    if (!currentOffer) return;
    setBannerImageGenerating(true);
    try {
      const persisted = currentOffer.isActivated || savedOffersList.some(offer => offer.id === currentOffer.id);
      const generated = await generateCatalogOfferBanner(currentOffer.id, { persistToOffer: persisted });
      setCurrentOffer(previous => previous ? { ...previous, bannerCustomImage: generated.publicUrl, bannerCustomImageStoragePath: generated.storagePath } : previous);
      toast.success(generated.savedToExistingOffer ? "تم توليد خلفية البانر وحفظها للعرض." : "تم توليد الخلفية؛ ستُحفظ مع العرض عند تأكيده.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد البانر. أعد المحاولة.");
    } finally {
      setBannerImageGenerating(false);
    }
  };
  const clearBannerImage = async () => {
    if (!currentOffer) return;
    const paths = [currentOffer.bannerImageStoragePath, currentOffer.bannerCustomImageStoragePath].filter((path): path is string => Boolean(path));
    setCurrentOffer(previous => previous ? { ...previous, bannerImageUrl: undefined, bannerImageStoragePath: undefined, bannerCustomImage: undefined, bannerCustomImageStoragePath: undefined } : previous);
    await Promise.all(paths.map(path => removeCatalogOfferImage(path).catch(() => undefined)));
  };
  const updateCurrentOfferItemPrice = (index: number, value: string) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    setCurrentOffer(previous => {
      if (!previous) return previous;
      const items = previous.items.map((item, itemIndex) => itemIndex === index ? { ...item, offerPrice: price } : item);
      return { ...previous, items };
    });
  };

  const getShareText = () => {
    if (!currentOffer) return "";
    const shortUrl = `${window.location.origin}/public-offer?id=${currentOffer.id}`;
    return `🎁 *عرض حصري من محلات أبو رغوة للمنظفات* 🎁\n\n✨ *${currentOffer.title}*\n📌 نوع العرض: ${currentOffer.strategyName}\n📝 ${currentOffer.description}\n\n💰 السعر القطاعي قبل العرض: ${currentOffer.originalTotalRetail} ج.م\n🔥 *سعر العرض الآن: ${currentOffer.offerPrice} ج.م*\n📉 التوفير: ${currentOffer.discountAmount} ج.م (${currentOffer.discountPercent}% خصم)\n⏳ العرض ساري حتى: ${currentOffer.endDate}\n\n🔗 *افتح الكوبون واكتسب نقاط ولاء من هنا:*\n${shortUrl}\n\n🎁 هنسيب علامة في بيتك!\n📞 للتواصل: 01069035599`;
  };

  const handleShareWhatsApp = () => {
    if (!currentOffer) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(getShareText())}`, "_blank");
  };

  const handleShareFacebook = () => {
    if (!currentOffer) return;
    const shortUrl = `${window.location.origin}/public-offer?id=${currentOffer.id}`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shortUrl)}&quote=${encodeURIComponent(getShareText())}`;
    window.open(facebookUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadSingleQR = () => {
    if (!currentOffer?.qrCodeDataUrl) {
      toast.error("⚠️ الباركود غير جاهز للتحميل بعد");
      return;
    }
    try {
      const a = document.createElement("a");
      a.href = currentOffer.qrCodeDataUrl;
      a.download = `abu_raghwa_qr_${currentOffer.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("📥 جاري تنزيل صورة الباركود على هاتفك...");
    } catch (e) {
      toast.error("⚠️ تعذر التنزيل التلقائي، يرجى استخدام زر فتح الصورة أدناه");
    }
  };

  const handleOpenQRWindow = () => {
    if (!currentOffer?.qrCodeDataUrl) return;
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`
        <html dir="rtl">
          <head><title>صورة باركود العرض - محلات أبو رغوة</title></head>
          <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9fafb; font-family:Tahoma;">
            <div style="background:white; padding:20px; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.1); text-align:center;">
              <h3 style="color:#ea580c; margin-bottom:10px;">باركود عرض: ${currentOffer.title}</h3>
              <img src="${currentOffer.qrCodeDataUrl}" alt="QR Code" style="width:280px; height:280px; border:2px solid #fed7aa; border-radius:12px; padding:10px;" />
              <p style="color:#4b5563; font-size:14px; margin-top:15px; font-weight:bold;">💡 اضغط مطولاً على الصورة واختر <span style="color:#ea580c;">"تنزيل الصورة"</span> أو <span style="color:#ea580c;">"حفظ الصورة"</span></p>
            </div>
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  const dataURItoBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  if (isSeller) {
    const activeOffers = savedOffersList.filter(offer => getOfferExpiryInfo(offer, now).status === "active");
    return (
      <div className="min-h-screen bg-orange-50 p-4 pb-20" dir="rtl">
        <main className="mx-auto max-w-5xl space-y-5">
          <header className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h1 className="text-2xl font-black text-slate-900">العروض المتاحة للبيع</h1><p className="mt-1 text-sm text-slate-600">شاهد سعر العرض والخصم ومدته لتخدم العميل.</p></div>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>الرئيسية</Button>
            </div>
          </header>
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg"><ShoppingCart className="h-5 w-5 text-orange-600" />طلبات شراء العروض</CardTitle>
              <span className="rounded-full bg-orange-600 px-3 py-1 text-xs font-black text-white">{offerPurchaseRequestsQuery.data?.filter(request => request.status === "pending").length || 0} معلّق</span>
            </CardHeader>
            <CardContent>
              {offerPurchaseRequestsQuery.isLoading ? <p className="py-6 text-center text-sm text-slate-500">جارٍ تحميل الطلبات...</p> : offerPurchaseRequestsQuery.isError ? <p className="py-6 text-center text-sm text-red-600">تعذر تحميل طلبات الشراء.</p> : !offerPurchaseRequestsQuery.data?.length ? <p className="py-6 text-center text-sm text-slate-500">لا توجد طلبات شراء عروض حاليًا.</p> : <div className="space-y-3">
                {offerPurchaseRequestsQuery.data.map(request => (
                  <article key={request.id} className={`rounded-xl border p-3 ${request.status === "pending" ? "border-orange-200 bg-orange-50/70" : "border-gray-200 bg-white"}`}>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="space-y-1"><p className="font-black text-gray-900">{request.offerTitle}</p><p className="text-sm text-gray-700">العميل: <strong>{request.customerName}</strong> · الكود: <strong dir="ltr" className="inline-block">{request.customerCode}</strong></p><p className="text-xs text-gray-600">النقاط: {request.offerPoints} · {new Date(request.createdAt).toLocaleString("ar-EG")}</p></div>
                      {request.status === "pending" ? <div className="flex shrink-0 gap-2"><Button disabled={approveOfferPurchase.isLoading} onClick={async () => { if (!window.confirm(`هل تؤكد بيع «${request.offerTitle}» للعميل ${request.customerName}؟`)) return; try { const result = await approveOfferPurchase.mutateAsync({ id: request.id }); await offerPurchaseRequestsQuery.refetch(); toast.success(result.awardedPoints > 0 ? `تم تأكيد البيع وإضافة ${result.awardedPoints} نقطة.` : "تم تأكيد البيع."); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تأكيد الطلب"); } }} className="bg-green-600 text-xs font-black text-white hover:bg-green-700"><Check className="ml-1 h-4 w-4" />موافقة وبيع</Button><Button variant="outline" disabled={cancelOfferPurchase.isLoading} onClick={async () => { if (!window.confirm("هل تريد رفض هذا الطلب؟")) return; try { await cancelOfferPurchase.mutateAsync({ id: request.id }); await offerPurchaseRequestsQuery.refetch(); toast.success("تم رفض الطلب دون إضافة نقاط."); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفض الطلب"); } }} className="text-xs font-bold text-gray-700"><XCircle className="ml-1 h-4 w-4" />رفض</Button></div> : <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${request.status === "approved" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{request.status === "approved" ? "موافق عليه" : "ملغي"}</span>}
                    </div>
                  </article>
                ))}
              </div>}
            </CardContent>
          </Card>
          {activeOffers.length === 0 ? (
            <Card className="border-0 shadow-sm"><CardContent className="py-16 text-center text-slate-500">لا توجد عروض متاحة حاليًا.</CardContent></Card>
          ) : (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activeOffers.map((offer) => {
                const expiry = getOfferExpiryInfo(offer, now);
                return <Card key={offer.id} className="overflow-hidden border-0 shadow-sm"><CardHeader className="bg-orange-600 text-white"><CardTitle>{offer.title}</CardTitle><CardDescription className="text-orange-100">{formatOfferTimeRemaining(expiry)}</CardDescription></CardHeader><CardContent className="space-y-3 p-5"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-slate-500">سعر العرض</p><p className="mt-1 text-xl font-black text-orange-700">{offer.offerPrice} ج.م</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-slate-500">التوفير للعميل</p><p className="mt-1 text-xl font-black text-emerald-700">{offer.discountAmount} ج.م</p><p className="text-xs font-bold text-emerald-600">خصم {offer.discountPercent}%</p></div></div><div className="rounded-xl bg-slate-50 p-3"><p className="mb-1 text-xs font-bold text-slate-500">الأصناف المشمولة</p>{offer.items.map((item, index) => <p key={`${offer.id}-${index}`} className="text-sm text-slate-800">• {item.name} — {item.offerPrice} ج.م</p>)}</div></CardContent></Card>;
              })}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm mb-6 rounded-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-orange-600" />
              إدارة العروض ونقاط ولاء العملاء
            </h1>
            <p className="text-gray-600 text-sm mt-0.5">أنشئ عروضًا متعددة؛ تبقى العروض السابقة محفوظة حتى تحذف كل عرض يدويًا من قائمة العروض.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => {
                setShowResultsReport(!showResultsReport);
                setShowCustomers(false);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
            >
              <AwardIcon className="w-4 h-4" /> {showResultsReport ? "إخفاء التقرير" : "تقرير نتائج العروض (فزت أم خسرت) 🏆"}
            </Button>
            <Button
              onClick={() => {
                setShowCustomers(!showCustomers);
                setShowResultsReport(false);
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" /> {showCustomers ? "إخفاء العملاء" : "نقاط ولاء العملاء ⭐"}
            </Button>
            <Button
              onClick={() => navigate("/smart-offers-list")}
              className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5"
            >
              <History className="w-4 h-4" /> قائمة العروض المتاحة والمنتهية
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              الرئيسية
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        <Card className="overflow-hidden border-2 border-orange-200 shadow-md">
          <CardHeader className="bg-orange-50 pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-orange-950">
              <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-orange-600" /> طلبات شراء العروض</span>
              <span className="rounded-full bg-orange-600 px-3 py-1 text-xs font-black text-white">{offerPurchaseRequestsQuery.data?.filter(request => request.status === "pending").length || 0} طلب بانتظار الموافقة</span>
            </CardTitle>
            <CardDescription>يظهر هنا طلب العميل عند ضغط «شراء العرض». لا تُضاف النقاط إلا بعد تأكيدك أن البيع اكتمل. اعتماد الطلب يضيف نقاط العرض فقط؛ سجل الفاتورة من الكاشير كالمعتاد حتى تُحفظ المبيعات والمخزون.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {offerPurchaseRequestsQuery.isLoading ? (
              <p className="py-5 text-center text-sm text-gray-500">جارٍ تحميل طلبات العملاء…</p>
            ) : offerPurchaseRequestsQuery.isError ? (
              <p className="py-5 text-center text-sm font-bold text-red-700">تعذر تحميل الطلبات. تحقق من صلاحية المدير ثم حدّث الصفحة.</p>
            ) : !offerPurchaseRequestsQuery.data?.length ? (
              <p className="py-5 text-center text-sm text-gray-500">لا توجد طلبات شراء عروض حتى الآن.</p>
            ) : (
              <div className="max-h-[34rem] space-y-2 overflow-y-auto">
                {offerPurchaseRequestsQuery.data.map(request => {
                  let price = 0;
                  let itemNames = "";
                  try {
                    const snapshot = JSON.parse(request.offerSnapshot);
                    price = Number(snapshot.offerPrice) || 0;
                    itemNames = Array.isArray(snapshot.items) ? snapshot.items.map((item: { name?: string }) => item.name).filter(Boolean).join("، ") : "";
                  } catch {}
                  return (
                    <article key={request.id} className={`rounded-xl border p-3 ${request.status === "pending" ? "border-orange-200 bg-orange-50/70" : "border-gray-200 bg-white"}`}>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="space-y-1">
                          <p className="font-black text-gray-900">{request.offerTitle}</p>
                          <p className="text-sm text-gray-700">العميل: <strong>{request.customerName}</strong> · كود الولاء: <strong dir="ltr" className="inline-block">{request.customerCode}</strong></p>
                          {request.customerPhone && <p className="text-xs text-gray-600">الهاتف: {request.customerPhone}</p>}
                          {request.customerNote && <p className="text-xs font-bold text-blue-700">ملاحظات العميل: {request.customerNote}</p>}
                          {itemNames && <p className="text-xs text-gray-600">الأصناف: {itemNames}</p>}
                          <p className="text-xs text-gray-600">سعر العرض: {price} ج.م · نقاط العرض: {request.offerPoints} · وصل الطلب: {new Date(request.createdAt).toLocaleString("ar-EG")}</p>
                          {request.status === "approved" && <p className="text-xs font-bold text-green-700">تمت الموافقة وإضافة {request.loyaltyPointsAwarded} نقطة إلى البطاقة.</p>}
                          {request.status === "cancelled" && <p className="text-xs font-bold text-gray-500">تم رفض/إلغاء الطلب؛ لم تُضف نقاط.</p>}
                        </div>
                        {request.status === "pending" ? (
                          <div className="flex shrink-0 gap-2">
                            <Button disabled={approveOfferPurchase.isLoading} onClick={async () => {
                              if (!window.confirm(`هل تؤكد اكتمال شراء «${request.offerTitle}» بواسطة ${request.customerName}؟ ستضاف ${request.offerPoints} نقطة إلى الكود ${request.customerCode}.`)) return;
                              try {
                                const result = await approveOfferPurchase.mutateAsync({ id: request.id });
                                try { await updateStoreOfferOrderStatus(request.id, "approved"); } catch { toast.warning("تم اعتماد الطلب، لكن تعذر تحديث نسخته السحابية."); }
                                await offerPurchaseRequestsQuery.refetch();
                                setCloudOfferOrders(previous => previous.map(order => order.id === request.id ? { ...order, status: "approved" } : order));
                                toast.success(result.awardedPoints > 0 ? `تم تأكيد البيع وإضافة ${result.awardedPoints} نقطة إلى ${request.customerCode}.` : "تم تأكيد البيع؛ هذا العرض لا يمنح نقاطًا إضافية.");
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "تعذر تأكيد طلب العرض");
                              }
                            }} className="bg-green-600 text-xs font-black text-white hover:bg-green-700">
                              <Check className="ml-1 h-4 w-4" /> موافقة وإضافة النقاط
                            </Button>
                            <Button variant="outline" disabled={cancelOfferPurchase.isLoading} onClick={async () => {
                              if (!window.confirm(`هل تريد رفض طلب ${request.customerName}؟ لن تُضاف نقاط.`)) return;
                              try {
                                await cancelOfferPurchase.mutateAsync({ id: request.id });
                                try { await updateStoreOfferOrderStatus(request.id, "cancelled"); } catch { toast.warning("تم إلغاء الطلب، لكن تعذر تحديث نسخته السحابية."); }
                                await offerPurchaseRequestsQuery.refetch();
                                setCloudOfferOrders(previous => previous.map(order => order.id === request.id ? { ...order, status: "cancelled" } : order));
                                toast.success("تم إلغاء الطلب دون إضافة نقاط.");
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "تعذر إلغاء الطلب");
                              }
                            }} className="text-xs font-bold text-gray-700">
                              <XCircle className="ml-1 h-4 w-4" /> رفض
                            </Button>
                          </div>
                        ) : (
                          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${request.status === "approved" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                            {request.status === "approved" ? "موافق عليه" : "ملغي"}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        {cloudOfferOrders.length > 0 && (
          <Card className="border-2 border-blue-200 shadow-md">
            <CardHeader className="bg-blue-50 pb-3"><CardTitle className="flex items-center justify-between gap-2 text-base text-blue-950"><span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-blue-600" /> نسخة الطلبات السحابية</span><span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">{cloudOfferOrders.filter(order => order.status === "pending").length} معلّق</span></CardTitle></CardHeader>
            <CardContent className="space-y-2 p-4">
              {cloudOfferOrders.map(order => <article key={order.id} className={`rounded-xl border p-3 ${order.status === "pending" ? "border-blue-200 bg-blue-50/60" : "border-gray-200 bg-white"}`}><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="font-black text-gray-900">{order.offer_title}</p><p className="text-sm text-gray-700">{order.customer_name} · كود <strong dir="ltr">{order.customer_code}</strong></p><p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("ar-EG")} · {order.points_cost} نقطة</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${order.status === "approved" ? "bg-green-100 text-green-800" : order.status === "cancelled" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-800"}`}>{order.status === "approved" ? "موافق عليه" : order.status === "cancelled" ? "ملغي" : "بانتظار الموافقة"}</span></div></article>)}
            </CardContent>
          </Card>
        )}

        {/* 🏆 تقرير نتائج العروض */}
        {showResultsReport && (
          <div className="bg-white p-6 rounded-2xl shadow-lg space-y-6">
            <div className="pb-4 border-b">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <AwardIcon className="w-6 h-6 text-blue-600" /> تقرير نتائج العروض (هل العرض كسب أم خسر؟) 📊
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                ملخص أداء كل عرض تم توليده، مع مقارنة سعر العرض بتكلفة الجملة والسعر القطاعي، وحساب هامش الربح والنتيجة النهائية.
              </p>
            </div>

            {savedOffersList.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">لا توجد عروض مسجلة في الأرشيف لحساب النتائج حتى الآن.</p>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto p-1">
                {savedOffersList.map((off, idx) => {
                  const profitPerPiece = off.offerPrice - off.totalCostPrice;
                  const profitMarginPercent = off.totalCostPrice > 0 ? Math.round((profitPerPiece / off.totalCostPrice) * 100) : 0;
                  const isWinning = profitPerPiece > 0;
                  const isEven = profitPerPiece === 0;

                  return (
                    <div
                      key={idx}
                      className={`p-5 rounded-2xl border-2 space-y-3 shadow-sm ${
                        isWinning ? "bg-green-50/70 border-green-300" : isEven ? "bg-amber-50/70 border-amber-300" : "bg-red-50/70 border-red-300"
                      }`}
                    >
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <span className="text-xs font-bold text-gray-500 block">{off.strategyName}</span>
                          <h4 className="font-extrabold text-base text-gray-900">{off.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {isWinning ? (
                            <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-xl font-black flex items-center gap-1 shadow">
                              <TrendingUp className="w-4 h-4" /> فزت (ربح آمن ✅)
                            </span>
                          ) : isEven ? (
                            <span className="bg-amber-600 text-white text-xs px-3 py-1 rounded-xl font-black flex items-center gap-1 shadow">
                              تعادل (على التكلفة ⚖️)
                            </span>
                          ) : (
                            <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-xl font-black flex items-center gap-1 shadow">
                              <TrendingDown className="w-4 h-4" /> خسارة (تنبيه ⚠️)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-xl border text-center">
                        <div>
                          <span className="text-[11px] text-gray-400 block">تكلفة الجملة</span>
                          <span className="text-sm font-bold text-gray-700">{off.totalCostPrice} ج.م</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 block">السعر القطاعي</span>
                          <span className="text-sm font-bold text-blue-600 line-through">{off.originalTotalRetail} ج.م</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 block">سعر العرض</span>
                          <span className="text-sm font-black text-gray-900">{off.offerPrice} ج.م</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 block">صافي الربح</span>
                          <span className={`text-sm font-black ${profitPerPiece >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {profitPerPiece >= 0 ? `+${profitPerPiece}` : profitPerPiece} ج.م ({profitMarginPercent}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-gray-600 pt-1 border-t border-gray-200">
                        <span>📅 ساري حتى: {off.endDate}</span>
                        <span>🔍 مرات مسح الكوبون: <strong className="text-purple-700">{off.scanCount || 0} مرة</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* قسم نقاط ولاء العملاء وتأكيد الهدايا */}
        {showCustomers && (
          <div className="bg-white p-6 rounded-2xl shadow-lg space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pb-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-600" /> إدارة وتأكيد وتثبيت هدايا الولاء للعملاء
                </h3>
                <p className="text-xs text-gray-500">اختر الهدية أو ولدها بالعجلة 🎡 ثم اضغط "تأكيد وتثبيت الهدية" لكي تظهر للعميل عند مسح الكوبون</p>
              </div>
              <Button
                onClick={handleExportCustomersCSV}
                className="bg-green-600 hover:bg-green-700 text-white text-xs flex items-center gap-1.5 font-bold"
              >
                <FileSpreadsheet className="w-4 h-4" /> تصدير سجل العملاء (CSV)
              </Button>
            </div>

            {/* إعداد وتثبيت الهدايا حسب النقاط */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-2xl border border-purple-200 space-y-3">
              <h4 className="font-extrabold text-sm text-purple-900 flex items-center gap-1.5">
                🎁 جدول مستويات الهدايا والجوائز (يجب الضغط على تأكيد وتثبيت لكل هدية):
              </h4>
              <div className="bg-white/90 border border-purple-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-[150px_1fr_150px_220px_auto] gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">عدد النقاط</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={newRewardPoints}
                    onChange={(event) => setNewRewardPoints(event.target.value)}
                    placeholder="مثال: 500"
                    className="font-bold text-purple-800 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">الهدية عند الوصول لهذا المستوى</label>
                  <Input
                    value={newRewardGift}
                    onChange={(event) => setNewRewardGift(event.target.value)}
                    placeholder="مثال: حذاء أو أي هدية تختارها"
                    className="font-bold text-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">تكلفة الهدية (اختياري)</label>
                  <Input type="number" min="0" value={newRewardCost} onChange={(event) => setNewRewardCost(event.target.value)} placeholder="0 ج.م" className="font-bold text-gray-900 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-purple-900">صورة الهدية وخيار المفاجأة</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-purple-300 bg-white px-2 py-2 text-[11px] font-bold text-purple-800">📷 التقاط/اختيار صورة الهدية<input type="file" accept="image/*" className="hidden" disabled={rewardImageUploading} onChange={event => { const file = event.target.files?.[0]; if (file) void handleRewardImageUpload(file); }} /></label>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-purple-900"><input type="checkbox" checked={newRewardMystery} onChange={event => setNewRewardMystery(event.target.checked)} /> 🎁 غامضة</label>
                    {newRewardImageUrl && <img src={newRewardImageUrl} alt="معاينة الهدية" className="h-9 w-9 rounded object-cover ring-1 ring-purple-200" />}
                  </div>
                </div>
                <Button
                  onClick={handleAddManualRewardLevel}
                  className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-black h-10 px-4 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> إضافة مستوى
                </Button>
                <p className="md:col-span-3 text-[11px] text-purple-700 font-medium">يمكنك إضافة أي عدد نقاط: 500، 600 أو أكثر. إذا استخدمت نفس عدد النقاط مرة أخرى فسيتم تحديث هديته.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rewardLevels.map((lvl, index) => (
                  <div key={index} className={`bg-white p-4 rounded-xl border-2 shadow-sm space-y-2.5 ${lvl.confirmed ? "border-green-300 bg-green-50/30" : "border-orange-300 bg-orange-50/30"}`}>
                    <div className="flex justify-between items-end gap-3">
                      <div className="w-36">
                        <label className="block text-[11px] font-bold text-purple-900 mb-1">عدد النقاط لهذا المستوى</label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={rewardPointDrafts[index] ?? String(lvl.points)}
                          onChange={event => setRewardPointDrafts(current => ({ ...current, [index]: event.target.value }))}
                          onBlur={event => {
                            const draft = rewardPointDrafts[index];
                            if (draft !== undefined && draft !== String(lvl.points)) handleUpdateRewardPoints(index, event.currentTarget.value);
                            else if (draft !== undefined) setRewardPointDrafts(current => { const next = { ...current }; delete next[index]; return next; });
                          }}
                          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                          aria-label={`عدد النقاط لمستوى ${lvl.giftName}`}
                          className="h-9 bg-white font-bold text-purple-800"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleSpinWheelForReward(index)}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] h-7 px-2 font-bold flex items-center gap-1"
                        >
                          <RotateCw className="w-3 h-3" /> عجلة 🎡
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">تكلفة الهدية بالجنيه (اختياري):</label>
                      <Input type="number" min="0" value={lvl.giftCost ?? ""} onChange={(e) => handleUpdateRewardCost(index, e.target.value)} placeholder="0" className="text-xs font-bold text-gray-900 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">وصف الهدية (كتابة يدوية أو بالعجلة):</label>
                      <Input
                        value={lvl.giftName}
                        onChange={(e) => handleUpdateRewardGift(index, e.target.value)}
                        placeholder="اكتب الهدية هنا (مثل: 100 جنيه، تيشيرت، فرخة...)"
                        className="text-xs font-bold text-gray-900 bg-white"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-purple-100 pt-2">
                      <label className="cursor-pointer rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-[11px] font-bold text-purple-800">📷 التقاط/اختيار صورة الهدية<input type="file" accept="image/*" className="hidden" disabled={rewardImageUploading} onChange={event => { const file = event.target.files?.[0]; if (file) void handleRewardImageUpload(file, index); }} /></label>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-purple-900"><input type="checkbox" checked={Boolean(lvl.isMystery)} onChange={event => { const updated = [...rewardLevels]; updated[index] = { ...updated[index], isMystery: event.target.checked, confirmed: false }; setRewardLevels(updated); }} /> 🎁 هدية غامضة / مفاجأة سرية</label>
                      {lvl.rewardImageUrl && <img src={lvl.rewardImageUrl} alt="معاينة الهدية" className="h-12 w-12 rounded-lg object-cover ring-1 ring-purple-200" />}
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      {lvl.confirmed ? (
                        <span className="text-xs font-bold text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-green-600" /> مثبتة وتظهر للعملاء ✅
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-orange-600 flex items-center gap-1 animate-pulse">
                          ⚠️ غير مؤكدة (عدّل واضغط تأكيد)
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleConfirmRewardLevel(index)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs font-black h-8 px-3 shadow"
                      >
                        تأكيد وتثبيت الهدية 🔒
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <h4 className="font-extrabold text-sm text-emerald-950">📢 إعدادات حملة دعوة الأصدقاء وسفراء الولاء (Referral Settings)</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_auto] items-end">
                <div><label className="block text-[11px] font-bold text-emerald-900 mb-1">عدد النقاط عن كل صديق جديد</label><Input type="number" min="0" value={referralForm.pointsPerFriend} onChange={event => setReferralForm(current => ({ ...current, pointsPerFriend: Math.max(0, Number(event.target.value) || 0) }))} className="bg-white font-bold" /></div>
                <div><label className="block text-[11px] font-bold text-emerald-900 mb-1">نص رسالة المشاركة عبر واتساب والترويج</label><Input value={referralForm.messageTemplate} onChange={event => setReferralForm(current => ({ ...current, messageTemplate: event.target.value }))} className="bg-white" /></div>
                <Button type="button" disabled={savingReferral} onClick={() => void handleSaveReferralSettings()} className="bg-emerald-600 font-black text-white hover:bg-emerald-700">💾 حفظ إعدادات الحملة سحابياً</Button>
              </div>
              <div className="flex items-center gap-3"><Input value={referralForm.title} onChange={event => setReferralForm(current => ({ ...current, title: event.target.value }))} placeholder="عنوان الحملة" className="max-w-xl bg-white" /><label className="flex items-center gap-2 text-xs font-bold text-emerald-900"><input type="checkbox" checked={referralForm.isActive} onChange={event => setReferralForm(current => ({ ...current, isActive: event.target.checked }))} /> الحملة مفعلة</label></div>
            </div>

            {/* قائمة العملاء مع زر تأكيد التسليم ومراسلة واتساب */}
            <div className="pt-2">
              <h4 className="font-extrabold text-sm text-gray-800 mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" /> سجل العملاء المستحقين ({customersList.length} عميل)
              </h4>
              {customersList.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">لم يتم تسجيل أي عميل عبر الكوبونات حتى الآن.</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto p-1">
                  {customersList.map((cust, idx) => {
                    const matchedReward = [...rewardLevels].filter(r => r.confirmed).reverse().find(r => cust.points >= r.points);
                    return (
                      <div key={idx} className="p-4 rounded-xl border bg-purple-50/70 border-purple-200 flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="space-y-1">
                          <p className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                            👤 {cust.name} <span className="text-xs text-gray-500 font-normal">({cust.phone})</span>
                            {matchedReward && (
                              <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                                <Gift className="w-3 h-3" /> يستحق: {matchedReward.giftName} 🎉
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-600">الكوبونات المستفاد بها: <strong className="text-purple-700">{cust.usedCoupons?.length || 1} كوبون</strong></p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-left bg-white px-3 py-1 rounded-xl border shadow-sm">
                            <span className="text-[10px] text-gray-400 block">رصيد النقاط</span>
                            <span className="text-sm font-black text-purple-700 flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" /> {cust.points} نقطة
                            </span>
                          </div>

                          {matchedReward && (
                            <Button
                              onClick={() => {
                                const choice = window.confirm(`هل تريد خصم نقاط الهدية (${matchedReward.points} نقطة) فقط من رصيد ${cust.name}؟\n(اضغط OK لخصم النقاط، أو Cancel لتصفير الرصيد بالكامل)`);
                                handleConfirmGiftDelivery(cust.phone, matchedReward, choice ? "deduct" : "reset");
                              }}
                              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-1.5 shadow"
                            >
                              <Check className="w-4 h-4" /> تأكيد تسليم الهدية 🎁
                            </Button>
                          )}

                          <Button
                            onClick={() => handleWhatsAppCustomer(cust)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-1.5 shadow"
                          >
                            <MessageCircle className="w-4 h-4" /> واتساب 📱
                          </Button>
                          <Button onClick={() => void handleManualReferral(cust)} disabled={manuallyAwardReferralPoints.isLoading} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold py-2 px-3 rounded-xl">🎁 إضافة {referralForm.pointsPerFriend || 50} نقطة إحالة</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* أرشيف تسليم الهدايا */}
            {deliveryLogs.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-extrabold text-sm text-gray-800 mb-3 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-orange-600" /> أرشيف الهدايا التي تم تسليمها للعملاء ({deliveryLogs.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto p-1">
                  {deliveryLogs.map((log, lIdx) => (
                    <div key={lIdx} className="bg-orange-50/50 p-3 rounded-xl border border-orange-200 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-extrabold text-gray-900">🎁 العميل: {log.customerName} ({log.customerPhone})</p>
                        <p className="text-gray-600 mt-0.5">الهدية المسلمة: <strong className="text-orange-700">{log.giftName}</strong> | النقاط المخصومة: {log.pointsDeducted} نقطة</p>
                      </div>
                      <span className="text-[10px] text-gray-400">{log.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!showResultsReport && !showCustomers && (
          <div className="bg-white p-6 rounded-2xl shadow-lg space-y-6">
            <div className="text-center pb-4 border-b">
              <h3 className="text-xl font-bold text-gray-800">مولد العروض الذكية المربوطة بنقاط الولاء والاستراتيجيات المتخصصة</h3>
              <p className="text-xs text-gray-500 mt-1">اختر الاستراتيجية المناسبة (قطعتين هدية، باكدج تنظيف، جركن سحري، خصم مباشر) ليتم توليد عرض حقيقي ومخصص</p>
            </div>
            <div className="space-y-6 pt-2">
              
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button type="button" onClick={() => setCreationMode("automatic")} variant={creationMode === "automatic" ? "default" : "outline"} className={creationMode === "automatic" ? "bg-orange-600 text-white" : ""}>
                  <Sparkles className="ml-2 h-4 w-4" />عرض تلقائي بالعجلة والاستراتيجية
                </Button>
                <Button type="button" onClick={() => setCreationMode("manual")} variant={creationMode === "manual" ? "default" : "outline"} className={creationMode === "manual" ? "bg-blue-600 text-white" : ""}>
                  <Plus className="ml-2 h-4 w-4" />إنشاء عرض يدوي بنفسي
                </Button>
              </div>

              {creationMode === "manual" && (
                <div className="space-y-4 rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-5 shadow-sm">
                  <div><h4 className="font-extrabold text-blue-950">عرض يدوي: أنت تختار كل التفاصيل</h4><p className="mt-1 text-xs text-blue-800">اختر المنتج أو التركيبة، وحدد خصمًا كنسبة أو مبلغ. يحسب النظام السعر من سعر القطاعي ويرفض أي خصم يسبب خسارة.</p></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1"><label className="text-sm font-bold text-gray-700">المنتج أو التركيبة</label><select value={manualItemKey} onChange={event => setManualItemKey(event.target.value)} className="w-full rounded-xl border bg-white p-3 font-bold"><option value="">اختر من المنتجات والتركـيبات المسجلة</option>{manualCandidates.map(item => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.name} — {item.type === "recipe" ? "تركيبة" : "منتج"} — قطاعي {item.retailPrice} ج.م</option>)}</select></div>
                    <div className="space-y-1"><label className="text-sm font-bold text-gray-700">عنوان العرض (اختياري)</label><Input value={manualTitle} onChange={event => setManualTitle(event.target.value)} placeholder="مثال: عرض الجمعة على أوكسي" /></div>
                    <div className="space-y-1"><label className="text-sm font-bold text-gray-700">نوع الخصم</label><select value={manualDiscountType} onChange={event => setManualDiscountType(event.target.value as ManualDiscountType)} className="w-full rounded-xl border bg-white p-3 font-bold"><option value="percent">نسبة مئوية %</option><option value="fixed">مبلغ ثابت ج.م</option></select></div>
                    <div className="space-y-1"><label className="text-sm font-bold text-gray-700">قيمة الخصم</label><Input type="number" min="0" value={manualDiscountValue} onChange={event => setManualDiscountValue(event.target.value)} placeholder={manualDiscountType === "percent" ? "مثال: 10" : "مثال: 5"} /></div>
                    <div className="space-y-1 md:col-span-2"><label className="text-sm font-bold text-gray-700">وصف العرض للعميل (اختياري)</label><Input value={manualDescription} onChange={event => setManualDescription(event.target.value)} placeholder="مثال: لفترة محدودة حتى نفاد الكمية" /></div>
                  </div>
                  {selectedManualCandidate && <div className="rounded-xl border bg-white p-3 text-sm"><p>السعر القطاعي: <strong className="text-blue-700">{selectedManualCandidate.retailPrice} ج.م</strong> — تكلفة الجملة: <strong>{selectedManualCandidate.costPrice} ج.م</strong></p>{manualPreview && (manualPreview.valid ? <p className="mt-1 font-bold text-green-700">سعر العرض الآمن: {manualPreview.offerPrice} ج.م — التوفير: {manualPreview.discountAmount} ج.م ({manualPreview.discountPercent}%)</p> : <p className="mt-1 font-bold text-red-700">{manualPreview.error}</p>)}</div>}
                  <Button type="button" onClick={createManualOffer} className="w-full bg-blue-600 py-5 text-base font-black text-white hover:bg-blue-700"><Check className="ml-2 h-5 w-5" />إنشاء العرض اليدوي ومراجعته</Button>
                </div>
              )}

              {/* اختيار فئة العرض */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">1. اختر نوع العرض:</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: "daily", label: "يومي ⚡" },
                    { id: "weekly", label: "أسبوعي 📅" },
                    { id: "monthly", label: "شهري 🌟" },
                    { id: "seasonal", label: "موسمي 🏷️" }
                  ].map((type) => (
                    <Button
                      key={type.id}
                      onClick={() => setSelectedCategory(type.id)}
                      variant={selectedCategory === type.id ? "default" : "outline"}
                      className={`py-3 font-bold ${selectedCategory === type.id ? "bg-blue-600 text-white" : ""}`}
                    >
                      {type.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* تحديد مدة الصلاحية بالأيام (قابلة للمسح والتعديل بالكامل) */}
              <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-orange-600" /> تخصيص مدة صلاحية العرض (بالأيام):
                  </label>
                  <p className="text-xs text-gray-500">امسح الرقم واكتب عدد الأيام الذي تريده بحرية (مثلاً 5 أو 14)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                    placeholder="7"
                    className="w-24 p-2 border rounded-lg text-center font-bold text-lg text-orange-700 bg-white shadow-inner"
                  />
                  <span className="text-sm font-bold text-gray-700">يوم</span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <label className="block text-sm font-bold text-amber-950">نقاط الولاء من هذا العرض (اختياري)</label>
                <p className="mt-1 text-xs text-amber-800">اترك الخانة فارغة أو اكتب 0 إذا كنت لا تريد منح نقاط لهذا العرض.</p>
                <Input type="number" min="0" step="1" value={offerLoyaltyPoints} onChange={event => setOfferLoyaltyPoints(event.target.value)} placeholder="0 — بدون نقاط" className="mt-2 max-w-xs bg-white font-bold" />
              </div>

              {/* اختيار الاستراتيجية */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-bold text-gray-700">2. اختر الاستراتيجية المتخصصة:</label>
                  <Button
                    onClick={() => setShowAddStrategyModal(true)}
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة استراتيجية جديدة
                  </Button>
                </div>

                <select
                  value={selectedStrategyId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const nextStrategy = strategies.find(strategy => strategy.id === nextId);
                    setSelectedStrategyId(nextId);
                    if (nextStrategy) {
                      setManualTitle(nextStrategy.name);
                      setManualDescription(nextStrategy.description);
                    }
                  }}
                  className="w-full p-3 border rounded-xl font-bold text-sm bg-white shadow-sm focus:ring-2 focus:ring-orange-500"
                >
                  {strategies.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} {st.id.startsWith("custom_") ? " (مخصصة ✍️)" : ""}
                    </option>
                  ))}
                </select>

                {selectedStrategyId.startsWith("custom_") && (
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteStrategy(selectedStrategyId)}
                      className="text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> حذف هذه الاستراتيجية المخصصة
                    </Button>
                  </div>
                )}
              </div>

              {/* زر توليد العرض */}
              <div className="pt-2 text-center">
                <Button
                  onClick={generateRandomOffer}
                  disabled={isSpinning}
                  className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-8 py-5 text-lg rounded-2xl shadow-xl flex items-center gap-3 mx-auto"
                >
                  <RotateCw className={`w-5 h-5 ${isSpinning ? "animate-spin" : ""}`} />
                  {isSpinning ? "جاري تدوير عجلة العروض..." : "توليد تفاصيل العرض 🎡"}
                </Button>
              </div>

              {/* عرض العرض المولد مع زر "تأكيد وتفعيل العرض" */}
              {currentOffer && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-orange-200 p-6 rounded-2xl mt-6 space-y-6 shadow-md">
                  <div className="flex justify-between items-center border-b pb-4 flex-wrap gap-2">
                    <div>
                      <span className="bg-orange-600 text-white text-xs px-3 py-1.5 rounded-full font-bold">
                        {currentOffer.title}
                      </span>
                      <p className="text-xs text-gray-600 mt-1 font-semibold">استراتيجية: {currentOffer.strategyName} | صالح حتى: {currentOffer.endDate}</p>
                      {currentOfferExpiry && <p className={`mt-1 text-xs font-black ${currentOfferExpiry.status === "active" ? "text-green-700" : "text-red-700"}`}>{formatOfferTimeRemaining(currentOfferExpiry)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {currentOffer.isActivated && <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full font-black flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> العرض مفعّل وباركود الكوبون جاهز ✅</span>}
                      <Button onClick={handleActivateAndPublishOffer} className="bg-green-600 hover:bg-green-700 text-white text-sm font-black py-2 px-5 rounded-xl shadow-lg flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> {currentOffer.isActivated ? "حفظ التعديلات السحابية" : "تأكيد وتفعيل العرض 🔒"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-indigo-200 bg-white p-4 md:grid-cols-2">
                    <div><label className="mb-1 block text-xs font-bold text-slate-700">عنوان العرض</label><Input value={currentOffer.title} onChange={event => updateCurrentOfferField("title", event.target.value)} /></div>
                    <div><label className="mb-1 block text-xs font-bold text-slate-700">عنوان البانر المخصص</label><div className="flex gap-2"><Input value={currentOffer.bannerTitle || ""} onChange={event => updateCurrentOfferField("bannerTitle", event.target.value)} placeholder="مثال: دلوقتي هتلاقي عروض التوفير" /><Button type="button" size="sm" disabled={generateOfferBannerTitle.isLoading} onClick={() => void handleGenerateBannerTitle()} className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700">✨ توليد بالذكاء الاصطناعي</Button></div></div>
                    <div><label className="mb-1 block text-xs font-bold text-slate-700">وصف العرض</label><Input value={currentOffer.description} onChange={event => updateCurrentOfferField("description", event.target.value)} /></div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 md:col-span-2">
                      <p className="mb-2 text-sm font-black text-emerald-950">الهوية البصرية والدعائية</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div><label className="mb-1 block text-xs font-bold text-slate-700">الجملة التسويقية للبانر</label><Input value={currentOffer.promoText || ""} onChange={event => updateCurrentOfferField("promoText", event.target.value)} placeholder="أقوى عروض التوفير / اشتري قطعتين والتالتة هدية" /></div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><label className="mb-2 block text-xs font-black text-slate-700">لون أو تدرج خلفية البانر</label><div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => updateCurrentOfferField("backgroundMode", "solid")} className={`rounded-lg px-3 py-2 text-xs font-black ${currentOffer.backgroundMode === "solid" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>لون مفرد</button><button type="button" onClick={() => updateCurrentOfferField("backgroundMode", "gradient")} className={`rounded-lg px-3 py-2 text-xs font-black ${currentOffer.backgroundMode !== "solid" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>تدرج لوني</button></div><div className="flex flex-wrap items-center gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(currentOffer.bgColor || "") ? currentOffer.bgColor : "#0c0907"} onChange={event => { setBgColorDraft(event.target.value); updateCurrentOfferField("bgColor", event.target.value); }} className="h-10 w-14 cursor-pointer rounded-lg border bg-white p-1" /><Input key={`offer-bg-color-${currentOffer.id}`} value={bgColorDraft} onChange={event => setBgColorDraft(event.target.value)} onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(bgColorDraft)) updateCurrentOfferField("bgColor", bgColorDraft); else { setBgColorDraft(currentOffer.bgColor || "#0c0907"); toast.error("أدخل لون Hex صالحاً مثل #1A2B3C."); } }} className="w-32 font-mono" placeholder="#RRGGBB" aria-label="قيمة لون Hex" /><span className="text-xs font-bold text-slate-500">اختر لوناً أو عدّل طرفي التدرج</span><input type="color" value={currentOffer.gradientStartColor || "#0c0907"} onChange={event => { const start = event.target.value; const end = currentOffer.gradientEndColor || "#f59e0b"; setBgColorDraft(start); updateCurrentOfferField("gradientStartColor", start); updateCurrentOfferField("bgColor", start); updateCurrentOfferField("bgGradient", `linear-gradient(135deg, ${start} 0%, ${end} 100%)`); updateCurrentOfferField("backgroundMode", "gradient"); }} className="h-9 w-11 cursor-pointer rounded-lg border bg-white p-1" aria-label="لون بداية التدرج" /><input type="color" value={currentOffer.gradientEndColor || "#f59e0b"} onChange={event => { const end = event.target.value; const start = currentOffer.gradientStartColor || "#0c0907"; updateCurrentOfferField("gradientEndColor", end); updateCurrentOfferField("bgGradient", `linear-gradient(135deg, ${start} 0%, ${end} 100%)`); updateCurrentOfferField("backgroundMode", "gradient"); }} className="h-9 w-11 cursor-pointer rounded-lg border bg-white p-1" aria-label="لون نهاية التدرج" /></div><p className="mt-2 text-[11px] font-bold text-slate-600">الخلفية الحالية: {currentOffer.backgroundMode === "solid" ? "لون مفرد؛ التدرج المحفوظ يبقى محفوظاً للتبديل لاحقاً." : "تدرج لوني مخصص أو جاهز."}</p><div className="mt-3 flex flex-wrap gap-1.5">{OFFER_GRADIENT_PRESETS.map(preset => <button type="button" key={preset.label} onClick={() => { setBgColorDraft(preset.start); updateCurrentOfferField("bgGradient", preset.value); updateCurrentOfferField("bgColor", preset.start); updateCurrentOfferField("gradientStartColor", preset.start); updateCurrentOfferField("gradientEndColor", preset.end); updateCurrentOfferField("backgroundMode", "gradient"); }} className="rounded-full border border-white px-3 py-1.5 text-[11px] font-black text-white shadow ring-1 ring-slate-300" style={{ backgroundImage: preset.value }}>{preset.label}</button>)}</div></div>
                      </div>
                      <div className="relative mt-3 h-40 overflow-hidden rounded-2xl p-3 text-white shadow-inner" style={{ backgroundColor: currentOffer.bgColor || "#0c0907", backgroundImage: currentOffer.bannerCustomImage ? `linear-gradient(90deg,rgba(15,23,42,.42),rgba(15,23,42,.12)),url("${currentOffer.bannerCustomImage}")` : currentOffer.backgroundMode === "solid" ? undefined : currentOffer.bgGradient || undefined, backgroundSize: currentOffer.bannerCustomImage ? "cover" : undefined, backgroundPosition: "center" }}>{(currentOffer.bannerImageUrl || currentOffer.items.find(item => item.imageUrl)?.imageUrl) ? <img src={currentOffer.bannerImageUrl || currentOffer.items.find(item => item.imageUrl)?.imageUrl || ""} alt="صورة المنتج داخل البانر" className="absolute bottom-1 left-2 z-20 h-[84%] max-w-[36%] shrink-0 object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,.4)]" /> : <div className="absolute bottom-3 left-4 z-20 text-4xl opacity-80">🎁</div>}<div className="relative z-30 mr-auto w-[62%] space-y-1 pt-7 text-right [text-shadow:0_1px_3px_rgba(0,0,0,.8)]"><p className="text-[10px] font-bold opacity-90">معاينة حية للبانر</p><p className="line-clamp-1 text-base font-black">{currentOffer.promoText || "أقوى عروض التوفير"}</p><p className="line-clamp-1 text-sm font-bold">{currentOffer.title}</p><div className="flex flex-wrap gap-1 pt-1 text-[10px] font-black">{Number(currentOffer.discountPercent || 0) > 0 && <span className="rounded-full border border-white/25 bg-amber-300 px-2 py-0.5 text-amber-950">وفر {Number(currentOffer.discountPercent).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%</span>}<span className="rounded-full border border-white/25 bg-white/90 px-2 py-0.5 text-slate-900">{Number(currentOffer.offerPrice || 0).toLocaleString("ar-EG")} ج.م</span></div></div><svg className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-5 w-36 -translate-x-1/2" viewBox="0 0 144 24" fill="none" aria-hidden="true"><path d="M0 23c9-10 17-9 24-2 3-12 14-15 22-5 7-15 18-17 26-5 6-9 16-9 21 0 9-12 19-9 23 0 8-7 19-3 28 12H0Z" fill="white" fillOpacity=".82"/></svg></div>
                    </div>
                    <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3 md:col-span-2"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><label className="block text-sm font-black text-orange-950">صورة المنتج وخلفية البانر</label><p className="text-[11px] font-semibold text-orange-800">تظهر صورة المنتج أمام المشهد المولّد، وتُحفظ الصور في Supabase Storage.</p></div></div><div className="grid grid-cols-3 gap-2"><Button type="button" variant="outline" disabled={bannerImageUploading || bannerImageGenerating} onClick={() => void handleGenerateOfferBanner()} className="min-h-11 w-full whitespace-normal border-violet-300 bg-violet-50 px-1 text-[11px] font-black leading-tight text-violet-900 shadow-sm hover:bg-violet-100">{bannerImageGenerating ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : null}🪄 توليد بانر 3D بالذكاء الاصطناعي</Button><label className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-orange-600 px-1 text-center text-[11px] font-black leading-tight text-white hover:bg-orange-700 ${bannerImageUploading || bannerImageGenerating ? "pointer-events-none opacity-60" : ""}`}>📷 التقاط بالكاميرا<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" disabled={bannerImageUploading || bannerImageGenerating} onChange={event => { void handleBannerImageUpload(event.target.files?.[0]); event.target.value = ""; }} /></label><label className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-orange-300 bg-white px-1 text-center text-[11px] font-black leading-tight text-orange-800 hover:bg-orange-100 ${bannerImageUploading || bannerImageGenerating ? "pointer-events-none opacity-60" : ""}`}>🖼️ اختيار من المعرض<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={bannerImageUploading || bannerImageGenerating} onChange={event => { void handleBannerImageUpload(event.target.files?.[0]); event.target.value = ""; }} /></label>{(currentOffer.bannerImageUrl || currentOffer.bannerCustomImage) && <Button type="button" size="sm" variant="outline" disabled={bannerImageUploading || bannerImageGenerating} onClick={() => void clearBannerImage()} className="col-span-3 mt-1 w-full">حذف الصورة والخلفية</Button>}</div>{bannerImageGenerating && <p className="mt-2 flex items-center justify-center gap-2 text-xs font-bold text-violet-800"><LoaderCircle className="h-4 w-4 animate-spin" /> جاري توليد البانر سحابياً...</p>}{bannerImageUploading && <p className="mt-2 text-center text-xs font-bold text-orange-700">جارٍ رفع الصورة...</p>}</div>
                    <div><label className="mb-1 block text-xs font-bold text-slate-700">تاريخ البداية الظاهر</label><Input value={currentOffer.startDate} onChange={event => updateCurrentOfferField("startDate", event.target.value)} /></div>
                    <div><label className="mb-1 block text-xs font-bold text-slate-700">تاريخ الانتهاء الظاهر</label><Input value={currentOffer.endDate} onChange={event => updateCurrentOfferField("endDate", event.target.value)} /></div>
                    <p className="text-[11px] text-indigo-700 md:col-span-2">يمكن تعديل كل قيمة يدوياً ثم الضغط على «حفظ التعديلات السحابية» أو «تأكيد وتفعيل العرض».</p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm">مكونات العرض وأسعار المنتجات:</h4>
                    {currentOffer.items.map((item, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl border flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {item.imageUrl && <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain" />}
                          <div>
                          <p className="font-extrabold text-gray-900 text-base">{item.name}</p>
                          <p className="text-xs text-gray-500">السعر القطاعي: <strong className="text-blue-600">{item.retailPrice} ج.م</strong></p>
                        </div>
                        <div className="text-left">
                          <label className="mb-1 block text-xs font-bold text-slate-600">سعر الصنف في العرض</label>
                          <Input type="number" min="0" value={item.offerPrice} onChange={event => updateCurrentOfferItemPrice(idx, event.target.value)} className="w-32 text-left font-black text-green-700" />
                        </div>
                      </div>
                      </div>
                    ))}
                  </div>

                  {/* تعديل السعر يدوياً */}
                  <div className="bg-white p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-800">تعديل إجمالي سعر العرض يدوياً:</label>
                      <p className="text-xs text-gray-500">أعلى من تكلفة الجملة ({currentOffer.totalCostPrice} ج.م) وأقل من إجمالي القطاعي</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editablePrice}
                        onChange={(e) => handlePriceChange(e.target.value)}
                        className="w-32 p-2 border rounded-lg text-center font-bold text-lg text-blue-700"
                      />
                      <span className="text-sm font-bold text-gray-600">ج.م</span>
                    </div>
                  </div>

                  {/* 🌟 البون المربع المبهج للزبون برابط ولاء (يظهر بعد التفعيل) */}
                  {currentOffer.isActivated && currentOffer.qrCodeDataUrl ? (
                    <div className="bg-gradient-to-br from-white via-amber-50/40 to-orange-50 p-6 rounded-[2.5rem] border-4 border-orange-400 text-center space-y-4 max-w-sm mx-auto shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-orange-200 rounded-bl-full opacity-30 pointer-events-none"></div>
                      
                      <div className="relative z-10 space-y-1">
                        <div className="flex justify-center items-center gap-1.5 text-orange-600 mb-1">
                          <Gift className="w-5 h-5 animate-pulse" />
                          <Sparkles className="w-5 h-5 text-yellow-600" />
                        </div>
                        <h3 className="text-2xl font-black text-orange-700">محلات أبو رغوة للمنظفات</h3>
                        <p className="text-xs font-bold text-gray-700">للمنظفات والعطور • أصل الرغوة في مصر</p>
                        <span className="inline-block bg-orange-100 text-orange-800 text-[10px] px-3 py-0.5 rounded-full font-bold mt-1">
                          {Number(currentOffer.loyaltyPoints || 0) > 0 ? `⭐ مع هذا الكوبون ${Math.trunc(Number(currentOffer.loyaltyPoints))} نقطة ولاء ومكافآت! ⭐` : "⭐ هذا الكوبون بلا نقاط ولاء — النقاط اختيارية ⭐"}
                        </span>
                      </div>

                      <div className="border-t-2 border-b-2 border-orange-200 py-3 my-2 space-y-2 relative z-10">
                        <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white text-[11px] px-3 py-1 rounded-full font-bold inline-block shadow">
                          🎉 {currentOffer.strategyName}
                        </div>
                        <h4 className="text-base font-extrabold text-gray-900 mt-1">{currentOffer.title}</h4>
                        <p className="text-xs text-gray-600 font-medium">{currentOffer.description}</p>
                        
                        <div className="bg-white p-3 rounded-2xl border border-orange-200 mt-2 space-y-1.5 shadow-inner">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-700">السعر الأصلي:</span>
                            <span className="line-through text-gray-400 font-bold">{currentOffer.originalTotalRetail} ج.م</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-extrabold text-gray-900">سعر العرض الحصري:</span>
                            <span className="font-black text-green-700 text-lg bg-green-50 px-2.5 py-0.5 rounded-xl border border-green-200">{currentOffer.offerPrice} ج.م</span>
                          </div>
                        </div>

                        <p className="text-xs text-green-700 font-black pt-1">
                          ✨ توفير {currentOffer.discountAmount} جنيه ({currentOffer.discountPercent}% خصم)
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center space-y-2 relative z-10">
                        <img src={currentOffer.qrCodeDataUrl} alt="Offer QR" className="w-40 h-40 border-2 border-orange-300 p-2 bg-white rounded-2xl shadow-md mx-auto" />
                        <p className="text-[11px] text-gray-600 font-bold">امسح الـ QR بكاميرا الهاتف أو الماسح الضوئي</p>
                        <div className="flex gap-2 justify-center flex-wrap">
                          <Button
                            onClick={handleDownloadSingleQR}
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1.5 px-3 rounded-xl shadow"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> تحميل الباركود مباشر 📥
                          </Button>
                          <Button
                            onClick={handleOpenQRWindow}
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-1.5 px-3 rounded-xl shadow"
                          >
                            عرض وحفظ مطول 🔍
                          </Button>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-600 pt-1 border-t border-orange-200 relative z-10 space-y-0.5">
                        <p className="font-bold text-gray-800">📞 للتواصل: 01069035599</p>
                        <p className="text-[9px] text-gray-400">ساري حتى تاريخ: {currentOffer.endDate}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-2xl text-center border border-orange-200 space-y-2">
                      <p className="text-sm font-bold text-gray-700">اضغط على زر <strong className="text-green-600">"تأكيد وتفعيل العرض 🔒"</strong> بالأعلى لتوليد باركود الكوبون الحقيقي الخاص بهذا العرض.</p>
                    </div>
                  )}

                  {/* أزرار المشاركة والتحميل والطباعة */}
                  {currentOffer.isActivated && (
                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                      <MarketingShareButton post={toMarketingPost(currentOffer)} label="توليد نص إعلاني (فيسبوك / واتساب)" />
                      <OfferVideoScriptButton offer={currentOffer} />
                      <Button
                        onClick={() => {
                          toast.info("📸 استخدم لقطة الشاشة (Screen Shot) للكوبون أو زر الطباعة أدناه");
                          window.print();
                        }}
                        className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2 font-bold shadow"
                      >
                        <Download className="w-4 h-4" /> تحميل / طباعة الكوبون
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* نافذة إضافة استراتيجية جديدة */}
      {showAddStrategyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" dir="rtl">
          <div className="bg-white p-6 rounded-3xl max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900">إضافة استراتيجية عرض جديدة ✍️</h3>
            <p className="text-xs text-gray-500">أدخل اسم ووصف الاستراتيجية ليتم إضافتها لقائمة الاستراتيجيات المتاحة.</p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">اسم الاستراتيجية:</label>
                <Input
                  value={newStrategyName}
                  onChange={(e) => setNewStrategyName(e.target.value)}
                  placeholder="مثال: عرض الجمعة البيضاء (خصم 25%)"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">وصف الاستراتيجية (اختياري):</label>
                <Input
                  value={newStrategyDesc}
                  onChange={(e) => setNewStrategyDesc(e.target.value)}
                  placeholder="وصف تفصيلي للعرض..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddStrategyModal(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleAddCustomStrategy}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
              >
                حفظ وإضافة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
