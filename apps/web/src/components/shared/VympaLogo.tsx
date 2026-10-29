import { cn } from '@/lib/utils';

export function VympaLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/brand/vympa-logo.png"
      alt={decorative ? '' : 'VYMPA'}
      width={311}
      height={304}
      className={cn('vympa-logo', className)}
      decoding="async"
    />
  );
}

export function BrandLoading({ children }: { children: string }) {
  return (
    <div className="brand-loading" role="status">
      <VympaLogo decorative />
      <span>{children}</span>
    </div>
  );
}
