import './PageLoader.css';

function PageLoader({ title = 'WM wird geladen', subtitle = 'Aufstellung und Tipps werden vorbereitet...' }) {
  return (
    <div className="container">
      <div className="page-loader" role="status" aria-live="polite" aria-label={title}>
        <div className="wm-loader-stage" aria-hidden="true">
          <div className="stadium-glow" />
          <div className="trophy-wrap">
            <div className="trophy-cup" />
            <div className="trophy-stem" />
            <div className="trophy-base" />
          </div>
          <div className="ball-orbit">
            <div className="ball-core" aria-hidden="true">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="47" fill="#f8fafc" />
                <g fill="#111827">
                  <polygon points="50,32 61,40 57,53 43,53 39,40" />
                  <polygon points="50,13 60,20 57,30 43,30 40,20" />
                  <polygon points="71,23 79,34 72,43 61,40 62,29" />
                  <polygon points="79,63 71,77 58,78 55,64 66,54" />
                  <polygon points="50,87 39,79 43,65 57,65 61,79" />
                  <polygon points="21,63 29,54 42,57 45,72 33,78" />
                  <polygon points="21,34 29,43 42,40 39,29 29,23" />
                </g>
                <circle cx="50" cy="50" r="47" fill="none" stroke="#111827" strokeWidth="2.2" />
              </svg>
            </div>
          </div>
          <div className="pitch-ring" />
          <div className="field-line field-line-horizontal" />
          <div className="field-line field-line-vertical" />
          <div className="flag-lights">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export default PageLoader;
