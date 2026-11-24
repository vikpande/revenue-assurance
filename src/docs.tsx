export function DocsScreen() {
  return (
    <article className="docs">
      <header className="page-head">
        <h1>How a claim is built</h1>
        <p className="quiet">
          The contractor reports availability and pays if it misses the guarantee. This screen
          recomputes the quarter from the status log and the contract, then prices only the hours
          the two readings treat differently.
        </p>
      </header>

      <figure className="concept">
        <figcaption>One window on Glen Moor. Three turbines, 9 to 20 May, coded as grid loss.</figcaption>
        <div
          className="split"
          role="img"
          aria-label="Of 264 hours coded as grid loss, 19 hours 20 minutes are covered by an outage notice. The remaining 244 hours 40 minutes are not."
        >
          <div className="split-track">
            <div className="split-notice" />
            <div className="split-open" />
          </div>
          <p className="split-key">
            <span>
              <i className="swatch notice" />
              <b>19 h 20 min</b> covered by notice
            </span>
            <span>
              <i className="swatch open" />
              <b>244 h 40 min</b> with no notice
            </span>
          </p>
        </div>
        <dl className="split-read">
          <div>
            <dt>Contract</dt>
            <dd>Notice stays available. The rest is unavailable.</dd>
          </div>
          <div>
            <dt>OEM coding</dt>
            <dd>The whole bar is excused.</dd>
          </div>
        </dl>
        <div className="concept-outcomes">
          <div>
            <h2>Contract reading</h2>
            <p>95.7999% for the quarter. Damages £27,057.59.</p>
          </div>
          <div>
            <h2>OEM coding</h2>
            <p>97.2003%, against 97.20% on the statement. Damages £0.</p>
          </div>
          <div>
            <h2>The claim</h2>
            <p>734 hours, the hatched part on three turbines. £27,057.59.</p>
          </div>
        </div>
      </figure>

      <h2>What both readings already share</h2>
      <p>
        Gearbox time and other forced outages are unavailable on the contract and on the OEM
        coding. They change the quarter, and they are not the claim. The claim is only the hatched
        hours above.
      </p>

      <h2>The fraction, then the money</h2>
      <p className="formula">Availability = 1 − unavailable hours ÷ turbine-hours</p>
      <p>
        Glen Moor has 2,201.5 unavailable hours in 52,416 turbine-hours. Damages then scale the
        meter total, not the turbine’s rated power: 30,000 MWh × (97% ÷ 95.7999% − 1) × £72.
      </p>

      <h2>Allowance is the same kind of split</h2>
      <p>
        Scheduled maintenance is excused up to the hours in the contract. On Site P the side letter
        sets 40 hours and the OEM statement still uses 120. The 12 hours past 40 are unavailable on
        the contract and excused on the OEM coding, so they join the claim.
      </p>
    </article>
  );
}
