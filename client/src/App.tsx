import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";











































import VoiceCommandHandler from "./components/VoiceCommandHandler";
















import { NotificationProvider } from "./components/NotificationSystem";
import { SecurityProvider } from "./contexts/SecurityContext";
import { withPasswordProtection } from "./components/withPasswordProtection";
import AccessControlGate, { withManagerRole, withSupervisorRole } from "./components/AccessControlGate";
import PageLoadingSkeleton from "./components/PageLoadingSkeleton";
import { isPublicCustomerPath } from "@shared/pwaInstallability";
import { syncPwaInstallability } from "./lib/pwaInstallability";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { isUserAllowed } from "@/lib/accessControl";
import { canSellerAccessPath } from "@/lib/sellerAccess";
import SellerNavigation from "@/components/SellerNavigation";
import CustomQuickShortcuts from "@/components/CustomQuickShortcuts";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const loadProducts = () => import("./pages/Products");
const Products = lazy(loadProducts);
const loadSales = () => import("./pages/Sales");
const Sales = lazy(loadSales);
const Reports = lazy(() => import("./pages/Reports"));
const Employees = lazy(() => import("./pages/Employees"));
const StaffWithdrawals = lazy(() => import("./pages/StaffWithdrawals"));
const Tasks = lazy(() => import("./pages/Tasks"));
const PointsSystem = lazy(() => import("./pages/PointsSystem"));
const Offers = lazy(() => import("./pages/Offers"));
const VoiceAssistant = lazy(() => import("./pages/VoiceAssistant"));
const RawMaterials = lazy(() => import("./pages/RawMaterials"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Calculator = lazy(() => import("./pages/Calculator"));
const Auth = lazy(() => import("./pages/Auth"));
const SalesInventory = lazy(() => import("./pages/SalesInventory"));
const InvoiceOCR = lazy(() => import("./pages/InvoiceOCR"));
const Invoice = lazy(() => import("./pages/Invoice"));
const Returns = lazy(() => import("./pages/Returns"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const InventoryAlerts = lazy(() => import("./pages/InventoryAlerts"));
const RecipeProduction = lazy(() => import("./pages/RecipeProduction"));
const DataExportImport = lazy(() => import("./pages/DataExportImport"));
const RecipesDisplay = lazy(() => import("./pages/RecipesDisplay"));
const AdvancedSearch = lazy(() => import("./pages/AdvancedSearch"));
const Settings = lazy(() => import("./pages/Settings"));
const EmailNotifications = lazy(() => import("./pages/EmailNotifications"));
const PaymentGateway = lazy(() => import("./pages/PaymentGateway"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Checks = lazy(() => import("./pages/Checks"));
const ChecksPage = lazy(() => import("./pages/ChecksPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const loadInventoryPage = () => import("./pages/InventoryPage");
const InventoryPage = lazy(loadInventoryPage);
const RawMaterialDetails = lazy(() => import("./pages/RawMaterialDetails"));
const InvoiceCameraPage = lazy(() => import("./pages/InvoiceCameraPage"));
const InvoiceScanner = lazy(() => import("./pages/InvoiceScanner"));
const AdvancedInvoices = lazy(() => import("./pages/AdvancedInvoices"));
const AdvancedBarcode = lazy(() => import("./pages/AdvancedBarcode"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const VoiceControlPage = lazy(() => import("./pages/VoiceControlPage"));
const Shortages = lazy(() => import("./pages/Shortages"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AdvancedNotificationsPage = lazy(() => import("./pages/AdvancedNotificationsPage"));
const loadApartmentManagement = () => import("./pages/ApartmentManagement");
const ApartmentManagement = lazy(loadApartmentManagement);
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const CreditsAndSuppliersAdvanced = lazy(() => import("./pages/CreditsAndSuppliersAdvanced"));
const SmartOffers = lazy(() => import("./pages/SmartOffers"));
const SmartOffersList = lazy(() => import("./pages/SmartOffersList"));
const PublicOfferPage = lazy(() => import("./pages/PublicOfferPage"));
const CatalogManager = lazy(() => import("./pages/CatalogManager"));
const PublicCatalogPage = lazy(() => import("./pages/PublicCatalogPage"));
const CatalogOffersPage = lazy(() => import("./pages/CatalogOffersPage"));
const LoyaltyPage = lazy(() => import("./pages/LoyaltyPage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const CommunityAdminPage = lazy(() => import("./pages/CommunityAdminPage"));
const Cashier = lazy(() => import("./pages/Cashier"));
const CustomerDisplay = lazy(() => import("./pages/CustomerDisplay"));
const LedDisplay = lazy(() => import("./pages/LedDisplay"));

function preloadFrequentPages() {
  const preload = () => {
    // Warm all feature chunks after the first screen is usable. Navigation is
    // then instant on ordinary phones, while the initial login/dashboard is
    // not blocked by a large bundle download.
    const pages = [
      loadProducts, loadSales, loadInventoryPage,
      () => import("./pages/Reports"), () => import("./pages/Employees"), () => import("./pages/Tasks"),
      () => import("./pages/PointsSystem"), () => import("./pages/Offers"), () => import("./pages/VoiceAssistant"),
      () => import("./pages/RawMaterials"), () => import("./pages/Recipes"), () => import("./pages/Calculator"),
      () => import("./pages/Invoice"), () => import("./pages/AuditLog"), () => import("./pages/InventoryAlerts"),
      () => import("./pages/RecipeProduction"), () => import("./pages/DataExportImport"), () => import("./pages/RecipesDisplay"),
      () => import("./pages/AdvancedSearch"), () => import("./pages/Settings"), () => import("./pages/EmailNotifications"),
      () => import("./pages/PaymentGateway"), () => import("./pages/UserManagement"), () => import("./pages/Expenses"),
      () => import("./pages/Checks"), () => import("./pages/ChecksPage"), () => import("./pages/SuppliersPage"),
      () => import("./pages/TasksPage"), () => import("./pages/RawMaterialDetails"), () => import("./pages/InvoiceCameraPage"),
      () => import("./pages/InvoiceScanner"), () => import("./pages/AdvancedInvoices"), () => import("./pages/AdvancedBarcode"),
      () => import("./pages/SocialMedia"), () => import("./pages/VoiceControlPage"), () => import("./pages/NotificationsPage"),
      () => import("./pages/AdvancedNotificationsPage"), () => import("./pages/ApartmentManagement"), () => import("./pages/Leaderboard"),
      () => import("./pages/SecuritySettings"), () => import("./pages/CreditsAndSuppliersAdvanced"), () => import("./pages/SmartOffers"),
      () => import("./pages/SmartOffersList"), () => import("./pages/CatalogManager"), () => import("./pages/Cashier"),
    ];
    pages.forEach(load => void load());
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 1200 });
  else globalThis.setTimeout(preload, 800);
}
function preloadPublicPages() {
  const preload = () => {
    void import("./pages/PublicCatalogPage");
    void import("./pages/LoyaltyPage");
    void import("./pages/CatalogOffersPage");
    void import("./pages/PublicOfferPage");
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 800 });
  else globalThis.setTimeout(preload, 150);
}
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={withPasswordProtection(Dashboard, 'screen__root', 'لوحة المتجر الرئيسية')} />
      <Route path={"/auth"} component={Auth} />
      <Route path={"/home"} component={withPasswordProtection(Home, 'screen__home', 'الرئيسية')} />
      <Route path={"/dashboard"} component={withPasswordProtection(Dashboard, 'screen__dashboard', 'لوحة التحكم')} />
      <Route path={"/products"} component={withSupervisorRole(withPasswordProtection(Products, 'screen__products', 'المنتجات'))} />

      <Route path={"/sales"} component={withPasswordProtection(Sales, 'screen__sales', 'البيع السريع')} />
      <Route path={"/cashier"} component={withPasswordProtection(Cashier, 'screen__cashier', 'كاشير الصب والبيع')} />
      <Route path={"/reports"} component={withSupervisorRole(withPasswordProtection(Reports, 'screen__reports', 'التقارير المالية'))} />
      <Route path={"/advanced-reports"} component={withSupervisorRole(withPasswordProtection(SalesInventory, 'screen__advanced_reports', 'جرد المبيعات والأرباح'))} />
      <Route path={"/employees"} component={withManagerRole(withPasswordProtection(Employees, 'screen__employees', 'إدارة الموظفين'))} />
      <Route path={"/staff-management"} component={withManagerRole(withPasswordProtection(Employees, 'screen__staff_management', 'إدارة الموظفين'))} />
      <Route path={"/my-withdrawals"} component={StaffWithdrawals} />
      <Route path={"/tasks"} component={withSupervisorRole(withPasswordProtection(Tasks, 'screen__tasks', 'المهام'))} />
      <Route path={"/points-system"} component={withSupervisorRole(withPasswordProtection(PointsSystem, 'screen__points_system', 'نظام النقاط'))} />
      <Route path={"/offers"} component={withSupervisorRole(withPasswordProtection(Offers, 'screen__offers', 'العروض'))} />
      <Route path={"/smart-offers"} component={withSupervisorRole(withPasswordProtection(SmartOffers, 'screen__smart_offers', 'العروض الذكية'))} />
      <Route path={"/smart-offers-list"} component={withSupervisorRole(withPasswordProtection(SmartOffersList, 'screen__smart_offers_list', 'قائمة العروض الذكية'))} />
      <Route path={"/public-offer"} component={PublicOfferPage} />
      <Route path={"/catalog-offers"} component={CatalogOffersPage} />
      <Route path={"/loyalty"} component={LoyaltyPage} />
      <Route path={"/community"} component={CommunityPage} />
      <Route path={"/community-admin"} component={withSupervisorRole(withPasswordProtection(CommunityAdminPage, 'screen__community_admin', 'إدارة السحوبات والمسابقات'))} />
      <Route path={"/catalog"} component={PublicCatalogPage} />
      <Route path={"/catalog-manager"} component={withManagerRole(withPasswordProtection(CatalogManager, 'screen__catalog_manager', 'إدارة الكتالوج'))} />
      <Route path={"/customer-display"} component={CustomerDisplay} />
      <Route path={"/led-display"} component={LedDisplay} />
      <Route path={"/voice"} component={withSupervisorRole(withPasswordProtection(VoiceAssistant, 'screen__voice', 'المساعد الصوتي'))} />
      <Route path={"/materials"} component={withSupervisorRole(withPasswordProtection(RawMaterials, 'screen__materials', 'الخامات'))} />
      <Route path={"/recipes"} component={withSupervisorRole(withPasswordProtection(Recipes, 'screen__recipes', 'التركيبات'))} />
      <Route path={"/calculator"} component={withPasswordProtection(Calculator, 'screen__calculator', 'الحاسبة')} />
      <Route path={"/invoice-ocr"} component={withSupervisorRole(withPasswordProtection(InvoiceOCR, 'screen__invoice_ocr', 'قراءة فواتير OCR'))} />
      <Route path={"/invoice"} component={withPasswordProtection(Invoice, 'screen__invoice', 'الفواتير')} />
      <Route path={"/returns"} component={withSupervisorRole(withPasswordProtection(Returns, 'screen__returns', 'المرتجعات'))} />
      <Route path={"/audit-log"} component={withSupervisorRole(withPasswordProtection(AuditLog, 'screen__audit_log', 'سجل التدقيق'))} />

      <Route path={"/inventory-alerts"} component={withSupervisorRole(withPasswordProtection(InventoryAlerts, 'screen__inventory_alerts', 'تنبيهات المخزون'))} />
      <Route path={"/recipe-production"} component={withSupervisorRole(withPasswordProtection(RecipeProduction, 'screen__recipe_production', 'إنتاج التركيبات'))} />
      <Route path={"/data-export-import"} component={withManagerRole(withPasswordProtection(DataExportImport, 'screen__data_export_import', 'النسخ الاحتياطي والاستيراد والتصدير'))} />
      <Route path={"/recipes-display"} component={withSupervisorRole(withPasswordProtection(RecipesDisplay, 'screen__recipes_display', 'عرض التركيبات'))} />
      <Route path={"/advanced-search"} component={withSupervisorRole(withPasswordProtection(AdvancedSearch, 'screen__advanced_search', 'البحث المتقدم'))} />
      <Route path={"/settings"} component={withManagerRole(withPasswordProtection(Settings, 'screen__settings', 'إعدادات المتجر'))} />
      <Route path={"/email-notifications"} component={withManagerRole(withPasswordProtection(EmailNotifications, 'screen__email_notifications', 'إعدادات الإشعارات'))} />
      <Route path={"/payment-gateway"} component={withManagerRole(withPasswordProtection(PaymentGateway, 'screen__payment_gateway', 'إعدادات الدفع'))} />
      <Route path={"/user-management"} component={withManagerRole(withPasswordProtection(UserManagement, 'screen__user_management', 'إدارة العضويات'))} />
      <Route path={"/expenses"} component={withSupervisorRole(withPasswordProtection(Expenses, 'screen__expenses', 'المصاريف اليومية'))} />
      <Route path={"/checks"} component={withManagerRole(withPasswordProtection(Checks, 'screen__checks', 'الشيكات'))} />

      <Route path={"/checks-page"} component={withManagerRole(withPasswordProtection(ChecksPage, 'screen__checks_page', 'سجل الشيكات'))} />
      <Route path={"/suppliers"} component={withManagerRole(withPasswordProtection(SuppliersPage, 'screen__suppliers', 'الموردون'))} />
      <Route path={"/tasks-page"} component={withSupervisorRole(withPasswordProtection(TasksPage, 'screen__tasks_page', 'متابعة المهام'))} />
      <Route path={"/inventory"} component={withSupervisorRole(withPasswordProtection(InventoryPage, 'screen__inventory', 'إدارة المخزون'))} />
      <Route path={"/material-details/:id"} component={withSupervisorRole(withPasswordProtection(RawMaterialDetails, 'screen__material_details_id', 'تفاصيل الخامة'))} />
      <Route path={"/invoice-camera"} component={withSupervisorRole(withPasswordProtection(InvoiceOCR, 'screen__invoice_camera', 'قراءة فواتير OCR'))} />
      <Route path={"/invoice-scanner"} component={withSupervisorRole(withPasswordProtection(InvoiceScanner, 'screen__invoice_scanner', 'ماسح الفواتير'))} />
      <Route path={"/advanced-invoices"} component={withSupervisorRole(withPasswordProtection(InvoiceOCR, 'screen__advanced_invoices', 'قراءة فواتير OCR'))} />
      <Route path={"/advanced-barcode"} component={withPasswordProtection(AdvancedBarcode, 'screen__advanced_barcode', 'الباركود المتقدم')} />
      <Route path={"/social-media"} component={withPasswordProtection(SocialMedia, 'screen__social_media', 'التواصل الاجتماعي')} />
      <Route path={"/voice-control"} component={withSupervisorRole(withPasswordProtection(VoiceControlPage, 'screen__voice_control', 'التحكم الصوتي'))} />
      <Route path={"/notifications"} component={withPasswordProtection(NotificationsPage, 'screen__notifications', 'الإشعارات')} />
      <Route path={"/notifications-advanced"} component={withPasswordProtection(AdvancedNotificationsPage, 'screen__notifications_advanced', 'الإشعارات المتقدمة')} />
      <Route path={"/apartment-management"} component={withSupervisorRole(withPasswordProtection(ApartmentManagement, 'screen__apartment_management', 'إدارة الشقة'))} />
      <Route path={"/leaderboard"} component={withSupervisorRole(withPasswordProtection(Leaderboard, 'screen__leaderboard', 'لوحة الشرف'))} />
      <Route path={"/security-settings"} component={withManagerRole(SecuritySettings)} />
      <Route path={"/credits-suppliers"} component={withPasswordProtection(CreditsAndSuppliersAdvanced, 'screen__credits_suppliers', 'الآجل وحسابات الموردين')} />

      <Route path={"/shortages"} component={withPasswordProtection(Shortages, 'screen__shortages', 'نواقص أبو رغوة')} />
      <Route path={"404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const isPublicCustomerRoute = isPublicCustomerPath(location);
  const isAuthRoute = location === "/auth";
  const { user, isLoading: authLoading } = useStaffAccess({ monitorMembership: true });
  const hasStaffSession = Boolean(user && isUserAllowed(user));
  const routeScopeKey = `${user?.id ?? "guest"}:${user?.role ?? "none"}:${user?.status ?? "none"}:${hasStaffSession ? "active" : "restricted"}`;
  const syncReady = isPublicCustomerRoute || isAuthRoute || !authLoading;
  const isSeller = hasStaffSession && user?.role === "seller";
  const sellerRestricted = isSeller && !canSellerAccessPath(location);
  useEffect(() => {
    syncPwaInstallability(location);
  }, [location]);
  useEffect(() => {
    if (hasStaffSession) preloadFrequentPages();
    else preloadPublicPages();
  }, [hasStaffSession]);
  useEffect(() => {
    if (isPublicCustomerRoute || authLoading) return;
    if (isAuthRoute) {
      if (hasStaffSession) navigate(user?.role === "seller" ? "/cashier" : "/dashboard");
      return;
    }
    if (!hasStaffSession) navigate("/auth");
  }, [authLoading, hasStaffSession, isAuthRoute, isPublicCustomerRoute, navigate, user?.role]);
  if (!isPublicCustomerRoute && !isAuthRoute && !syncReady) return <PageLoadingSkeleton />;
  if (sellerRestricted) return <><SellerNavigation /><main dir="rtl" className="fixed inset-x-0 bottom-0 top-[76px] z-[100] grid place-items-center overflow-y-auto bg-slate-50 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">هذه الصفحة غير متاحة لحساب البائع</h1><p className="mt-3 text-slate-600">يمكنك استخدام نقطة البيع، تصفح الكتالوج، ومشاهدة العروض العامة. التقارير والتكاليف وإدارة المنتجات والتركيبات محجوبة.</p><button type="button" onClick={() => navigate("/cashier")} className="mt-6 w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800">فتح نقطة البيع</button></section></main></>;
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingSkeleton />}>
      <SecurityProvider>
        <NotificationProvider>
          <ThemeProvider
            defaultTheme="light"
          >
            <TooltipProvider>
              <Toaster />
              {isSeller && <SellerNavigation />}
              {/* Legacy snapshot synchronization is retired. Migrated pages use
                  typed Supabase tables/RPCs; remaining pages must not upload
                  local business-data snapshots. */}
              {!isPublicCustomerRoute && hasStaffSession && <VoiceCommandHandler enabled />}
              {!isPublicCustomerRoute && hasStaffSession && user && <CustomQuickShortcuts userId={user.id} role={user.role} />}
              {isPublicCustomerRoute ? <Router key="public-customer" /> : <AccessControlGate><Router key={routeScopeKey} /></AccessControlGate>}
            </TooltipProvider>
          </ThemeProvider>
        </NotificationProvider>
      </SecurityProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
