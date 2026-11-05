export default function GenderChip({ enabled }: { enabled: boolean }) {
  return enabled ? <span className="chip my-1 w-fit shrink-0 bg-sun/30 px-2 text-[11px] text-ink">같은 성별만</span> : null;
}
