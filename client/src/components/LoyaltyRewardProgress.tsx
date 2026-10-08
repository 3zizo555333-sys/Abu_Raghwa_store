import { Gift, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getLoyaltyRewardProgress } from "@/lib/loyaltyProgress";
import type { LoyaltyRewardLevel } from "@/lib/loyaltyRewards";

type LoyaltyRewardProgressCardProps = {
  points: number;
  levels: LoyaltyRewardLevel[];
  isLoading?: boolean;
  compact?: boolean;
};

export function LoyaltyRewardProgressCard({ points, levels, isLoading = false, compact = false }: LoyaltyRewardProgressCardProps) {
  const progress = getLoyaltyRewardProgress(points, levels);
  const padding = compact ? "p-3" : "p-5";
  const titleSize = compact ? "text-sm" : "text-base";

  return (
    <section className={`rounded-2xl border border-purple-100 bg-purple-50 ${padding}`} dir="rtl" aria-label="التقدم نحو هدايا نقاط الولاء">
      <div className="flex items-center gap-2 text-purple-900">
        <Gift className="h-5 w-5 shrink-0" />
        <h2 className={`${titleSize} font-black`}>تقدّمك نحو الهدية التالية</h2>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
        <span className="text-sm font-bold text-slate-600">رصيدك الحالي</span>
        <strong className="text-lg font-black text-purple-800">{progress.currentPoints} نقطة</strong>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-purple-800" role="status">جارٍ تحميل مستويات الهدايا…</p>
      ) : progress.nextReward ? (
        <div className="mt-3 space-y-2">
          {progress.reachedReward && (
            <p className="flex items-start gap-1.5 text-xs font-bold text-green-800">
              <Star className="mt-0.5 h-4 w-4 shrink-0 fill-green-300" />
              وصلت إلى هدية {progress.reachedReward.giftName}.
            </p>
          )}
          <p className="text-sm font-black text-purple-950">
            بقي <span className="text-lg text-purple-700">{progress.pointsRemaining} نقطة</span> لتحصل على {progress.nextReward.giftName}.
          </p>
          <Progress
            value={progress.progressPercent}
            className="h-3 bg-purple-200"
            aria-label={`التقدم إلى هدية ${progress.nextReward.giftName}`}
          />
          <p className="text-xs font-bold text-purple-700">{progress.currentPoints} من {progress.nextReward.points} نقطة</p>
        </div>
      ) : progress.reachedReward ? (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-black text-green-900">
          تهانينا، وصلت إلى أعلى هدية متاحة: {progress.reachedReward.giftName}.
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-purple-800">لا توجد مستويات هدايا معتمدة حاليًا. سيظهر العداد هنا عند اعتماد المحل للمكافآت.</p>
      )}
    </section>
  );
}
