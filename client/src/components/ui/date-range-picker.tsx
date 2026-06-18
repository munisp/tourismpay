/**
 * DateRangePicker — minimal date range selector.
 * Replace with a full calendar-based picker for production.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const fmt = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "");

  const handleFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const from = e.target.value ? new Date(e.target.value) : undefined;
    onChange?.({ from, to: value?.to });
  };

  const handleTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const to = e.target.value ? new Date(e.target.value) : undefined;
    onChange?.({ from: value?.from, to });
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input type="date" value={fmt(value?.from)} onChange={handleFrom} className="w-36 h-8 text-sm" />
      </div>
      <span className="text-muted-foreground mt-4">–</span>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input type="date" value={fmt(value?.to)} onChange={handleTo} className="w-36 h-8 text-sm" />
      </div>
    </div>
  );
}

export default DateRangePicker;
