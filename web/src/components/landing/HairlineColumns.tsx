/** Three hairline-divided columns: an optional "01" index, a title and a paragraph. Desktop only. */
export function HairlineColumns({ items, numbered = false }: { items: { title: string; body: string }[]; numbered?: boolean }) {
  const Tag = numbered ? 'ol' : 'ul'
  return (
    <Tag className="m-0 p-0 list-none grid grid-cols-3 border-t border-b border-hairline">
      {items.map((it, i) => (
        <li key={it.title} className={`flex flex-col gap-4 px-9 pt-10 pb-12 ${i < items.length - 1 ? 'border-r border-hairline' : ''}`}>
          {numbered ? <span className="font-mono text-[12px] text-purple">0{i + 1}</span> : null}
          <h3 className="m-0 font-display font-medium text-[22px] tracking-[-.02em]">{it.title}</h3>
          <p className="m-0 text-[15px] leading-[1.6] text-grey pretty">{it.body}</p>
        </li>
      ))}
    </Tag>
  )
}
