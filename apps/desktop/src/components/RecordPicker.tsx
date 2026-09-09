import { useEffect, useRef, useState, type UIEvent } from 'react';
import { ChevronDown } from 'lucide-react';

const PAGE_SIZE = 50;

type RecordPickerProps = {
  count: number;
  value: number;
  onChange: (index: number) => void;
  compactLabel?: string;
  disabled?: boolean;
};

const initialVisibleCount = (count: number) => Math.min(PAGE_SIZE, Math.max(0, count));

export function RecordPicker({ count, value, onChange, compactLabel = 'Record', disabled = false }: RecordPickerProps) {
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

  const loadNextPage = () => {
    setVisibleCount((current) => Math.min(count, current + PAGE_SIZE));
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 36 && visibleCount < count) loadNextPage();
  };

  const safeValue = count > 0 ? Math.min(Math.max(0, value), count - 1) : 0;
  const visibleIndexes = Array.from({ length: Math.min(visibleCount, count) }, (_, index) => index);

  return (
    <div className="lazy-record-picker" ref={rootRef}>
      <button
        type="button"
        className="lazy-record-picker-trigger"
        disabled={disabled || count === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{count === 0 ? 'No records' : `${compactLabel} #${safeValue + 1}`}</span>
        <ChevronDown size={14} />
      </button>
      {open && count > 0 && (
        <div className="lazy-record-picker-menu" role="listbox" onScroll={handleScroll}>
          {visibleIndexes.map((index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === safeValue}
              className={index === safeValue ? 'lazy-record-option active' : 'lazy-record-option'}
              key={index}
              onClick={() => {
                onChange(index);
                setOpen(false);
              }}
            >
              Record #{index + 1}
            </button>
          ))}
          {visibleCount < count && (
            <div className="lazy-record-load-note">Scroll for next {Math.min(PAGE_SIZE, count - visibleCount)} records…</div>
          )}
        </div>
      )}
    </div>
  );
}
