import { useEffect, useLayoutEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import './DateTimePicker.css';
import { toLocalInput } from '../../lib/format';

/**
 * In-app date & time picker (replaces <input type="datetime-local">, whose native popup can't be styled and
 * escapes the PC phone frame). Calendar: react-day-picker (MIT), restyled in DateTimePicker.css.
 * Time: three snap-scrolling wheels (오전/오후 · 시 · 5분 단위). Value is a local "YYYY-MM-DDTHH:mm" string.
 */
export function DateTimePicker({ value, onChange, min, max }: { value: string; onChange(v: string): void; min: Date; max: Date }) {
  const parsed = new Date(value);
  const d = Number.isNaN(parsed.getTime()) ? roundUp5(new Date(min.getTime() + 60 * 60000)) : parsed;
  const h = d.getHours();
  const m = d.getMinutes();

  // Keep the value on the 5-minute grid the minute wheel shows.
  useEffect(() => { if (Number.isNaN(parsed.getTime()) || m % 5 !== 0) onChange(toLocalInput(roundUp5(d))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (day: Date, hh: number, mm: number) => {
    const next = new Date(day);
    next.setHours(hh, mm, 0, 0);
    onChange(toLocalInput(next));
  };
  const ampm = h < 12 ? 0 : 1;
  const hourIdx = (h % 12 === 0 ? 12 : h % 12) - 1;
  const minuteIdx = Math.min(11, Math.floor(m / 5));
  const toHour = (a: number, k: number) => ((k + 1) % 12) + (a ? 12 : 0);

  return (
    <div>
      <DayPicker
        className="tm-calendar"
        mode="single"
        required
        locale={ko}
        selected={d}
        onSelect={day => day && set(day, h, m)}
        defaultMonth={d}
        startMonth={min}
        endMonth={max}
        disabled={[{ before: startOfDay(min) }, { after: max }]}
        formatters={{ formatCaption: month => `${month.getFullYear()}년 ${month.getMonth() + 1}월` }}
      />
      <div className="mt-2 flex gap-2" aria-label="시간">
        <Wheel label="오전/오후" items={['오전', '오후']} index={ampm} onChange={a => set(d, toHour(a, hourIdx), m)} />
        <Wheel label="시" items={HOURS} index={hourIdx} onChange={k => set(d, toHour(ampm, k), m)} />
        <Wheel label="분" items={MINUTES} index={minuteIdx} onChange={i => set(d, h, i * 5)} />
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 1}시`);
const MINUTES = Array.from({ length: 12 }, (_, i) => `${String(i * 5).padStart(2, '0')}분`);
const ITEM = 40;

/** A snap-scrolling picker column: 3 rows visible, the centre row is the value. Scroll, drag or tap a row. */
function Wheel({ label, items, index, onChange }: { label: string; items: string[]; index: number; onChange(i: number): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM) !== index) el.scrollTop = index * ITEM;
  }, [index]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onChange(i);
    }, 90);
  };
  return (
    <div className="relative h-[120px] flex-1">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 h-10 rounded-xl bg-white shadow-[0_0_0_1px_#E4E4E4]" />
      <div ref={ref} role="listbox" aria-label={label} onScroll={onScroll}
        className="no-scrollbar relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain py-10 [mask-image:linear-gradient(transparent,#000_30%,#000_70%,transparent)]">
        {items.map((text, i) => (
          <button key={text} type="button" role="option" aria-selected={i === index}
            onClick={() => { ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' }); onChange(i); }}
            className={`block h-10 w-full snap-center text-center text-[1.0625rem] tabular-nums transition-colors ${i === index ? 'font-bold text-ink' : 'text-mute'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const startOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
export const roundUp5 = (date: Date) => { const d = new Date(date); d.setSeconds(0, 0); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); return d; };

/** "오늘 오후 3:30" / "내일 …" / "11월 9일 (월) …" for a local "YYYY-MM-DDTHH:mm" value. */
export function formatLocalChoice(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  if (days === 0) return `오늘 ${time}`;
  if (days === 1) return `내일 ${time}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]}) ${time}`;
}
