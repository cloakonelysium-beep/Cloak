/**
 * What shows between "Continue to payment" and Spicenet's own window: a shimmering checkout in the shape of the window
 * that is coming, with the step it's on. Kept apart from spicenet-flow.tsx so it shows at once, while Spicenet's code
 * (Privy, Spice Flow) is still downloading. Also carries Spicenet's few messages of its own (a payment still on its way,
 * another session, an error), so nothing ever appears below the page out of sight.
 */
export function SpiceWait({ text, onClose, fading = false, busy = true }: { text: string; onClose: () => void; fading?: boolean; busy?: boolean }) {
  return (
    <div className={`sn-wait${fading ? " out" : ""}`} role="dialog" aria-modal="true" aria-label="Secure checkout" aria-busy={busy}>
      <div className="sn-wait-card">
        <div className="sn-wait-head">
          <span className="by"><img src="/partners/spicenet-mark.svg" alt="" />Secure checkout by Spicenet</span>
          <button className="icon-btn sn-wait-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {busy ? (
          <>
            <div className="sn-wait-title"><span className="spin" aria-hidden="true" />{text}</div>
            <div className="sn-wait-rows" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="sn-wait-row"><span className="skel" style={{ width: "42%", height: 12 }} /><span className="skel" style={{ width: "70%", height: 10 }} /></div>
              ))}
            </div>
            <p className="xs mute" style={{ margin: "12px 0 0", textAlign: "center" }}>Nothing is charged until you confirm in the checkout.</p>
          </>
        ) : (
          <>
            <p className="small soft" style={{ margin: "14px 0 16px" }}>{text}</p>
            <button className="btn btn-ink btn-block" onClick={onClose}>OK</button>
          </>
        )}
      </div>
    </div>
  );
}
