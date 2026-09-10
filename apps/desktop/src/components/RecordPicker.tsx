import { useEffect, useRef, useState, type UIEvent } from 'react';
import { ChevronDown } from 'lucide-react';

const PAGE_SIZE = 50;

type RecordPickerOption = {
  value: number;
  label: string;
};

type RecordPickerProps = {
  count: number;
  value: number;
  onChange: (index: number) => void;
  compactLabel?: string;
  disabled?: boolean;
  options?: RecordPickerOption[];
};

const initialVisibleCount = (count: number) => Math.min(PAGE_SIZE, Math.max(0, count));

export function RecordPicker({ count, value, onChange, compactLabel = 'Record', disabled = false, options }: RecordPickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(() => initialVisibleCount(count));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(initialVisibleCount(count));
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const itemCount = options?.length ?? count;

  useEffect(() => {
    setVisibleCount(initialVisibleCount(itemCount));
  }, [itemCount]);

  const loadNextPage = () => {
    setVisibleCount((current) => Math.min(itemCount, current + PAGE_SIZE));
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 36 && visibleCount < itemCount) loadNextPage();
  };

  const fallbackValue = count > 0 ? Math.min(Math.max(0, value), count - 1) : 0;
  const selectedOption = options?.find((option) => option.value === value) ?? options?.[0];
  const triggerLabel = itemCount === 0 ? 'No records' : selectedOption?.label ?? `${compactLabel} #${fallbackValue + 1}`;
  const visibleOptions: RecordPickerOption[] = options
    ? options.slice(0, Math.min(visibleCount, options.length))
    : Array.from({ length: Math.min(visibleCount, count) }, (_, index) => ({ value: index, label: `Record #${index + 1}` }));

  return (
    <div className="lazy-record-picker" ref={rootRef}>
      <button
        type="button"
        className="lazy-record-picker-trigger"
        disabled={disabled || itemCount === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={14} />
      </button>
      {open && itemCount > 0 && (
        <div className="lazy-record-picker-menu" role="listbox" onScroll={handleScroll}>
          {visibleOptions.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'lazy-record-option active' : 'lazy-record-option'}
              key={`${option.value}-${option.label}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
          {visibleCount < itemCount && (
            <div className="lazy-record-load-note">Scroll for next {Math.min(PAGE_SIZE, itemCount - visibleCount)} documents…</div>
          )}
        </div>
      )}
    </div>
  );
}
