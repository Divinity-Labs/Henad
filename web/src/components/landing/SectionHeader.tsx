/**
 * Eyebrow, headline and (desktop only) a right-column paragraph, as every
 * section header on the landing canvas is framed. Mobile keeps eyebrow and
 * headline in one column.
 */
export function SectionHeader({ id, eyebrow, title, body }: { id?: string; eyebrow: string; title: string; body?: string }) {
  return (
    <div className="grid md:grid-cols-2 gap-[10px] md:gap-16 px-4 md:px-9 pt-9 md:pt-[88px] pb-2 md:pb-10 md:items-end">
      <div className="flex flex-col gap-[10px] md:gap-4">
        <p className="m-0 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">{eyebrow}</p>
        <h2 id={id} className="m-0 font-display font-medium text-[28px] md:text-[44px] tracking-[-.03em] leading-[1.05] balance">
          {title}
        </h2>
      </div>
      {body ? <p className="hidden md:block m-0 text-[17px] leading-[1.6] text-grey pretty">{body}</p> : null}
    </div>
  )
}
