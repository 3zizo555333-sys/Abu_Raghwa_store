import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Mic, MicOff, Volume2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCloudState } from "@/lib/cloudSync";
import { findCustomVoiceCommand, resolveCustomVoiceInstruction, type CustomVoiceCommand } from "@/lib/customVoiceCommands";
import { clampFloatingPosition, type FloatingPosition } from "@/lib/floatingPosition";

interface VoiceCommandHandlerProps {
  onCommand?: (command: string) => void;
  enabled?: boolean;
}

export default function VoiceCommandHandler({ onCommand, enabled = true }: VoiceCommandHandlerProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const recognitionRef = useRef<any>(null);
  const receivedFinalSpeechRef = useRef(false);
  const listeningStartTimerRef = useRef<number | null>(null);
  const [customCommands] = useCloudState<CustomVoiceCommand[]>("abu_raghwa_custom_voice_commands", []);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>(() => {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    const saved = window.localStorage.getItem("abu_raghwa_voice_button_position");
    if (!saved) return { x: Math.max(16, window.innerWidth - 72), y: Math.max(16, window.innerHeight - 88) };
    try {
      const parsed = JSON.parse(saved) as FloatingPosition;
      return clampFloatingPosition(parsed, window.innerWidth, window.innerHeight);
    } catch {
      return { x: Math.max(16, window.innerWidth - 72), y: Math.max(16, window.innerHeight - 88) };
    }
  });
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setFloatingPosition(current => {
        const next = clampFloatingPosition(current, window.innerWidth, window.innerHeight);
        window.localStorage.setItem("abu_raghwa_voice_button_position", JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("متصفحك لا يدعم التحكم الصوتي");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG"; // اللهجة المصرية والعربية الطبيعية
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
      setIsListening(true);
      setError(null);
      setTranscript("");
      setStatusMessage("جاري الاستماع... اتكلم براحتك الآن.");
      receivedFinalSpeechRef.current = false;
      playListeningTone();
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          const finalText = text.trim();
          if (!finalText || receivedFinalSpeechRef.current) continue;
          receivedFinalSpeechRef.current = true;
          setTranscript(finalText);
          setStatusMessage("تم سماع كلامك، جاري تنفيذ الأمر...");
          processColloquialCommand(finalText);
          try {
            recognition.stop();
          } catch {
            // انتهت جلسة الاستماع بالفعل.
          }
        } else {
          interimTranscript += text;
        }
      }

      if (interimTranscript) {
        setTranscript(interimTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === "no-speech") {
        setError(null);
        setStatusMessage("لم يصل صوت هذه المرة. اضغط الميكروفون وتكلم بعد ظهور «جاري الاستماع».");
        return;
      }
      if (event.error === "aborted") {
        setError(null);
        setStatusMessage("تم إيقاف الاستماع.");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("التطبيق لم يحصل على إذن الميكروفون الآن. اضغط الزر مرة أخرى من داخل التطبيق.");
        return;
      }
      setError("تعذر تشغيل الميكروفون الآن. أعد المحاولة بعد لحظات.");
    };

    recognition.onend = () => {
      if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [enabled, customCommands]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = window.setTimeout(() => setStatusMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

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

  // محلل ذكي متطور يفهم العامية المصرية والطبيعية بكافة أشكالها
  const processColloquialCommand = (rawText: string) => {
    const text = rawText.trim().toLowerCase();
    console.log("🎤 أمر صوتي مستلم (عامية):", text);

    const customCommand = findCustomVoiceCommand(rawText, customCommands);
    if (customCommand) {
      const instruction = resolveCustomVoiceInstruction(customCommand);
      toast.success(`🎤 ${instruction.response}`);
      if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(instruction.response));
      if (instruction.kind === "back") window.history.back();
      else if (instruction.kind === "exit") window.location.href = instruction.route || "/";
      else if (instruction.kind === "navigate" || instruction.kind === "search") window.location.href = instruction.route || "/dashboard";
      else setError(instruction.response);
      return;
    }

    // 1. التنقل بين أقسام التطبيق الشاملة بالعامية
    if (
      text.includes("منتجات") || text.includes("بضاعة") || text.includes("أصناف") || text.includes("البضايع")
    ) {
      if (text.includes("اضافة") || text.includes("جديد") || text.includes("زود")) {
        toast.success("🎤 جاري فتح صفحة المنتجات لإضافة صنف جديد...");
        window.location.href = "/products";
        return;
      }
      toast.success("🎤 فتح صفحة المنتجات...");
      window.location.href = "/products";
      return;
    }

    if (
      text.includes("تركيبة") || text.includes("تركيبات") || text.includes("خلطة") || text.includes("خلطات")
    ) {
      toast.success("🎤 فتح صفحة التركيبات...");
      window.location.href = "/recipes";
      return;
    }

    if (
      text.includes("خامة") || text.includes("خامات") || text.includes("مواد خام") || text.includes("سيلوفان") || text.includes("برميل")
    ) {
      toast.success("🎤 فتح صفحة الخامات...");
      window.location.href = "/raw-materials";
      return;
    }

    if (
      text.includes("مبيعة") || text.includes("بيع") || text.includes("فاتورة جديدة") || text.includes("اكتب بيعة") || text.includes("سجل بيعة")
    ) {
      toast.success("🎤 فتح صفحة تسجيل المبيعات...");
      window.location.href = "/sales";
      return;
    }

    if (
      text.includes("عروض") || text.includes("عرض") || text.includes("عجلة")
    ) {
      toast.success("🎤 فتح صفحة العروض الذكية...");
      window.location.href = "/smart-offers";
      return;
    }

    if (
      text.includes("نواقص") || text.includes("ناقص") || text.includes("خلصت") || text.includes("مخلصين")
    ) {
      toast.success("🎤 فتح صفحة نواقص أبو رغوة...");
      window.location.href = "/shortages";
      return;
    }

    if (
      text.includes("أمان") || text.includes("حماية") || text.includes("باسوورد") || text.includes("كلمة مرور") || text.includes("صلاحيات")
    ) {
      toast.success("🎤 فتح صفحة إدارة الأمان...");
      window.location.href = "/security-settings";
      return;
    }

    if (
      text.includes("شقة") || text.includes("إيجار") || text.includes("شقق")
    ) {
      toast.success("🎤 فتح صفحة إدارة الشقق...");
      window.location.href = "/apartment-management";
      return;
    }

    if (
      text.includes("تقرير") || text.includes("تقارير") || text.includes("أرباح") || text.includes("إيرادات")
    ) {
      toast.success("🎤 فتح صفحة التقارير...");
      window.location.href = "/reports";
      return;
    }

    if (
      text.includes("رئيسية") || text.includes("لوحة التحكم") || text.includes("البيت") || text.includes("الهوم") || text.includes("ابدا من الاول")
    ) {
      toast.success("🎤 الانتقال للوحة التحكم الرئيسية...");
      window.location.href = "/dashboard";
      return;
    }

    // 2. أوامر البحث الذكي عن المنتجات أو الخامات أو التركيبات
    if (
      text.includes("ابحث عن") || text.includes("دور على") || text.includes("فين") || text.includes("هاتلي") || text.includes("دورلي")
    ) {
      const searchTerm = text
        .replace("ابحث عن", "")
        .replace("دور على", "")
        .replace("فين", "")
        .replace("هاتلي", "")
        .replace("دورلي", "")
        .trim();
      
      if (searchTerm) {
        toast.success(`🔍 جاري البحث عن: "${searchTerm}"`);
        window.location.href = `/products?search=${encodeURIComponent(searchTerm)}`;
        return;
      }
    }

    // افتراضي إذا لم يفهم النية تماماً
    setError(`لم أفهم قصدك بـ: "${rawText}". قل مثلاً: "افتح المنتجات" أو "دور على أوكسي"`);
    toast.error(`لم أفهم الأمر بدقة. جرب صيغة أخرى.`);
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        setError(null);
        setTranscript("");
        setStatusMessage("جار تجهيز الميكروفون...");
        setIsListening(false);
        if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
        listeningStartTimerRef.current = window.setTimeout(() => {
          setIsListening(false);
          setStatusMessage("لم يبدأ الاستماع هذه المرة. اضغط الميكروفون مرة واحدة وانتظر الرنة قبل الكلام.");
        }, 3000);
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
        setStatusMessage("تعذر بدء الميكروفون الآن. انتظر لحظة ثم اضغط مرة واحدة مرة أخرى.");
      }
    } else {
      setError("التعرف الصوتي غير جاهز داخل التطبيق الآن. أعد فتح الصفحة وحاول مرة أخرى.");
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0;
    if (moved) drag.moved = true;
    const next = clampFloatingPosition(
      { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
      window.innerWidth,
      window.innerHeight,
    );
    setFloatingPosition(next);
    window.localStorage.setItem("abu_raghwa_voice_button_position", JSON.stringify(next));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleVoiceButtonClick = () => {
    if (suppressClickRef.current) return;
    if (isListening) stopListening();
    else startListening();
  };

  const stopListening = () => {
    if (listeningStartTimerRef.current) window.clearTimeout(listeningStartTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
    }
    setIsListening(false);
    setStatusMessage("تم إيقاف الاستماع.");
  };

  if (!enabled) return null;

  return (
    <div
      className="fixed z-50 touch-none select-none"
      dir="rtl"
      style={{ left: floatingPosition.x, top: floatingPosition.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Floating Voice Button */}
      <Button
        onClick={handleVoiceButtonClick}
        className={`h-14 w-14 cursor-grab touch-none rounded-full p-0 flex items-center justify-center transition-all shadow-2xl active:cursor-grabbing ${
          isListening
            ? "bg-red-500 hover:bg-red-600 animate-pulse scale-110"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
        title={isListening ? "إيقاف الاستماع الصوتي العام" : "المساعد الصوتي الذكي (تحدث بالعامية)"}
        aria-label={isListening ? "إيقاف الاستماع الصوتي" : "تشغيل المساعد الصوتي"}
      >
        {isListening ? (
          <MicOff className="w-6 h-6 text-white animate-spin" />
        ) : (
          <Mic className="w-6 h-6 text-white" />
        )}
      </Button>

      {/* Transcript & Feedback Popup */}
      {(transcript || error || statusMessage) && (
          <div className="absolute bottom-20 right-0 bg-white rounded-xl shadow-2xl p-4 w-72 border border-blue-100 text-right animate-in fade-in slide-in-from-bottom-2">
          {error && (
            <div className="text-red-600 text-xs mb-2 font-medium">
              <p>⚠️ {error}</p>
            </div>
          )}
          {transcript && (
            <div className="text-gray-800 text-xs space-y-1">
              <p className="font-bold text-blue-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> كلامك بالعامية:
              </p>
              <p className="italic bg-gray-50 p-2 rounded border text-gray-700">"{transcript}"</p>
            </div>
          )}
          {statusMessage && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs font-medium text-blue-800">{statusMessage}</p>}
        </div>
      )}
    </div>
  );
}
