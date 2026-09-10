import { Nav } from '@/components/Nav'

/** Plain docs frame: dot-grid gutters, the 1200 column with hairline sides, the nav, one text column. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dotgrid min-h-dvh md:px-10">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col border-hairline bg-canvas md:border-x">
        <Nav />
        <main className="flex max-w-[760px] flex-col gap-[14px] px-4 py-10 md:px-14 md:py-16">{children}</main>
      </div>
    </div>
  )
}
