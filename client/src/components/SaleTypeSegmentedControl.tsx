type SaleType = "retail" | "wholesale" | "bulk";

const saleTypes: Array<{ value: SaleType; label: string }> = [
  { value: "retail", label: "قطاعي" },
  { value: "wholesale", label: "تجزئة" },
  { value: "bulk", label: "جملة" },
];

type SaleTypeSegmentedControlProps = {
  value: SaleType;
  onChange: (value: SaleType) => void;
  disabled?: boolean;
};

export function SaleTypeSegmentedControl({ value, onChange, disabled = false }: SaleTypeSegmentedControlProps) {
  return (
    <fieldset className="rounded-2xl border border-orange-200 bg-white p-3">
      <legend className="px-1 text-sm font-black text-orange-950">نوع البيع</legend>
      <div role="group" aria-label="نوع البيع" className="grid grid-cols-3 gap-1 rounded-xl bg-orange-50 p-1">
        {saleTypes.map(type => {
          const selected = value === type.value;
          return (
            <button
              key={type.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(type.value)}
              className={`min-h-10 rounded-lg px-2 py-2 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "bg-orange-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-orange-100"}`}
            >
              {type.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-600">تتحدث أسعار السلة والنقاط والإجمالي فورًا.</p>
    </fieldset>
  );
}
