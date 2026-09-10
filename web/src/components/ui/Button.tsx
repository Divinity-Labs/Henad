import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'dark' | 'disabled'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const base =
  'press inline-flex items-center justify-center rounded-[4px] font-mono uppercase tracking-[.06em] whitespace-nowrap select-none transition-[transform,background-color] duration-100'
const variants: Record<Variant, string> = {
  primary: 'bg-purple text-white hover:bg-[#5d44ee]',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-2',
  dark: 'bg-dark text-white hover:bg-black',
  disabled: 'bg-hairline text-muted cursor-not-allowed pointer-events-none',
}
const sizes: Record<Size, string> = {
  sm: 'h-[34px] px-3 text-[10px]',
  md: 'h-10 px-4 text-[12px]',
  lg: 'h-11 px-[18px] text-[12px]',
  xl: 'h-12 px-[22px] text-[12px]',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  block?: boolean
  className?: string
  children: ReactNode
}

type ButtonProps = CommonProps & Omit<ComponentProps<'button'>, 'className' | 'children'> & { href?: undefined }
type LinkProps = CommonProps & { href: string; external?: boolean } & Omit<ComponentProps<'a'>, 'className' | 'children' | 'href'>

const COMMON_KEYS = ['variant', 'size', 'block', 'className', 'children'] as const
function omitCommon<T extends CommonProps>(p: T): Omit<T, keyof CommonProps> {
  const rest = { ...p } as Record<string, unknown>
  for (const k of COMMON_KEYS) delete rest[k]
  return rest as Omit<T, keyof CommonProps>
}

export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'primary', size = 'md', block, className = '', children } = props
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`
  if ('href' in props && props.href !== undefined) {
    const { href, external, ...rest } = omitCommon(props) as LinkProps
    if (external) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls} {...rest}>
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    )
  }
  const rest = omitCommon(props) as Omit<ButtonProps, keyof CommonProps>
  return (
    <button type="button" className={cls} disabled={variant === 'disabled'} {...rest}>
      {children}
    </button>
  )
}
