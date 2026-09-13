import { useEffect, useRef, useState, type UIEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';

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
  searchable?: boolean;
  searchPlaceholder?: string;
};

const initialVisibleCount = (count: number) => Math.min(PAGE_SIZE, Math.max(0, count));

export function RecordPicker({ count, value, onChange, compactLabel = 'Record', disabled = false, options, searchable = false, searchPlaceholder }: RecordPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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

  const allOptions: RecordPickerOption[] = options
    ?? Array.from({ length: count }, (_, index) => ({ value: index, label: `Record #${index + 1}` }));
  const itemCount = allOptions.length;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? allOptions.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : allOptions;

  useEffect(() => {
    setVisibleCount(initialVisibleCount(filteredOptions.length));
  }, [itemCount, normalizedQuery]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const loadNextPage = () => {
    setVisibleCount((current) => Math.min(filteredOptions.length, current + PAGE_SIZE));
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 36 && visibleCount < filteredOptions.length) loadNextPage();
  };

  const fallbackValue = count > 0 ? Math.min(Math.max(0, value), count - 1) : 0;
  const selectedOption = allOptions.find((option) => option.value === value) ?? allOptions[0];
  const triggerLabel = itemCount === 0 ? 'No records' : selectedOption?.label ?? `${compactLabel} #${fallbackValue + 1}`;
  const visibleOptions = filteredOptions.slice(0, Math.min(visibleCount, filteredOptions.length));

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
          {searchable ? <div className="lazy-record-search"><Search size={14}/><input autoFocus value={query} placeholder={searchPlaceholder ?? `Search ${compactLabel.toLowerCase()}…`} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()}/></div> : null}
          {visibleOptions.length === 0 ? <div className="lazy-record-empty">No matching {compactLabel.toLowerCase()}s</div> : null}
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
          {visibleCount < filteredOptions.length && (
            <div className="lazy-record-load-note">Scroll for next {Math.min(PAGE_SIZE, filteredOptions.length - visibleCount)} {compactLabel.toLowerCase()}s…</div>
          )}
        </div>
      )}
    </div>
  );
}
