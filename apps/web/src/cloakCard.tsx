/**
 * A picture of a card for the Pay by card page: Cloak's mark seen through fluted glass (as on the landing page), a gold
 * chip with its contacts, contactless waves, and the card networks the checkout takes. Decoration only, "1234" marks it
 * as a sample. Visa's mark from Simple Icons (CC0); Mastercard's is its two circles.
 */
const VISA = "M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z";
const MARK = "M149.671 0C119.989 12.7135 73.3456 40.2595 58.5046 74.1622C41.5434 118.659 37.3031 192.822 3.38073 266.984C-2.97971 279.697 -0.859564 288.173 13.9815 294.53C62.7449 317.838 117.869 326.314 160.272 319.957C209.035 315.719 247.198 298.768 279 275.459L232.357 209.773C213.275 230.962 187.834 243.676 160.272 245.795C117.869 250.032 86.0665 226.724 86.0665 186.465C86.0665 137.73 115.749 93.2324 149.671 69.9243C172.993 84.7568 194.194 108.065 206.915 133.492L257.799 103.827C234.477 57.2108 189.954 19.0703 149.671 0Z";

export function Visa({ h = 14, color = "#1A1F71" }: { h?: number; color?: string }) {
  return <svg viewBox="0 6.6 24 10.8" height={h} role="img" aria-label="Visa"><path d={VISA} fill={color} /></svg>;
}
export function Mastercard({ h = 18 }: { h?: number }) {
  return (
    <svg viewBox="0 0 38 24" height={h} role="img" aria-label="Mastercard">
      <circle cx="13" cy="12" r="11" fill="#EB001B" />
      <circle cx="25" cy="12" r="11" fill="#F79E1B" />
      <path d="M19 2.8a11 11 0 0 1 0 18.4a11 11 0 0 1 0-18.4z" fill="#FF5F00" />
    </svg>
  );
}

export function CloakCard() {
  return (
    <div className="ccard" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="ccard-reeded" x="0" y="0" width="100%" height="100%" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><defs><linearGradient id="g"><stop offset="0" stop-color="rgb(0,128,0)"/><stop offset="1" stop-color="rgb(255,128,0)"/></linearGradient></defs><rect width="30" height="30" fill="url(#g)"/></svg>')}`} x="0" y="0" width="30" height="30" preserveAspectRatio="none" result="rib" />
          <feTile in="rib" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <i className="ccard-light"><svg viewBox="0 0 279 322"><path d={MARK} /></svg></i>
      <i className="ccard-flutes" />
      <i className="ccard-sheen" />
      <div className="ccard-top">
        <span className="ccard-brand"><svg viewBox="0 0 279 322" height="18"><path d={MARK} fill="currentColor" /></svg>Cloak</span>
        <svg className="ccard-tap" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" /></svg>
      </div>
      <svg className="ccard-chip" viewBox="0 0 46 36">
        <defs><linearGradient id="ccard-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7e3a3" /><stop offset=".45" stopColor="#d9b25c" /><stop offset="1" stopColor="#b88a35" /></linearGradient></defs>
        <rect x=".5" y=".5" width="45" height="35" rx="6" fill="url(#ccard-gold)" stroke="#a87c2c" strokeOpacity=".5" />
        <g fill="none" stroke="#8f6a25" strokeOpacity=".75" strokeWidth="1">
          <path d="M0 12h14M0 24h14M32 12h14M32 24h14M14 6v24M32 6v24M14 6h18M14 30h18M23 0v6M23 30v6" />
          <rect x="17" y="11" width="12" height="14" rx="3" />
        </g>
      </svg>
      <div className="ccard-num">•••• •••• •••• 1234</div>
      <div className="ccard-bottom">
        <div><span className="ccard-k">Lands in</span><span className="ccard-v">Private balance</span></div>
        <Mastercard h={26} />
      </div>
    </div>
  );
}
