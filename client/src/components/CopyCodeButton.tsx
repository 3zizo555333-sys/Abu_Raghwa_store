import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type CopyCodeButtonProps = {
  code: string;
  className?: string;
  label?: string;
};

export function normalizeCopyCode(code: string): string {
  return code.replace(/[#\s]/g, "");
}

export function CopyCodeButton({ code, className, label = "نسخ الكود" }: CopyCodeButtonProps) {
  const copy = async () => {
    const cleanCode = normalizeCopyCode(code);
    if (!cleanCode) {
      toast.error("لا يوجد كود صالح للنسخ");
      return;
    }
    try {
      await navigator.clipboard.writeText(cleanCode);
      toast.success("تم نسخ كود الفاتورة");
    } catch {
      toast.error("تعذر النسخ تلقائياً؛ يمكنك تحديد الكود ونسخه يدوياً");
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={() => void copy()} className={className}>
      <Copy className="ml-1 h-3.5 w-3.5" />{label}
    </Button>
  );
}
