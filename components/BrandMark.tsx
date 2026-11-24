export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`noma-mark ${className}`} aria-hidden="true">
      <img src="/rayomand-logo.png" alt="" width={64} height={64} />
    </span>
  );
}
