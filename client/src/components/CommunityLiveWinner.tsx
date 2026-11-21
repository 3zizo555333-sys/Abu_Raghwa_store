import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Sparkles, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finishCommunityDraw, type LiveDrawStage } from "@/lib/supabase/communityDraws";

const SPIN_DURATION_MS = 9_000;
type WheelEntry = { ticket_number: string; phone_masked: string };

function polarPoint(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
}

function wheelSlice(index: number, count: number) {
  if (count === 1) return "M 100 100 L 100 5 A 95 95 0 1 1 99.99 5 Z";
  const step = 360 / count;
  const start = polarPoint(-90 + index * step, 95);
  const end = polarPoint(-90 + (index + 1) * step, 95);
  const largeArc = step > 180 ? 1 : 0;
  return `M 100 100 L ${start.x} ${start.y} A 95 95 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function maskPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : "***";
}

function playTick(context: AudioContext, progress: number) {
  if (context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(480 + progress * 520, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.06);
}

export function CommunityLiveWinner({ stage, onComplete }: { stage: LiveDrawStage; onComplete?: (stage: LiveDrawStage) => void }) {
  const [now, setNow] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [liveStage, setLiveStage] = useState(stage);
  const audioRef = useRef<AudioContext | null>(null);
  const finishingRef = useRef<string | null>(null);

  useEffect(() => setLiveStage(stage), [stage]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 45);
    return () => window.clearInterval(timer);
  }, []);

  const entries = useMemo(() => (liveStage.entries || []) as WheelEntry[], [liveStage.entries]);
  const startedAt = new Date(liveStage.spin_started_at || liveStage.updated_at).getTime();
  const elapsed = Math.max(0, now - startedAt);
  const progress = liveStage.status === "completed" ? 1 : Math.min(1, elapsed / SPIN_DURATION_MS);
  const selectedIndex = entries.findIndex(entry => entry.ticket_number === liveStage.winner_code);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const sectorAngle = entries.length ? 360 / entries.length : 360;
  const selectedCenterAngle = -90 + (safeIndex + 0.5) * sectorAngle;
  const finalOffset = ((-90 - selectedCenterAngle) % 360 + 360) % 360;
  const finalRotation = 360 * 7 + finalOffset;
  const easedProgress = 1 - Math.pow(1 - progress, 3.2);
  const rotation = liveStage.status === "active" ? 0 : finalRotation * easedProgress;

  useEffect(() => {
    if (liveStage.status !== "spinning" || finishingRef.current === liveStage.event_id) return;
    const remaining = Math.max(0, SPIN_DURATION_MS - (Date.now() - startedAt));
    const timer = window.setTimeout(() => {
      finishingRef.current = liveStage.event_id;
      void finishCommunityDraw(liveStage.event_type, liveStage.event_id).then(result => {
        setLiveStage(result);
        onComplete?.(result);
      }).catch(() => {
        finishingRef.current = null;
      });
    }, remaining + 30);
    return () => window.clearTimeout(timer);
  }, [liveStage.status, liveStage.event_id, liveStage.event_type, startedAt, onComplete]);

  useEffect(() => {
    if (!soundEnabled || liveStage.status !== "spinning") return;
    const context = audioRef.current;
    if (!context) return;
    const tick = () => playTick(context, Math.min(1, Math.max(0, (Date.now() - startedAt) / SPIN_DURATION_MS)));
    const timer = window.setInterval(tick, 190);
    return () => window.clearInterval(timer);
  }, [soundEnabled, liveStage.status, liveStage.event_id, startedAt]);

  const toggleSound = async () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      return;
    }
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = audioRef.current || new AudioContextConstructor();
      audioRef.current = context;
      await context.resume();
      setSoundEnabled(true);
    } catch {
      setSoundEnabled(false);
    }
  };

  useEffect(() => () => { if (audioRef.current) void audioRef.current.close(); }, []);

  const spinning = liveStage.status === "spinning";
  const completed = liveStage.status === "completed";
  const wheelEntries = entries.length ? entries : (liveStage.winner_code ? [{ ticket_number: liveStage.winner_code, phone_masked: "***" }] : []);

  return <section className="relative mt-4 overflow-hidden rounded-3xl border border-amber-300/40 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-4 text-center text-white shadow-2xl sm:p-6" aria-live="polite">
    {(spinning || completed) && <div className="pointer-events-none absolute inset-0 opacity-30 community-confetti" />}
    <div className="relative z-10 flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black"><Users className="h-4 w-4 text-cyan-200" />{entries.length} تذكرة مشاركة</span>
      {(spinning || completed) && <Button type="button" variant="outline" size="sm" onClick={() => void toggleSound()} className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" aria-label={soundEnabled ? "إيقاف صوت العجلة" : "تفعيل صوت العجلة"}>{soundEnabled ? <Volume2 className="ml-1 h-4 w-4" /> : <VolumeX className="ml-1 h-4 w-4" />}{soundEnabled ? "الصوت مفعل" : "تفعيل الصوت"}</Button>}
    </div>

    {liveStage.status === "active" ? <div className="relative z-10 py-8"><Sparkles className="mx-auto h-8 w-8 text-amber-300" /><p className="mt-2 font-bold">ستظهر العجلة هنا فور بدء السحب المباشر.</p></div> : <>
      <p className="relative z-10 mt-3 text-sm font-bold text-amber-100">{spinning ? "السحب المباشر جارٍ الآن…" : "مبروك! تم إعلان الفائز"}</p>
      <div className="relative z-10 mx-auto mt-5 aspect-square w-full max-w-[330px]">
        <div className="absolute -top-2 left-1/2 z-20 -translate-x-1/2 text-3xl leading-none text-rose-400 drop-shadow">▼</div>
        <div className="absolute inset-0 rounded-full border-[7px] border-amber-300 bg-amber-300/10 shadow-[0_0_32px_rgba(251,191,36,.35)]" />
        <svg viewBox="0 0 200 200" className="absolute inset-[5%] h-[90%] w-[90%] overflow-visible rounded-full" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label="عجلة التذاكر المشاركة">
          {wheelEntries.map((entry, index) => {
            const center = -90 + (index + 0.5) * (360 / wheelEntries.length);
            const label = polarPoint(center, wheelEntries.length <= 28 ? 66 : 73);
            const selected = entry.ticket_number === liveStage.winner_code;
            return <g key={`${entry.ticket_number}-${index}`}>
              <path d={wheelSlice(index, wheelEntries.length)} fill={selected ? "#fbbf24" : ["#7c3aed", "#2563eb", "#0f766e", "#be185d", "#c2410c"][index % 5]} stroke="#fff" strokeOpacity=".78" strokeWidth=".8" />
              {wheelEntries.length <= 36 && <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(3.2, Math.min(6.5, 90 / wheelEntries.length))} fontWeight="900" fill={selected ? "#422006" : "#fff"} transform={`rotate(${center + 90} ${label.x} ${label.y})`}>{entry.ticket_number}</text>}
            </g>;
          })}
          <circle cx="100" cy="100" r="21" fill="#f8fafc" stroke="#fbbf24" strokeWidth="3" />
          <text x="100" y="103" textAnchor="middle" fontSize="8" fontWeight="900" fill="#312e81">اسحب</text>
        </svg>
        <div className="absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-amber-300 px-3 py-1 font-mono text-xs font-black text-slate-950">{liveStage.winner_code || "؟"}</div>
      </div>

      {spinning ? <p className="relative z-10 mt-5 text-sm font-bold text-white/80">تتباطأ العجلة وتتجه إلى التذكرة المختارة عشوائياً على الخادم…</p> : <div className="relative z-10 mx-auto mt-6 max-w-xl rounded-2xl border border-amber-200/30 bg-white/10 p-5">
        <Trophy className="mx-auto h-10 w-10 text-amber-300" />
        <p className="mt-2 text-sm font-bold text-amber-100">الفائز بـ{liveStage.prize_title}</p>
        <p className="mt-2 text-2xl font-black">{liveStage.winner_name}</p>
        <p className="mt-1 font-mono text-sm text-white/75" dir="ltr">{liveStage.winner_phone_masked}</p>
        <span className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-1.5 font-mono font-black text-slate-950">{liveStage.winner_code}</span>
      </div>}

      <div className="relative z-10 mx-auto mt-5 max-w-2xl rounded-2xl border border-white/15 bg-slate-950/45 p-3 text-right">
        <p className="mb-2 text-xs font-black text-white/85">تذاكر المشاركين وأرقامهم المقنّعة</p>
        <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {entries.map((entry, index) => <div key={`${entry.ticket_number}-${index}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 font-mono text-xs ${entry.ticket_number === liveStage.winner_code && completed ? "bg-amber-300 font-black text-slate-950" : "bg-white/5 text-white/85"}`}>
            <span dir="ltr">{entry.ticket_number}</span><span dir="ltr">{entry.phone_masked || maskPhone("")}</span>
          </div>)}
          {entries.length === 0 && <p className="p-3 text-center text-xs text-white/60">لا توجد بيانات تذاكر متاحة.</p>}
        </div>
      </div>
    </>}
    <style>{`.community-confetti{background-image:radial-gradient(circle at 20% 30%,#fcd34d 0 3px,transparent 4px),radial-gradient(circle at 75% 25%,#67e8f9 0 3px,transparent 4px),radial-gradient(circle at 42% 70%,#f9a8d4 0 4px,transparent 5px),radial-gradient(circle at 88% 78%,#a7f3d0 0 3px,transparent 4px);background-size:110px 100px;animation:communityConfetti 1.4s linear infinite}@keyframes communityConfetti{to{background-position:0 100px}}@media(prefers-reduced-motion:reduce){.community-confetti{animation:none}}`}</style>
  </section>;
}
