// The mark is deliberately separate from the configurable system name. The
// latter may be renamed for an LGU deployment; this supplied mark stays the
// visual identifier at the portal and system entry points.
export default function BrandMark({ className = '', alt = 'ProcureNance logo', priority = false }) {
  // BASE_URL-aware so the logo still resolves when the app is served from a
  // subpath (e.g. Cloudflare Pages preview URLs). A plain "/file.png" 404s there.
  const src = `${import.meta.env.BASE_URL}procurenance-logo.png`
  return (
    <img
      src={src}
      alt={alt}
      width="768"
      height="768"
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      // The supplied PNG already carries a transparent alpha channel. Keep the
      // mark unframed, with only a subtle halo in dark mode so its dark edges
      // remain visible without restoring a white logo tile.
      className={`shrink-0 object-contain dark:drop-shadow-[0_0_7px_rgba(255,255,255,0.42)] ${className}`}
    />
  )
}
