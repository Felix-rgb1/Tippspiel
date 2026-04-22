import './PageLoader.css';

function PageLoader({ title = 'Daten werden geladen', subtitle = 'Einen Moment bitte...' }) {
  return (
    <div className="container">
      <div className="page-loader" role="status" aria-live="polite" aria-label={title}>
        <div className="loader-stage" aria-hidden="true">
          <div className="loader-pulse-ring" />
          <div className="loader-ball" />
          <div className="loader-field-line loader-field-line-horizontal" />
          <div className="loader-field-line loader-field-line-vertical" />
        </div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export default PageLoader;
