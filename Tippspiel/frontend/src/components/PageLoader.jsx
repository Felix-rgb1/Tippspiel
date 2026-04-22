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
            <div className="ball-core" />
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
