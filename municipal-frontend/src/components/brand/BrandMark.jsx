// The mark is deliberately separate from the configurable system name. The
// latter may be renamed for an LGU deployment; this supplied mark stays the
// visual identifier at the portal and system entry points.
export default function BrandMark({ className = '', alt = 'ProcureNance logo', priority = false }) {
  return (
    <img
      src="/procurenance-logo.png"
      alt={alt}
      width="768"
      height="768"
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}
