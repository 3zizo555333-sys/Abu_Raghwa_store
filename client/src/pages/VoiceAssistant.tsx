import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff, Volume2, Navigation, Search, Layers, ShoppingBag, Package, Sparkles, AlertTriangle, Edit2, Trash2, Save } from "lucide-react";
import { useCloudState } from "@/lib/cloudSync";
import { findCustomVoiceCommand, getVoiceAction, resolveCustomVoiceInstruction, VOICE_COMMAND_ACTIONS, type CustomVoiceCommand, type VoiceCommandAction } from "@/lib/customVoiceCommands";
import { listProductsPage } from "@/lib/supabase/products";

export default function VoiceAssistant() {
  const [, navigate] = useLocation();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const recognitionRef = useRef<any>(null);
  const listeningStartTimerRef = useRef<number | null>(null);
  const [customCommands, setCustomCommands] = useCloudState<CustomVoiceCommand[]>("abu_raghwa_custom_voice_commands", []);
  const [commandPhrase, setCommandPhrase] = useState("");
  const [commandAction, setCommandAction] = useState<VoiceCommandAction>("understand_text");
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);

  useEffect(() => {
    initializeVoiceRecognition();
  }, []);

  useEffect(() => {
    if (!response) return;
    const timeout = window.setTimeout(() => setResponse(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [response]);

  const initializeVoiceRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = "ar-EG";
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => {
        if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
        setIsListening(true);
        setTranscript("");
        setResponse("جاري الاستماع... اتكلم براحتك الآن.");
        playListeningTone();
      };

      recognitionRef.current.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          const text = event.results[i][0].transcript.trim();
          if (!text) continue;
          setTranscript(text);
          setResponse("تم سماع كلامك، جاري تنفيذ الأمر...");
          processCommand(text);
          try {
            recognitionRef.current?.stop();
          } catch {
            // انتهت جلسة الاستماع بالفعل.
          }
          break;
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === "no-speech") {
          setResponse("لم يصل صوت هذه المرة. اضغط الميكروفون وتكلم بعد ظهور «جاري الاستماع».");
        } else if (event.error === "aborted") {
          setResponse("تم إيقاف الاستماع.");
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setResponse("التطبيق لم يحصل على إذن الميكروفون الآن. اضغط الزر مرة أخرى من داخل التطبيق.");
        } else {
          setResponse("تعذر تشغيل الميكروفون الآن. أعد المحاولة بعد لحظات.");
        }
      };

      recognitionRef.current.onend = () => {
        if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
        setIsListening(false);
      };
    }
  };

  const playListeningTone = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.04, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => void context.close();
    } catch {
      // الرنة اختيارية ولا تمنع الاستماع إن لم يدعمها الجهاز.
    }
  };

  const searchCloudProduct = async (searchTerm: string) => {
    try {
      const page = await listProductsPage({ search: searchTerm, limit: 10 });
      const normalized = searchTerm.toLocaleLowerCase("ar-EG");
      const found = page.items.find(product => product.name.toLocaleLowerCase("ar-EG").includes(normalized)) ?? page.items[0];
      const message = found
        ? `وجدت المنتج ${found.name}. سعره ${found.retailPrice} جنيه. الكمية المتوفرة: ${found.quantity}`
        : `عذراً، لم أجد منتج باسم ${searchTerm} في سجل المنتجات السحابي`;
      setResponse(message);
      speak(message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر البحث في منتجات Supabase الآن.";
      setResponse(message);
      speak(message);
    }
  };

  const processCommand = (command: string) => {
    const cmd = command.toLowerCase().trim();
    let resMsg = "";

    const customCommand = findCustomVoiceCommand(command, customCommands);
    if (customCommand) {
      const instruction = resolveCustomVoiceInstruction(customCommand);
      resMsg = instruction.response;
      speak(resMsg);
      setResponse(resMsg);
      if (instruction.kind === "back") window.history.back();
      else if (instruction.kind === "exit") setTimeout(() => navigate(instruction.route || "/"), 700);
      else if (instruction.kind === "navigate" || instruction.kind === "search") setTimeout(() => navigate(instruction.route || "/dashboard"), 700);
      return;
    }

    // 1. أوامر فتح الصفحات والتنقل الشامل
    if (cmd.includes("افتح المنتجات") || cmd.includes("قائمة المنتجات") || cmd.includes("صفحة المنتجات")) {
      resMsg = "جاري فتح صفحة إدارة المنتجات...";
      speak(resMsg);
      setTimeout(() => navigate("/products"), 1000);
    }
    else if (cmd.includes("افتح التركيبات") || cmd.includes("التركيبات") || cmd.includes("صفحة التركيبات")) {
      resMsg = "جاري فتح صفحة التركيبات...";
      speak(resMsg);
      setTimeout(() => navigate("/recipes"), 1000);
    }
    else if (cmd.includes("افتح الخامات") || cmd.includes("الخامات") || cmd.includes("صفحة الخامات")) {
      resMsg = "جاري فتح صفحة الخامات...";
      speak(resMsg);
      setTimeout(() => navigate("/raw-materials"), 1000);
    }
    else if (cmd.includes("افتح المبيعات") || cmd.includes("تسجيل مبيعة") || cmd.includes("المبيعات")) {
      resMsg = "جاري فتح صفحة تسجيل المبيعات...";
      speak(resMsg);
      setTimeout(() => navigate("/sales"), 1000);
    }
    else if (cmd.includes("افتح العروض") || cmd.includes("العروض الذكية") || cmd.includes("عروض")) {
      resMsg = "جاري فتح صفحة العروض الذكية...";
      speak(resMsg);
      setTimeout(() => navigate("/smart-offers"), 1000);
    }
    else if (cmd.includes("افتح النواقص") || cmd.includes("النواقص") || cmd.includes("نواقص أبو رغوة")) {
      resMsg = "جاري فتح صفحة نواقص أبو رغوة...";
      speak(resMsg);
      setTimeout(() => navigate("/shortages"), 1000);
    }
    else if (cmd.includes("افتح التقارير") || cmd.includes("التقارير") || cmd.includes("التقرير")) {
      resMsg = "جاري فتح صفحة التقارير...";
      speak(resMsg);
      setTimeout(() => navigate("/reports"), 1000);
    }
    else if (cmd.includes("افتح لوحة التحكم") || cmd.includes("الرئيسية") || cmd.includes("لوحة التحكم")) {
      resMsg = "جاري فتح لوحة التحكم الرئيسية...";
      speak(resMsg);
      setTimeout(() => navigate("/dashboard"), 1000);
    }
    else if (cmd.includes("العودة") || cmd.includes("ارجع للخلف") || cmd.includes("رجوع")) {
      resMsg = "جاري العودة للصفحة السابقة...";
      speak(resMsg);
      window.history.back();
    }
    // 2. أمر البحث عن منتج بالاسم
    else if (cmd.includes("ابحث عن") || cmd.includes("بحث عن") || cmd.includes("وين منتج")) {
      const searchTerm = cmd.replace("ابحث عن", "").replace("بحث عن", "").replace("وين منتج", "").trim();
      if (searchTerm) void searchCloudProduct(searchTerm);
      return;
    }
    // 3. المساعدة والأوامر العامة
    else if (cmd.includes("مساعدة") || cmd.includes("الأوامر المتاحة")) {
      resMsg = "يمكنك قول: افتح المنتجات، افتح التركيبات، افتح الخامات، افتح المبيعات، افتح العروض، افتح النواقص، أو ابحث عن [اسم المنتج]";
      speak(resMsg);
    }
    else {
      resMsg = `عذراً، لم أفهم الأمر: "${command}". قل "مساعدة" لمعرفة الأوامر المتاحة`;
      speak(resMsg);
    }

    setResponse(resMsg);
  };

  const resetCustomCommandForm = () => {
    setCommandPhrase("");
    setCommandAction("understand_text");
    setEditingCommandId(null);
  };

  const saveCustomCommand = () => {
    const phrase = commandPhrase.trim();
    if (phrase.length < 3) {
      toast.error("اكتب جملة صوتية واضحة من 3 حروف على الأقل");
      return;
    }
    const duplicate = customCommands.find(command => command.phrase.trim().toLowerCase() === phrase.toLowerCase() && command.id !== editingCommandId);
    if (duplicate) {
      toast.error("هذه الجملة محفوظة بالفعل. عدّلها أو اختر جملة مختلفة.");
      return;
    }
    const record: CustomVoiceCommand = { id: editingCommandId || `voice-${Date.now()}`, phrase, action: commandAction, createdAt: new Date().toISOString() };
    setCustomCommands(editingCommandId ? customCommands.map(command => command.id === editingCommandId ? record : command) : [...customCommands, record]);
    toast.success(editingCommandId ? "تم تعديل الأمر الصوتي" : "تم حفظ الأمر الصوتي");
    resetCustomCommandForm();
  };

  const editCustomCommand = (command: CustomVoiceCommand) => {
    setEditingCommandId(command.id);
    setCommandPhrase(command.phrase);
    setCommandAction(command.action);
  };

  const deleteCustomCommand = (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الأمر الصوتي؟")) return;
    setCustomCommands(customCommands.filter(command => command.id !== id));
    if (editingCommandId === id) resetCustomCommandForm();
    toast.success("تم حذف الأمر الصوتي");
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-EG";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        setTranscript("");
        setResponse("جار تجهيز الميكروفون...");
        setIsListening(false);
        if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
        listeningStartTimerRef.current = window.setTimeout(() => {
          setIsListening(false);
          setResponse("لم يبدأ الاستماع هذه المرة. اضغط الميكروفون مرة واحدة وانتظر الرنة قبل الكلام.");
        }, 3000);
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
        setResponse("تعذر بدء الميكروفون الآن. انتظر لحظة ثم اضغط مرة واحدة مرة أخرى.");
      }
    } else {
      setResponse("التعرف الصوتي غير جاهز داخل التطبيق الآن. أعد فتح الصفحة وحاول مرة أخرى.");
    }
  };

  const stopListening = () => {
    if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <header className="bg-white shadow-sm mb-6 rounded-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🎤 نظام الأوامر الصوتية الشامل</h1>
            <p className="text-gray-600 text-sm mt-0.5">تحكم كامل بالتطبيق عبر الصوت (تنقل وبحث وإدارة)</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة للوحة التحكم
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        {/* Voice Trigger Card */}
        <Card className="border-0 shadow-md bg-white text-center p-6">
          <CardHeader>
            <CardTitle className="text-xl text-gray-800">اضغط على الميكروفون وتحدث بصوت واضح</CardTitle>
            <CardDescription>التطبيق يفهم الأوامر العربية للتنقل السريع بين الأقسام</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse scale-110"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-500">حالة الاستماع:</p>
              <p className="text-lg font-bold text-blue-600 mt-1">
                {isListening ? "جاري الاستماع الآن... تحدث بالأمر الصوتي" : "الميكروفون متوقف - اضغط للبدء"}
              </p>
            </div>

            {transcript && (
              <div className="bg-gray-50 p-3 rounded-lg border text-sm">
                <span className="font-bold text-gray-700">الأمر المنطوق: </span>
                <span className="text-blue-700 font-medium">"{transcript}"</span>
              </div>
            )}

            {response && (
              <div className="fixed bottom-24 right-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white p-4 text-sm text-blue-900 shadow-2xl animate-in fade-in slide-in-from-bottom-3">
                <Volume2 className="w-5 h-5 text-blue-600 shrink-0" />
                <span>{response}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Commands Guide Card */}
        <Card className="border-0 shadow-md bg-white p-6">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg text-gray-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              دليل الأوامر الصوتية الجاهزة (انطقها تماماً كما هي مكتوبة)
            </CardTitle>
            <CardDescription>تمت برمجة التطبيق للاستجابة الفورية لهذه الصيغ المكتوبة</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border space-y-2">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-600" /> أوامر التنقل بين الصفحات:
                </h4>
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside pr-2">
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح المنتجات»</span> (للانتقال لإدارة المنتجات)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح التركيبات»</span> (للانتقال لقائمة التركيبات)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح الخامات»</span> (للانتقال للمواد الخام)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح المبيعات»</span> (لتسجيل مبيعة جديدة)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح العروض»</span> (لصفحة العروض الذكية)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح النواقص»</span> (لصفحة نواقص أبو رغوة)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح التقارير»</span> (لعرض التقارير والإيرادات)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-blue-700">«افتح لوحة التحكم»</span> (للعودة للرئيسية)</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border space-y-2">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                  <Search className="w-4 h-4 text-green-600" /> أوامر البحث والاستعلام:
                </h4>
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside pr-2">
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-green-700">«ابحث عن [اسم المنتج]»</span> (مثل: ابحث عن اوكسي)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-green-700">«الرجوع / رجوع»</span> (للعودة للصفحة السابقة)</li>
                  <li><span className="bg-white px-2 py-0.5 rounded border font-mono text-xs font-bold text-green-700">«مساعدة»</span> (لسماع قائمة الأوامر المتاحة)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-white p-6">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg text-gray-800 flex items-center gap-2"><Mic className="w-5 h-5 text-indigo-600" /> أوامري الصوتية المخصصة</CardTitle>
            <CardDescription>اكتب الجملة الطبيعية التي ستنطقها، والتطبيق يفهم معناها مثل الفواتير أو البحث أو الرجوع.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input value={commandPhrase} onChange={(event) => setCommandPhrase(event.target.value)} placeholder="مثال: افتح صفحة الفواتير أو ابحث عن منتج أوكسي" dir="rtl" />
              <select value={commandAction} onChange={(event) => setCommandAction(event.target.value as VoiceCommandAction)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                {VOICE_COMMAND_ACTIONS.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}
              </select>
              <Button type="button" onClick={saveCustomCommand} className="bg-indigo-600 hover:bg-indigo-700"><Save className="ml-1 h-4 w-4" /> {editingCommandId ? "حفظ التعديل" : "حفظ الأمر"}</Button>
            </div>
            {editingCommandId && <Button type="button" variant="outline" onClick={resetCustomCommandForm}>إلغاء التعديل</Button>}
            {customCommands.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">لا توجد أوامر مخصصة بعد. اكتب جملة مثل «افتح البيع السريع» واحفظها.</p> : <div className="space-y-2">{customCommands.map(command => {
              const action = getVoiceAction(command.action);
              return <div key={command.id} className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">«{command.phrase}»</p><p className="mt-1 text-xs text-slate-600">ينفذ: {command.action === "understand_text" ? "يفهم الجملة تلقائيًا" : action?.label || "إجراء غير معروف"}</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => editCustomCommand(command)}><Edit2 className="ml-1 h-4 w-4" /> تعديل</Button><Button type="button" size="sm" variant="outline" onClick={() => deleteCustomCommand(command.id)} className="border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="ml-1 h-4 w-4" /> حذف</Button></div></div>;
            })}</div>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
