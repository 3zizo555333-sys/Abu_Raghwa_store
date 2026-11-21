import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Boxes, Check, ChevronRight, CircleHelp, Mic, MicOff, Package, RotateCw, ShoppingBag, Trash2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getCatalogPrice, type CatalogProduct } from "@/lib/catalog";
import { catalogMoneyToKilograms, isWeightCatalogProduct, toCatalogKilograms } from "@/lib/catalogWeight";
import { canManageVirtualStore, loadVirtualStoreLayout, loadVirtualStoreStock, saveVirtualStoreLayout, type VirtualStoreLayout, type VirtualStoreNode } from "@/lib/supabase/virtualStore";
import { subscribeToShopChanges } from "@/lib/supabase/products";

const COLORS = ["#f97316", "#0891b2", "#7c3aed", "#16a34a", "#dc2626", "#eab308", "#334155"];
type Props = {
  shopId?: string;
  products: CatalogProduct[];
  cartCount: number;
  onAddToCart: (product: CatalogProduct) => void;
  onAddWeightToCart: (product: CatalogProduct, kilograms: number) => void;
  onOpenCart: () => void;
  onBackToCatalog: () => void;
};
type SelectedProduct = { product: CatalogProduct; kilograms?: number } | null;

const normalizeArabic = (value: string) => value.toLocaleLowerCase("ar-EG").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
const bulkUnitPrice = (product: CatalogProduct) => Math.max(0, Number(getCatalogPrice(product)) || 0);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function makeDefaultLayout(products: CatalogProduct[]): VirtualStoreLayout {
  const visible = products.slice(0, 32);
  const liquid = visible.filter(p => /سائل|شاور|داوني|كلور|ديتول|صابون/i.test(`${p.name} ${p.category}`));
  const dry = visible.filter(p => /مسحوق|زهرة|سلك|بودر|سايب|سائب/i.test(`${p.name} ${p.category}`));
  const shelves = [
    { id: "shelf-left", kind: "shelf" as const, x: -3.55, z: -4.1, rotation: 0, color: "#c07b3f", productIds: visible.slice(0, 8).map(p => p.id), copies: 6 },
    { id: "shelf-right", kind: "shelf" as const, x: 3.55, z: -4.1, rotation: Math.PI, color: "#c07b3f", productIds: visible.slice(8, 16).map(p => p.id), copies: 6 },
    { id: "shelf-back-left", kind: "shelf" as const, x: -3.55, z: -7.4, rotation: 0, color: "#b96f39", productIds: visible.slice(16, 24).map(p => p.id), copies: 6 },
    { id: "shelf-back-right", kind: "shelf" as const, x: 3.55, z: -7.4, rotation: Math.PI, color: "#b96f39", productIds: visible.slice(24, 32).map(p => p.id), copies: 6 },
    { id: "barrel-1", kind: "barrel" as const, x: -1.75, z: -2.7, rotation: 0, color: "#0e7490", productIds: (liquid.length ? liquid : visible.slice(0, 1)).slice(0, 3).map(p => p.id), copies: 4 },
    { id: "barrel-2", kind: "barrel" as const, x: -0.65, z: -2.7, rotation: 0, color: "#16a34a", productIds: liquid.slice(1, 4).map(p => p.id), copies: 4 },
    { id: "sack-1", kind: "sack" as const, x: 1.3, z: -2.8, rotation: 0, color: "#d6b58b", productIds: (dry.length ? dry : visible.slice(1, 2)).slice(0, 2).map(p => p.id), copies: 4 },
    { id: "sack-2", kind: "sack" as const, x: 2.1, z: -2.8, rotation: 0, color: "#c6a377", productIds: dry.slice(1, 3).map(p => p.id), copies: 4 },
  ];
  return { version: 1, nodes: shelves };
}

function makeCanvasLabel(title: string, subtitle: string, background = "#fff7ed") {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033"; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.font = "bold 40px system-ui"; ctx.fillText(title, 256, 64, 470);
  ctx.fillStyle = "#c2410c"; ctx.font = "bold 28px system-ui"; ctx.fillText(subtitle, 256, 118, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBox(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, opts: { transparent?: boolean; opacity?: number; metalness?: number; roughness?: number } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, transparent: opts.transparent, opacity: opts.opacity, metalness: opts.metalness ?? 0.05, roughness: opts.roughness ?? 0.72 }));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export default function VirtualStore3D({ shopId, products, cartCount, onAddToCart, onAddWeightToCart, onOpenCart, onBackToCatalog }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraPose = useRef({ yaw: 0, pitch: 0 });
  const lastCameraPosition = useRef({ x: 0, y: 1.62, z: 4.6 });
  const [stock, setStock] = useState<Record<string, number>>({});
  const stockRef = useRef(stock);
  stockRef.current = stock;
  const pointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const joystickRef = useRef({ x: 0, y: 0 });
  const dirtyRef = useRef(false);
  const [layout, setLayout] = useState<VirtualStoreLayout>(() => makeDefaultLayout(products));
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct>(null);
  const [isManager, setIsManager] = useState(false);
  const [managerMode, setManagerMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [activeProductId, setActiveProductId] = useState("");
  const [displayCopies, setDisplayCopies] = useState("6");
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceReply, setVoiceReply] = useState("اضغط الميكروفون واسأل أبو رغوة عن منتج أو سعر.");
  const [stockError, setStockError] = useState(false);
  const keySet = useRef(new Set<string>());
  const selectedNode = layout.nodes.find(node => node.id === selectedNodeId) || null;
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);

  const changeLayout = useCallback((mutate: (previous: VirtualStoreLayout) => VirtualStoreLayout) => {
    dirtyRef.current = true;
    setLayout(previous => mutate(previous));
  }, []);

  useEffect(() => {
    if (!shopId) return;
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    void canManageVirtualStore(shopId).then(value => { if (active) setIsManager(value); });
    void loadVirtualStoreLayout(shopId).then(saved => { if (active && saved) setLayout(saved); }).catch(() => undefined);
    const refreshStock = () => loadVirtualStoreStock(shopId).then(value => { if (active) { setStock(previous => Object.keys(previous).length === Object.keys(value).length && Object.entries(value).every(([id, quantity]) => previous[id] === quantity) ? previous : value); setStockError(false); } }).catch(() => { if (active) setStockError(true); });
    void refreshStock();
    void subscribeToShopChanges(shopId, () => { void refreshStock(); }).then(cleanup => { if (active) unsubscribe = cleanup; else void cleanup(); }).catch(() => undefined);
    const interval = window.setInterval(refreshStock, 20_000);
    return () => { active = false; window.clearInterval(interval); if (unsubscribe) void unsubscribe(); };
  }, [shopId]);

  useEffect(() => {
    if (!shopId || !isManager || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      void saveVirtualStoreLayout(shopId, layout).then(() => { dirtyRef.current = false; }).catch(error => {
        toast.error(error instanceof Error ? `تعذر حفظ ترتيب المحل: ${error.message}` : "تعذر حفظ ترتيب المحل؛ تأكد من تطبيق تحديث قاعدة البيانات.");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [layout, shopId, isManager]);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    const width = host.clientWidth || 360;
    const height = host.clientHeight || 620;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = "absolute inset-0 h-full w-full touch-none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9ad4ee");
    scene.fog = new THREE.Fog("#d5eaf2", 15, 34);
    const camera = new THREE.PerspectiveCamera(68, width / height, 0.08, 80);
    camera.position.set(lastCameraPosition.current.x, lastCameraPosition.current.y, lastCameraPosition.current.z); camera.rotation.order = "YXZ"; cameraRef.current = camera;
    const hemi = new THREE.HemisphereLight("#eff9ff", "#68513a", 2.1); scene.add(hemi);
    const sunlight = new THREE.DirectionalLight("#fff1d1", 3.0); sunlight.position.set(-4, 9, 5); sunlight.castShadow = true; sunlight.shadow.mapSize.set(1024, 1024); scene.add(sunlight);
    const ambient = new THREE.PointLight("#ffdd9e", 32, 18); ambient.position.set(0, 4.4, -3.5); scene.add(ambient);

    // Street and tiled shop floor.
    addBox(scene, 0, -0.16, 2.9, 24, 0.24, 14, "#858b8e", { roughness: 0.93 });
    addBox(scene, 0, -0.02, -3.6, 9.5, 0.12, 14.5, "#eee8dd", { roughness: 0.52 });
    const tileLines = new THREE.Group();
    for (let x = -4.5; x <= 4.5; x += 0.75) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 14), new THREE.MeshStandardMaterial({ color: "#c5c1b9", roughness: 1 })); line.position.set(x, 0.05, -3.5); tileLines.add(line);
    }
    for (let z = -10.5; z <= 3.5; z += 0.75) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.012, 0.014), new THREE.MeshStandardMaterial({ color: "#c5c1b9", roughness: 1 })); line.position.set(0, 0.05, z); tileLines.add(line);
    }
    scene.add(tileLines);
    // Interior walls, windows, glass door, illuminated storefront sign.
    addBox(scene, 0, 3.4, -10.8, 9.5, 6.8, 0.24, "#f5e8d8");
    addBox(scene, -4.68, 2.3, -3.6, 0.18, 4.6, 14.3, "#f8efe2");
    addBox(scene, 4.68, 2.3, -3.6, 0.18, 4.6, 14.3, "#f8efe2");
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#b8e4f1", transparent: true, opacity: 0.28, metalness: 0.12, roughness: 0.16, transmission: 0.2 });
    const windowLeft = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.65, 0.06), glassMaterial); windowLeft.position.set(-3.25, 2.4, 3.24); scene.add(windowLeft);
    const windowRight = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.65, 0.06), glassMaterial); windowRight.position.set(3.25, 2.4, 3.24); scene.add(windowRight);
    addBox(scene, 0, 1.38, 3.25, 1.45, 2.72, 0.1, "#80cce2", { transparent: true, opacity: 0.32, metalness: 0.12, roughness: 0.14 });
    addBox(scene, -0.82, 1.38, 3.25, 0.08, 2.85, 0.18, "#8a592d", { metalness: 0.3 });
    addBox(scene, 0.0, 2.92, 3.25, 1.72, 0.08, 0.18, "#8a592d", { metalness: 0.3 });
    addBox(scene, 0.82, 1.38, 3.25, 0.08, 2.85, 0.18, "#8a592d", { metalness: 0.3 });
    addBox(scene, 0, 4.55, 3.15, 6.8, 0.82, 0.42, "#f97316", { metalness: 0.12, roughness: 0.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.64), new THREE.MeshBasicMaterial({ map: makeCanvasLabel("أبو رغوة للمنظفات", "منظفات البيت وأسعاره على قد الإيد", "#ffedd5"), toneMapped: false })); sign.position.set(0, 4.55, 2.91); scene.add(sign);
    const fascia = new THREE.PointLight("#ff9c45", 40, 8); fascia.position.set(0, 4.3, 2.5); scene.add(fascia);
    // Neon aisle labels, cashier, counter, generic seller/visitors.
    const aisleTitle = (name: string, x: number, z: number, color = "#fff7ed") => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: makeCanvasLabel(name, "أسعار اليوم", color), toneMapped: false })); mesh.position.set(x, 3.45, z); mesh.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(mesh); };
    aisleTitle("الأرفف والعروض", -4.48, -4.3); aisleTitle("منظفات سايبة", 4.48, -3.2, "#ecfeff");
    addBox(scene, 0, 0.65, -8.65, 3.6, 1.25, 0.95, "#7c4a2d");
    addBox(scene, 0, 1.32, -8.65, 3.75, 0.14, 1.02, "#34251e", { metalness: 0.15 });
    addBox(scene, -0.45, 1.45, -8.62, 0.55, 0.12, 0.58, "#d2e9ef", { transparent: true, opacity: 0.8 });
    const seller = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.83, 12), new THREE.MeshStandardMaterial({ color: "#f97316", roughness: 0.65 })); torso.position.y = 1.35; seller.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshStandardMaterial({ color: "#d69a69", roughness: 0.86 })); head.position.y = 1.97; seller.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.12, 16), new THREE.MeshStandardMaterial({ color: "#172033" })); cap.position.y = 2.22; seller.add(cap);
    seller.position.set(0.05, 0, -7.65); scene.add(seller);
    const npcGroups: THREE.Group[] = [];
    for (const [i, point] of [[-1.25, -4.8], [2.7, -6.1]] as const) {
      const npc = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), new THREE.MeshStandardMaterial({ color: i < 0 ? "#2563eb" : "#16a34a" })); body.position.y = 1.1; npc.add(body);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: "#c88d61" })); face.position.y = 1.73; npc.add(face); npc.position.set(i, 0, point); scene.add(npc); npcGroups.push(npc);
    }

    const shopRoot = new THREE.Group(); scene.add(shopRoot);
    const productObjects: THREE.Object3D[] = [];
    const layoutObjects: THREE.Object3D[] = [];
    const productTextureCache = new Map<string, Promise<THREE.Texture>>();
    const loadProductTexture = (url: string) => {
      const existing = productTextureCache.get(url);
      if (existing) return existing;
      const texturePromise = new Promise<THREE.Texture>((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(url, texture => {
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        }, undefined, async () => {
          try {
            const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
            if (!response.ok) throw new Error(`image request failed (${response.status})`);
            const blobUrl = URL.createObjectURL(await response.blob());
            const texture = await new Promise<THREE.Texture>((resolveBlob, rejectBlob) => {
              new THREE.TextureLoader().load(blobUrl, resolveBlob, undefined, rejectBlob);
            });
            URL.revokeObjectURL(blobUrl);
            texture.colorSpace = THREE.SRGBColorSpace;
            resolve(texture);
          } catch (error) {
            reject(error);
          }
        });
      });
      productTextureCache.set(url, texturePromise);
      return texturePromise;
    };
    const makeProductCard = (node: VirtualStoreNode, product: CatalogProduct, x: number, y: number, z: number, cloneNo: number) => {
      const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = node.rotation; group.userData.layoutId = node.id;
      const imageMat = new THREE.MeshStandardMaterial({ color: "#fffaf2", roughness: 0.68, side: THREE.DoubleSide });
      if (product.catalogImageUrl) {
        void loadProductTexture(product.catalogImageUrl).then(texture => {
          if (renderer.getContext().isContextLost()) return;
          imageMat.map = texture; imageMat.color.set("#ffffff"); imageMat.needsUpdate = true;
        }).catch(() => { imageMat.color.set("#ffe7ca"); imageMat.needsUpdate = true; });
      }
      const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.52), imageMat); imagePlane.position.y = 0.34; imagePlane.userData.productId = product.id; imagePlane.userData.layoutId = node.id; group.add(imagePlane); productObjects.push(imagePlane);
      const title = product.name.length > 20 ? `${product.name.slice(0, 18)}…` : product.name;
      const labelTexture = makeCanvasLabel(title, `${bulkUnitPrice(product)} ج.م · ${product.unit || "وحدة"}`, "#fff7ed");
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.16), new THREE.MeshBasicMaterial({ map: labelTexture, toneMapped: false })); label.position.set(0, 0.015, 0.008); label.userData.productId = product.id; label.userData.layoutId = node.id; group.add(label); productObjects.push(label);
      group.userData.cloneNo = cloneNo; return group;
    };
    const addShelf = (node: VirtualStoreNode) => {
      const group = new THREE.Group(); group.position.set(node.x, 0, node.z); group.rotation.y = node.rotation;
      const color = node.color || "#b87946";
      addBox(group, 0, 1.28, 0, 2.32, 0.12, 0.58, color, { metalness: 0.1 });
      addBox(group, 0, 2.35, 0, 2.32, 0.12, 0.58, color, { metalness: 0.1 });
      addBox(group, 0, 0.25, 0, 2.32, 0.12, 0.58, color, { metalness: 0.1 });
      for (const x of [-1.1, 1.1]) addBox(group, x, 1.29, 0, 0.11, 2.28, 0.6, "#6f462c");
      group.userData.layoutId = node.id; shopRoot.add(group); layoutObjects.push(group);
      const ids = node.productIds.length ? node.productIds : [];
      const shelfProducts = ids.map(id => productById.get(id)).filter((product): product is CatalogProduct => Boolean(product)).slice(0, 12);
      shelfProducts.forEach((product, index) => {
        const shelfLevel = index < 4 ? 0.43 : index < 8 ? 1.45 : 2.52;
        const itemIndex = index % 4;
        const stockCount = stockRef.current[product.id];
        const clones = stockCount === undefined ? Math.max(1, Math.min(4, Math.floor(Number(node.copies) || 3))) : stockCount <= 0 ? 1 : Math.max(1, Math.min(10, Math.ceil(stockCount)));
        for (let copy = 0; copy < clones; copy++) {
          const slotX = -0.82 + itemIndex * 0.54;
          const rowX = (copy % 2) * 0.22 - 0.11;
          const rowZ = Math.floor(copy / 2) * 0.095;
          const x = node.x + (node.rotation ? -slotX + rowX : slotX + rowX);
          const z = node.z + (node.rotation ? -0.18 - rowZ : 0.18 + rowZ);
          const card = makeProductCard(node, product, x, shelfLevel, z, copy); shopRoot.add(card);
        }
        if (stockCount === 0) {
          const outTexture = makeCanvasLabel("نفد مؤقتاً", product.name.slice(0, 22), "#fee2e2");
          const out = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22), new THREE.MeshBasicMaterial({ map: outTexture, toneMapped: false }));
          out.position.set(node.x + (node.rotation ? 0.15 : -0.82 + itemIndex * 0.54), shelfLevel - 0.05, node.z + (node.rotation ? 0.36 : 0.06)); out.rotation.y = node.rotation; out.userData.productId = product.id; out.userData.layoutId = node.id; shopRoot.add(out); productObjects.push(out);
        }
      });
    };
    const addBulkVessel = (node: VirtualStoreNode) => {
      const vessel = new THREE.Group(); vessel.position.set(node.x, 0, node.z); vessel.rotation.y = node.rotation; vessel.userData.layoutId = node.id;
      if (node.kind === "barrel") {
        const color = node.color || "#0e7490";
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 1.35, 24), new THREE.MeshStandardMaterial({ color, metalness: 0.32, roughness: 0.43 })); drum.position.y = 0.72; drum.castShadow = true; vessel.add(drum);
        for (const y of [0.35, 0.7, 1.05]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 8, 24), new THREE.MeshStandardMaterial({ color: "#d9e1e4", metalness: 0.72, roughness: 0.28 })); rim.rotation.x = Math.PI / 2; rim.position.y = y; vessel.add(rim); }
        const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 10), new THREE.MeshStandardMaterial({ color: "#e5b53b", metalness: 0.65, roughness: 0.27 })); tap.rotation.z = Math.PI / 2; tap.position.set(0.47, 0.48, 0); vessel.add(tap);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: "#f4d66b", metalness: 0.6 })); handle.position.set(0.62, 0.65, 0); vessel.add(handle);
      } else {
        const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 0.95, 20, 1, true), new THREE.MeshStandardMaterial({ color: node.color || "#ccb089", side: THREE.DoubleSide, roughness: 0.98 })); sack.position.y = 0.5; sack.castShadow = true; vessel.add(sack);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 10, 24), new THREE.MeshStandardMaterial({ color: "#a0805c", roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.98; vessel.add(rim);
        const contents = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ color: "#f2dfad", side: THREE.DoubleSide, roughness: 0.88 })); contents.rotation.x = -Math.PI / 2; contents.position.y = 0.9; vessel.add(contents);
      }
      const label = node.productIds.map(id => productById.get(id)).find(Boolean);
      if (label) {
        const name = label.name.length > 19 ? `${label.name.slice(0, 17)}…` : label.name;
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.33), new THREE.MeshBasicMaterial({ map: makeCanvasLabel(name, `${bulkUnitPrice(label)} ج.م / كجم`, "#fef3c7"), toneMapped: false })); tag.position.set(0, 1.3, 0.48); tag.userData.productId = label.id; tag.userData.layoutId = node.id; vessel.add(tag); productObjects.push(tag);
      }
      shopRoot.add(vessel); layoutObjects.push(vessel);
      if (label) { const target = vessel; target.traverse(object => { object.userData.layoutId = node.id; }); }
    };
    layout.nodes.forEach(node => node.kind === "shelf" ? addShelf(node) : addBulkVessel(node));

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const onCanvasPointerDown = (event: PointerEvent) => { pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; };
    const onCanvasPointerMove = (event: PointerEvent) => {
      const current = pointerRef.current; if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x; const dy = event.clientY - current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
      cameraPose.current.yaw -= dx * 0.0042; cameraPose.current.pitch = clamp(cameraPose.current.pitch - dy * 0.003, -0.72, 0.65);
      current.x = event.clientX; current.y = event.clientY;
    };
    const onCanvasPointerUp = (event: PointerEvent) => {
      const current = pointerRef.current; pointerRef.current = null;
      if (!current || current.id !== event.pointerId || current.moved) return;
      const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(shopRoot.children, true).find(item => item.object.userData.productId || item.object.userData.layoutId);
      if (!hit) return;
      const object = hit.object;
      const productId = object.userData.productId as string | undefined;
      const layoutId = object.userData.layoutId as string | undefined;
      if (layoutId && managerMode) setSelectedNodeId(layoutId);
      if (productId) {
        const product = productById.get(productId);
        if (product) setSelectedProduct({ product });
      }
    };
    renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);
    renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);
    renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);
    renderer.domElement.addEventListener("pointercancel", onCanvasPointerUp);
    const resizeObserver = new ResizeObserver(() => { const w = host.clientWidth; const h = host.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); });
    resizeObserver.observe(host);
    const onKeyDown = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) keySet.current.add(event.key.toLowerCase()); };
    const onKeyUp = (event: KeyboardEvent) => keySet.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    let frame = 0; let running = true;
    const animate = (now: number) => {
      if (!running) return;
      frame = requestAnimationFrame(animate);
      const keys = keySet.current; const joy = joystickRef.current;
      const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - joy.y;
      const sideways = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + joy.x;
      const speed = 0.068; const yaw = cameraPose.current.yaw;
      camera.position.x += (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * speed;
      camera.position.z += (-Math.cos(yaw) * forward + Math.sin(yaw) * sideways) * speed;
      camera.position.x = clamp(camera.position.x, -4.15, 4.15); camera.position.z = clamp(camera.position.z, -9.7, 5.8);
      lastCameraPosition.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      camera.rotation.y = yaw; camera.rotation.x = cameraPose.current.pitch;
      seller.rotation.y = Math.sin(now / 1250) * 0.12;
      npcGroups.forEach((npc, index) => { npc.rotation.y = Math.sin(now / 960 + index * 2.4) * 0.18; npc.position.x += Math.sin(now / 2100 + index) * 0.0004; });
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      running = false; cancelAnimationFrame(frame); resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown); renderer.domElement.removeEventListener("pointermove", onCanvasPointerMove); renderer.domElement.removeEventListener("pointerup", onCanvasPointerUp); renderer.domElement.removeEventListener("pointercancel", onCanvasPointerUp);
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      cameraRef.current = null; scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); if (Array.isArray(mesh.material)) mesh.material.forEach(material => { (material as THREE.MeshStandardMaterial).map?.dispose(); material.dispose(); }); else if (mesh.material) { (mesh.material as THREE.MeshStandardMaterial).map?.dispose(); mesh.material.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [layout, products, productById, managerMode, stock]);

  const teleport = (name: "front" | "barrels" | "shelves" | "cashier") => {
    const camera = cameraRef.current; if (!camera) return;
    const positions = { front: [0, 4.7, 0], barrels: [0.15, -3.4, 0], shelves: [-0.9, -5.6, 1.18], cashier: [0, -7.25, 0] } as const;
    const [x, z, yaw] = positions[name]; camera.position.set(x, 1.62, z); lastCameraPosition.current = { x, y: 1.62, z }; cameraPose.current.yaw = yaw; cameraPose.current.pitch = 0;
  };

  const addProduct = (product: CatalogProduct) => {
    const inStock = stock[product.id];
    if (inStock === 0) { toast.error("هذا المنتج نفد مؤقتاً"); return; }
    if (isWeightCatalogProduct(product)) setSelectedProduct({ product, kilograms: 0.5 });
    else onAddToCart(product);
  };

  const addWeight = (kilograms: number) => {
    if (!selectedProduct || !Number.isFinite(kilograms) || kilograms <= 0) return;
    if (stock[selectedProduct.product.id] !== undefined && stock[selectedProduct.product.id] < kilograms) { toast.error("الكمية المتاحة أقل من الوزن المطلوب"); return; }
    onAddWeightToCart(selectedProduct.product, kilograms); setSelectedProduct(null);
  };

  const askSeller = (message: string) => {
    const cleaned = normalizeArabic(message);
    const product = [...products].sort((a, b) => b.name.length - a.name.length).find(item => cleaned.includes(normalizeArabic(item.name)) || normalizeArabic(item.name).split(/\s+/).some(word => word.length > 4 && cleaned.includes(word)));
    if (!product) { setVoiceReply("أقدر أساعدك بالسعر والتوفر. قل لي اسم الصنف زي ما هو ظاهر في الكتالوج، أو اسألني عن العروض."); return; }
    const price = bulkUnitPrice(product);
    const noStock = stock[product.id] === 0;
    const reply = `${product.name}: سعره ${price} جنيه ${isWeightCatalogProduct(product) ? "للكيلو" : `لـ ${product.unit || "الوحدة"}`}${noStock ? "، لكنه نفد مؤقتاً" : " ومتاح في الكتالوج"}. تحب أضيفه للسلة؟`;
    setVoiceReply(reply);
    if (/حط|ضيف|اضف|زود|السله|العربه|اشتري|هات/.test(cleaned) && !noStock) {
      const match = cleaned.match(/(100|١٠٠|250|٢٥٠|500|٥٠٠|750|٧٥٠|1000|١٠٠٠)\s*(جرام|غرام|جم)/);
      const kiloMatch = cleaned.match(/(0?\.\d+|\d+(?:\.\d+)?)\s*(كيلو|كجم|كغ)/);
      let kg: number | undefined;
      if (match) kg = Number(match[1].replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))) / 1000;
      else if (kiloMatch) kg = Number(kiloMatch[1].replace(/٠/g, "0"));
      if (kg && isWeightCatalogProduct(product)) onAddWeightToCart(product, kg); else if (!isWeightCatalogProduct(product)) onAddToCart(product);
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(reply); utterance.lang = "ar-EG"; utterance.rate = 0.94; utterance.pitch = 1.04; window.speechSynthesis.speak(utterance);
    }
  };

  const startVoice = () => {
    const w = window as any; const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) { toast.error("التعرّف الصوتي غير مدعوم في هذا المتصفح. استخدم خانة الكتابة."); return; }
    try {
      const recognition = new Recognition(); recognition.lang = "ar-EG"; recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => setVoiceActive(true); recognition.onerror = () => setVoiceActive(false); recognition.onend = () => setVoiceActive(false);
      recognition.onresult = (event: any) => { const transcript = String(event.results?.[0]?.[0]?.transcript || ""); setVoiceText(transcript); askSeller(transcript); };
      recognition.start();
    } catch { setVoiceActive(false); toast.error("تعذر تشغيل الميكروفون؛ تحقق من إذن المتصفح."); }
  };

  const addUnit = (kind: VirtualStoreNode["kind"]) => {
    const index = layout.nodes.filter(node => node.kind === kind).length;
    const node: VirtualStoreNode = { id: `${kind}-${Date.now().toString(36)}`, kind, x: clamp((index % 3 - 1) * 1.6, -3.8, 3.8), z: clamp(-2 - Math.floor(index / 3) * 1.7, -8.5, 1.6), rotation: kind === "shelf" ? 0 : 0, color: kind === "sack" ? COLORS[6] : COLORS[index % COLORS.length], productIds: activeProductId ? [activeProductId] : [], copies: 6 };
    changeLayout(prev => ({ ...prev, nodes: [...prev.nodes, node] })); setSelectedNodeId(node.id);
  };
  const shiftNode = (dx: number, dz: number) => { if (!selectedNodeId) return; changeLayout(prev => ({ ...prev, nodes: prev.nodes.map(node => node.id === selectedNodeId ? { ...node, x: clamp(node.x + dx, -4.25, 4.25), z: clamp(node.z + dz, -9, 2) } : node) })); };
  const rotateNode = () => { if (!selectedNodeId) return; changeLayout(prev => ({ ...prev, nodes: prev.nodes.map(node => node.id === selectedNodeId ? { ...node, rotation: node.rotation + Math.PI / 12 } : node) })); };
  const addProductToNode = () => { if (!selectedNodeId || !activeProductId) return; changeLayout(prev => ({ ...prev, nodes: prev.nodes.map(node => node.id !== selectedNodeId ? node : node.kind === "shelf" ? { ...node, productIds: Array.from(new Set([...node.productIds, activeProductId])).slice(0, 12), copies: clamp(Number(displayCopies) || 6, 1, 20) } : { ...node, productIds: [activeProductId], copies: clamp(Number(displayCopies) || 6, 1, 20) }) })); };
  const fillNode = () => { if (!selectedNodeId) return; changeLayout(prev => ({ ...prev, nodes: prev.nodes.map(node => node.id === selectedNodeId && node.kind === "shelf" ? { ...node, productIds: products.slice(0, 12).map(product => product.id), copies: 8 } : node) })); };
  const removeNode = () => { if (!selectedNodeId) return; changeLayout(prev => ({ ...prev, nodes: prev.nodes.filter(node => node.id !== selectedNodeId) })); setSelectedNodeId(""); };
  const selectProductForNode = (product: CatalogProduct) => { setActiveProductId(product.id); setSelectedProduct({ product }); };

  return <main dir="rtl" className="min-h-[calc(100vh-1rem)] bg-[#111b29] p-2 text-white sm:p-4">
    <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#162337] shadow-2xl">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#111b29] px-3 py-3 sm:px-5">
        <Button type="button" variant="ghost" onClick={onBackToCatalog} className="min-h-11 text-white hover:bg-white/10"><ChevronRight className="ml-1 h-4 w-4" />عرض القائمة</Button>
        <div className="min-w-0 flex-1"><p className="text-xs font-black text-orange-300">جولة تفاعلية · أبو رغوة</p><h1 className="truncate text-base font-black sm:text-lg">تجول داخل المحل 3D</h1></div>
        {cartCount > 0 && <Button type="button" onClick={onOpenCart} className="min-h-11 bg-orange-500 font-black hover:bg-orange-400"><ShoppingBag className="ml-2 h-4 w-4" />السلة · {cartCount}</Button>}
        {isManager && <Button type="button" aria-pressed={managerMode} onClick={() => { setManagerMode(value => !value); setSelectedNodeId(""); }} variant={managerMode ? "default" : "outline"} className={managerMode ? "min-h-11 bg-emerald-600 font-black" : "min-h-11 border-white/20 bg-transparent text-white font-black hover:bg-white/10"}><Boxes className="ml-2 h-4 w-4" />{managerMode ? "إنهاء الترتيب" : "وضع ترتيب المحل والرص والتعبئة"}</Button>}
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative h-[min(76vh,760px)] min-h-[520px] overflow-hidden bg-[#9ad4ee]" ref={canvasHost} aria-label="مشهد محل أبو رغوة ثلاثي الأبعاد">
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-xs font-black text-slate-900 shadow-lg">اسحب الشاشة للالتفات · حرّك العصا للدخول</div>
          {stockError && <div className="absolute right-3 top-3 z-10 rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">الأرصدة الحية غير متاحة حالياً</div>}
          <div className="absolute bottom-3 left-3 z-10 grid grid-cols-2 gap-1 rounded-2xl border border-white/70 bg-white/85 p-1.5 shadow-lg" aria-label="تنقل سريع داخل المحل">
            <button type="button" onClick={() => teleport("front")} className="min-h-10 rounded-xl px-2 text-[11px] font-black text-slate-900 hover:bg-orange-100">الواجهة</button>
            <button type="button" onClick={() => teleport("barrels")} className="min-h-10 rounded-xl px-2 text-[11px] font-black text-slate-900 hover:bg-orange-100">السائب</button>
            <button type="button" onClick={() => teleport("shelves")} className="min-h-10 rounded-xl px-2 text-[11px] font-black text-slate-900 hover:bg-orange-100">الأرفف</button>
            <button type="button" onClick={() => teleport("cashier")} className="min-h-10 rounded-xl px-2 text-[11px] font-black text-slate-900 hover:bg-orange-100">الكاشير</button>
          </div>
          <div className="absolute bottom-5 right-5 z-10 touch-none" onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); joystickRef.current = { x: clamp((event.clientX - rect.left - rect.width / 2) / 30, -1, 1), y: clamp((event.clientY - rect.top - rect.height / 2) / 30, -1, 1) }; }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); joystickRef.current = { x: clamp((event.clientX - rect.left - rect.width / 2) / 30, -1, 1), y: clamp((event.clientY - rect.top - rect.height / 2) / 30, -1, 1) }; }} onPointerUp={event => { joystickRef.current = { x: 0, y: 0 }; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { joystickRef.current = { x: 0, y: 0 }; }}>
            <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-white/80 bg-slate-900/45 shadow-xl backdrop-blur-sm"><div className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-slate-900"><ArrowUp className="h-5 w-5" /></div></div>
          </div>
          {managerMode && <div className="absolute left-1/2 top-3 z-20 flex max-w-[90%] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-emerald-200/70 bg-slate-950/85 p-2 shadow-xl">
            <Button type="button" size="sm" onClick={() => addUnit("shelf")} className="min-h-10 bg-emerald-600 font-bold">+ بناء رف</Button><Button type="button" size="sm" onClick={() => addUnit("barrel")} className="min-h-10 bg-cyan-700 font-bold">+ برميل سايب</Button><Button type="button" size="sm" onClick={() => addUnit("sack")} className="min-h-10 bg-amber-700 font-bold">+ شيكارة</Button>
            <Button type="button" aria-label="تحريك الوحدة لليسار" size="icon" onClick={() => shiftNode(-0.35, 0)} className="h-10 w-10 bg-white/15"><ArrowLeft className="h-4 w-4" /></Button><Button type="button" aria-label="تحريك الوحدة للأعلى" size="icon" onClick={() => shiftNode(0, -0.35)} className="h-10 w-10 bg-white/15"><ArrowUp className="h-4 w-4" /></Button><Button type="button" aria-label="تحريك الوحدة للأسفل" size="icon" onClick={() => shiftNode(0, 0.35)} className="h-10 w-10 bg-white/15"><ArrowDown className="h-4 w-4" /></Button><Button type="button" aria-label="تحريك الوحدة لليمين" size="icon" onClick={() => shiftNode(0.35, 0)} className="h-10 w-10 bg-white/15"><ArrowRight className="h-4 w-4" /></Button><Button type="button" aria-label="تدوير الوحدة المحددة" size="icon" onClick={rotateNode} disabled={!selectedNode} className="h-10 w-10 bg-white/15"><RotateCw className="h-4 w-4" /></Button><Button type="button" aria-label="حذف الوحدة المحددة" size="icon" onClick={removeNode} disabled={!selectedNode} className="h-10 w-10 bg-red-700"><Trash2 className="h-4 w-4" /></Button>
          </div>}
        </div>
        <aside className="flex max-h-[760px] flex-col gap-3 overflow-y-auto border-t border-white/10 bg-[#162337] p-3 sm:p-4 lg:border-r lg:border-t-0" aria-label="معلومات المتجر الافتراضي">
          <div className="rounded-2xl border border-orange-300/20 bg-gradient-to-br from-orange-500/20 to-amber-200/5 p-3"><p className="flex items-center gap-2 text-sm font-black"><AudioLines className="h-4 w-4 text-orange-300" />أبو رغوة · بائع المحل</p><p className="mt-2 text-xs leading-6 text-slate-200">{voiceReply}</p></div>
          <div className="flex gap-2"><Button type="button" onClick={startVoice} disabled={voiceActive} className="min-h-12 flex-1 bg-orange-500 font-black hover:bg-orange-400">{voiceActive ? <><AudioLines className="ml-2 h-4 w-4 animate-pulse" />أسمعك...</> : <><Mic className="ml-2 h-4 w-4" />تحدث مع البائع</>}</Button><Button type="button" variant="outline" aria-label="كتم الصوت" onClick={() => window.speechSynthesis?.cancel()} className="min-h-12 border-white/20 bg-transparent text-white hover:bg-white/10"><Volume2 className="h-4 w-4" /></Button></div>
          <form onSubmit={event => { event.preventDefault(); if (voiceText.trim()) askSeller(voiceText); }} className="flex gap-2"><Input value={voiceText} onChange={event => setVoiceText(event.target.value)} placeholder="مثال: حط لي نص كيلو زهرة في السلة" className="min-h-11 border-white/15 bg-white/5 text-white placeholder:text-slate-400" /><Button type="submit" variant="secondary" className="min-h-11">اسأل</Button></form>
          {managerMode && <section className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-3"><h2 className="text-sm font-black text-emerald-200">تعديل الرصّ · {selectedNode ? selectedNode.kind === "shelf" ? "رف" : selectedNode.kind === "barrel" ? "برميل" : "شيكارة" : "اختر قطعة من المشهد"}</h2><label className="block text-xs font-bold text-slate-200">الصنف الحقيقي<select value={activeProductId} onChange={event => setActiveProductId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#1d2c41] px-3 text-white"><option value="">اختر منتجاً</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {bulkUnitPrice(product)} ج.م</option>)}</select></label><div className="flex gap-2"><Input type="number" min="1" max="20" value={displayCopies} onChange={event => setDisplayCopies(event.target.value)} className="min-h-11 border-white/15 bg-white/5 text-white" aria-label="عدد النسخ المعروضة" /><Button type="button" onClick={addProductToNode} disabled={!selectedNode || !activeProductId} className="min-h-11 flex-1 bg-emerald-600 font-bold">ربط الصنف بالرصة</Button></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={fillNode} disabled={!selectedNode || selectedNode.kind !== "shelf"} className="min-h-10 flex-1 border-white/15 bg-transparent text-white">ملء الرف تلقائياً</Button><span className="flex items-center rounded-xl border border-white/10 px-2 text-[10px] text-emerald-200">حفظ سحابي تلقائي</span></div></section>}
          <div className="flex items-center justify-between"><h2 className="text-sm font-black">منتجات المحل</h2><span className="text-[11px] text-slate-400">{products.length} صنف</span></div>
          <div className="grid grid-cols-2 gap-2">{products.slice(0, 12).map(product => { const available = stock[product.id]; return <button type="button" key={product.id} onClick={() => selectProductForNode(product)} className="relative min-h-24 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2 text-right transition hover:border-orange-300/60 hover:bg-white/10"><span className="absolute left-1 top-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-black text-orange-200">{bulkUnitPrice(product)} ج.م</span>{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" loading="lazy" className="mb-1 h-12 w-full rounded-lg object-contain" /> : <span className="mb-1 grid h-12 place-items-center rounded-lg bg-white/5"><Package className="h-6 w-6 text-orange-300" /></span>}<span className="block line-clamp-2 text-[10px] font-bold leading-4">{product.name}</span><span className={`mt-1 block text-[9px] font-black ${available === 0 ? "text-red-300" : "text-emerald-300"}`}>{available === 0 ? "نفد مؤقتاً" : available === undefined ? "متوفر" : `متوفر · ${available}`}</span></button>; })}</div>
          <p className="flex items-start gap-1.5 text-[10px] leading-5 text-slate-400"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />حرّك بالعصا أو أزرار الأسهم، واسحب المشهد لتغيير اتجاه النظر. لمس المنتج يفتح السعر والشراء.</p>
        </aside>
      </div>
    </div>
    {selectedProduct && <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-3 sm:place-items-center" onClick={() => setSelectedProduct(null)}><section role="dialog" aria-modal="true" aria-label={`تفاصيل ${selectedProduct.product.name}`} onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl" dir="rtl"><div className="flex items-start justify-between gap-3"><div className="flex gap-3">{selectedProduct.product.catalogImageUrl ? <img src={selectedProduct.product.catalogImageUrl} alt="" className="h-20 w-20 rounded-2xl bg-orange-50 object-contain" /> : <span className="grid h-20 w-20 place-items-center rounded-2xl bg-orange-50"><Package className="h-8 w-8 text-orange-500" /></span>}<div><p className="font-black">{selectedProduct.product.name}</p><p className="mt-1 text-sm font-black text-orange-700">{bulkUnitPrice(selectedProduct.product)} ج.م {isWeightCatalogProduct(selectedProduct.product) ? "/ كجم" : `/ ${selectedProduct.product.unit || "وحدة"}`}</p><p className="mt-1 text-xs text-slate-500">{stock[selectedProduct.product.id] === 0 ? "نفد مؤقتاً" : stock[selectedProduct.product.id] === undefined ? "التوفر قيد التحقق" : `متاح: ${stock[selectedProduct.product.id]} ${selectedProduct.product.unit || "وحدة"}`}</p></div></div><button type="button" onClick={() => setSelectedProduct(null)} aria-label="إغلاق" className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      {isWeightCatalogProduct(selectedProduct.product) && <div className="mt-4"><p className="mb-2 text-xs font-black text-slate-700">اختر الوزن</p><div className="grid grid-cols-3 gap-2">{[[0.1, "100 جرام"], [0.25, "ربع كيلو"], [0.5, "نصف كيلو"], [0.75, "750 جرام"], [1, "1 كيلو"], [2, "2 كيلو"]].map(([kg, label]) => <button type="button" key={label} onClick={() => addWeight(Number(kg))} className="min-h-11 rounded-xl border border-orange-200 bg-orange-50 text-xs font-black text-orange-900 hover:bg-orange-100">{label}<span className="block text-[10px]">{(Number(kg) * bulkUnitPrice(selectedProduct.product)).toFixed(2)} ج.م</span></button>)}</div><div className="mt-3 grid grid-cols-3 gap-2">{[5, 10, 20].map(amount => <button type="button" key={amount} onClick={() => { const kg = catalogMoneyToKilograms(amount, bulkUnitPrice(selectedProduct.product)); if (kg) addWeight(kg); }} className="min-h-10 rounded-xl border border-slate-200 text-xs font-black">بـ {amount} جنيه</button>)}</div><CustomWeight onAdd={addWeight} /></div>}
      {!isWeightCatalogProduct(selectedProduct.product) && <Button type="button" onClick={() => { onAddToCart(selectedProduct.product); setSelectedProduct(null); }} disabled={stock[selectedProduct.product.id] === 0} className="mt-4 min-h-12 w-full bg-orange-600 font-black hover:bg-orange-700"><ShoppingBag className="ml-2 h-4 w-4" />أضف للسلة</Button>}
    </section></div>}
  </main>;
}

function CustomWeight({ onAdd }: { onAdd: (kilograms: number) => void }) {
  const [amount, setAmount] = useState(""); const [unit, setUnit] = useState<"kg" | "g">("g");
  const submit = (event: React.FormEvent) => { event.preventDefault(); const kilograms = toCatalogKilograms(Number(amount), unit); if (!kilograms) return; onAdd(kilograms); setAmount(""); };
  return <form onSubmit={submit} className="mt-3 flex gap-2"><Input type="number" min="1" step="any" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="وزن مخصص" aria-label="وزن مخصص" /><select value={unit} onChange={event => setUnit(event.target.value as "kg" | "g")} aria-label="وحدة الوزن" className="rounded-xl border border-slate-200 bg-white px-2 text-sm"><option value="g">جرام</option><option value="kg">كيلو</option></select><Button type="submit" className="bg-slate-900">أضف الوزن</Button></form>;
}
