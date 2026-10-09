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

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const loadProducts = () => import("./pages/Products");
const Products = lazy(loadProducts);
const loadSales = () => import("./pages/Sales");
const Sales = lazy(loadSales);
const Reports = lazy(() => import("./pages/Reports"));
const Employees = lazy(() => import("./pages/Employees"));
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
const Cashier = lazy(() => import("./pages/Cashier"));
const CustomerDisplay = lazy(() => import("./pages/CustomerDisplay"));

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
      <Route path={"/"} component={Dashboard} />
      <Route path={"/auth"} component={Auth} />
      <Route path={"/home"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/products"} component={withPasswordProtection(Products, 'products', 'إدارة المنتجات')} />

      <Route path={"/sales"} component={withPasswordProtection(Sales, 'newsale', 'تسجيل مبيعة جديدة')} />
      <Route path={"/cashier"} component={withPasswordProtection(Cashier, 'newsale', 'كاشير الكمبيوتر')} />
      <Route path={"/reports"} component={withSupervisorRole(withPasswordProtection(Reports, 'viewreports', 'عرض التقارير'))} />
      <Route path={"/advanced-reports"} component={withSupervisorRole(withPasswordProtection(SalesInventory, 'viewreports', 'جرد المبيعات والأرباح'))} />
      <Route path={"/employees"} component={withSupervisorRole(Employees)} />
      <Route path={"/tasks"} component={withSupervisorRole(withPasswordProtection(Tasks, 'tasks', 'إدارة المهام'))} />
      <Route path={"/points-system"} component={withSupervisorRole(withPasswordProtection(PointsSystem, 'points', 'نظام النقط'))} />
      <Route path={"/offers"} component={withSupervisorRole(withPasswordProtection(Offers, 'offers', 'العروض'))} />
      <Route path={"/smart-offers"} component={withSupervisorRole(withPasswordProtection(SmartOffers, 'offers', 'العروض الذكية'))} />
      <Route path={"/smart-offers-list"} component={withSupervisorRole(withPasswordProtection(SmartOffersList, 'offers', 'قائمة العروض الذكية'))} />
      <Route path={"/public-offer"} component={PublicOfferPage} />
      <Route path={"/catalog-offers"} component={CatalogOffersPage} />
      <Route path={"/loyalty"} component={LoyaltyPage} />
      <Route path={"/catalog"} component={PublicCatalogPage} />
      <Route path={"/catalog-manager"} component={withManagerRole(withPasswordProtection(CatalogManager, 'products', 'إدارة كتالوج المحل'))} />
      <Route path={"/customer-display"} component={CustomerDisplay} />
      <Route path={"/voice"} component={withPasswordProtection(VoiceAssistant, 'voice', 'المساعد الصوتي')} />
      <Route path={"/materials"} component={withSupervisorRole(withPasswordProtection(RawMaterials, 'materials', 'قائمة الخامات'))} />
      <Route path={"/recipes"} component={withSupervisorRole(withPasswordProtection(Recipes, 'compositions', 'قائمة التركيبات'))} />
      <Route path={"/calculator"} component={Calculator} />
      <Route path={"/invoice-ocr"} component={withSupervisorRole(InvoiceOCR)} />
      <Route path={"/invoice"} component={Invoice} />
      <Route path={"/audit-log"} component={withSupervisorRole(AuditLog)} />

      <Route path={"/inventory-alerts"} component={withSupervisorRole(InventoryAlerts)} />
      <Route path={"/recipe-production"} component={withSupervisorRole(RecipeProduction)} />
      <Route path={"/data-export-import"} component={withManagerRole(DataExportImport)} />
      <Route path={"/recipes-display"} component={withSupervisorRole(RecipesDisplay)} />
      <Route path={"/advanced-search"} component={withSupervisorRole(AdvancedSearch)} />
      <Route path={"/settings"} component={withSupervisorRole(Settings)} />
      <Route path={"/email-notifications"} component={withSupervisorRole(EmailNotifications)} />
      <Route path={"/payment-gateway"} component={withSupervisorRole(PaymentGateway)} />
      <Route path={"/user-management"} component={withManagerRole(UserManagement)} />
      <Route path={"/expenses"} component={withSupervisorRole(withPasswordProtection(Expenses, 'expenses', 'إدارة المصاريف'))} />
      <Route path={"/checks"} component={withSupervisorRole(withPasswordProtection(Checks, 'checks', 'الشيكات'))} />

      <Route path={"/checks-page"} component={withSupervisorRole(withPasswordProtection(ChecksPage, 'checks', 'الشيكات'))} />
      <Route path={"/suppliers"} component={withSupervisorRole(withPasswordProtection(SuppliersPage, 'suppliers', 'الموردين'))} />
      <Route path={"/tasks-page"} component={withSupervisorRole(withPasswordProtection(TasksPage, 'tasks', 'المهام'))} />
      <Route path={"/inventory"} component={withSupervisorRole(withPasswordProtection(InventoryPage, 'inventory', 'إدارة المخزن'))} />
      <Route path={"/material-details/:id"} component={withSupervisorRole(RawMaterialDetails)} />
      <Route path={"/invoice-camera"} component={withSupervisorRole(withPasswordProtection(InvoiceCameraPage, 'invoices', 'تصوير الفواتير'))} />
      <Route path={"/invoice-scanner"} component={withSupervisorRole(withPasswordProtection(InvoiceScanner, 'invoices', 'تصوير الفواتير'))} />
      <Route path={"/advanced-invoices"} component={withSupervisorRole(withPasswordProtection(AdvancedInvoices, 'invoices', 'تصوير الفواتير'))} />
      <Route path={"/advanced-barcode"} component={withPasswordProtection(AdvancedBarcode, 'products', 'إدارة المنتجات')} />
      <Route path={"/social-media"} component={SocialMedia} />
      <Route path={"/voice-control"} component={withPasswordProtection(VoiceControlPage, 'voice', 'التحكم الصوتي')} />
      <Route path={"/notifications"} component={NotificationsPage} />
      <Route path={"/notifications-advanced"} component={AdvancedNotificationsPage} />
      <Route path={"/apartment-management"} component={withSupervisorRole(withPasswordProtection(ApartmentManagement, 'apartment', 'إدارة الشقة'))} />
      <Route path={"/leaderboard"} component={withPasswordProtection(Leaderboard, 'leaderboard', 'لوحة الشرف')} />
      <Route path={"/security-settings"} component={withManagerRole(SecuritySettings)} />
      <Route path={"/credits-suppliers"} component={withSupervisorRole(withPasswordProtection(CreditsAndSuppliersAdvanced, 'suppliers', 'الموردين والخامات'))} />

      <Route path={"/shortages"} component={withSupervisorRole(Shortages)} />
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
      if (hasStaffSession) navigate("/dashboard");
      return;
    }
    if (!hasStaffSession) navigate("/auth");
  }, [authLoading, hasStaffSession, isAuthRoute, isPublicCustomerRoute, navigate]);
  if (!isPublicCustomerRoute && !isAuthRoute && !syncReady) return <PageLoadingSkeleton />;
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
              {/* Legacy snapshot synchronization is retired. Migrated pages use
                  typed Supabase tables/RPCs; remaining pages must not upload
                  local business-data snapshots. */}
              <VoiceCommandHandler enabled={hasStaffSession || isPublicCustomerRoute} />
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
