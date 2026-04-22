import './Rules.css';

function Rules() {
  return (
    <div className="container">
      <div className="page-title">
        <h1>📋 Spielregeln</h1>
        <p>Alle wichtigen Informationen zum WM Tippspiel</p>
      </div>

      <div className="rules-content">
        <section className="rule-section card">
          <h2>⏰ Abgabefristen</h2>
          <div className="rule-item">
            <h3>Tipps abgeben</h3>
            <p>
              Tipps müssen <strong>bis spätestens 60 Minuten vor Spielstart</strong> abgegeben werden.
              Nach dieser Zeit ist eine Änderung nicht mehr möglich.
            </p>
            <p className="note">
              💡 Tipp: Gibt es einen Spieltermin, erscheint im Dashboard die genaue Deadline für dieses Spiel.
            </p>
          </div>
        </section>

        <section className="rule-section card">
          <h2>🎯 Punkteverteilung</h2>
          <div className="rule-item">
            <h3>Wie bekommt man Punkte?</h3>
            <table className="points-table">
              <thead>
                <tr>
                  <th>Erfolgsgrad</th>
                  <th>Punkte</th>
                  <th>Beispiel</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Exaktes Ergebnis</td>
                  <td><strong>3 Punkte</strong></td>
                  <td>Tipp: 2:1 → Ergebnis: 2:1 ✅</td>
                </tr>
                <tr>
                  <td>Tendenz richtig</td>
                  <td><strong>1 Punkt</strong></td>
                  <td>Tipp: 1:0 → Ergebnis: 2:0 (beide Heimsieg) ✅</td>
                </tr>
                <tr>
                  <td>Tendenz falsch</td>
                  <td><strong>0 Punkte</strong></td>
                  <td>Tipp: 1:0 → Ergebnis: 0:1 (falsch) ❌</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rule-item">
            <h3>Was ist mit Unentschieden?</h3>
            <p>
              Tipps auf Unentschieden (z.B. 1:1) zählen als richtige Tendenz, wenn das Spiel tatsächlich unentschieden endet.
              Das exakte Ergebnis bringt dir 3 Punkte.
            </p>
          </div>
          <div className="rule-item">
            <h3>Bonusfragen (Turnier-Ende)</h3>
            <p>
              Zusätzlich kannst du vor Turnierstart den <strong>Weltmeister</strong> und <strong>Vizemeister</strong> tippen.
              Dafür gibt es Extrapunkte:
            </p>
            <ul className="rules-list compact-list">
              <li>Richtiger Weltmeister: <strong>5 Punkte</strong></li>
              <li>Richtiger Vizemeister: <strong>3 Punkte</strong></li>
            </ul>
          </div>
        </section>

        <section className="rule-section card">
          <h2>🏆 Rangliste</h2>
          <div className="rule-item">
            <h3>Wie wird die Rangliste berechnet?</h3>
            <p>
              Die Rangliste wird nach <strong>Gesamtpunkten</strong> sortiert, die aus allen bisherigen Tipps errechnet werden.
              Spieler mit mehr Punkten erscheinen weiter oben.
            </p>
          </div>
          <div className="rule-item">
            <h3>Sonderausweis</h3>
            <p>
              🥇 <strong>Platz 1:</strong> Gold-Medaille (oben angezeigt)<br />
              🥈 <strong>Platz 2:</strong> Silber-Medaille<br />
              🥉 <strong>Platz 3:</strong> Bronze-Medaille<br />
              <strong>Ab Platz 4:</strong> Platzierung wird nummeriert angezeigt
            </p>
          </div>
          <div className="rule-item">
            <h3>Tiebreaker-Regeln</h3>
            <p>Bei Punktgleichstand gilt folgende Reihenfolge:</p>
            <ol className="tiebreaker-list">
              <li>Mehr exakte Ergebnistipps</li>
              <li>Mehr richtige Tendenzen</li>
              <li>Frühere Tippabgabe</li>
            </ol>
          </div>
        </section>

        <section className="rule-section card">
          <h2>❓ FAQ</h2>
          <div className="faq-item">
            <h3>Kann ich meine Tipps ändern?</h3>
            <p>
              Ja, solange die Deadline (60 Min. vor Spielstart) noch nicht überschritten ist. 
              Nach der Deadline sind keine Änderungen möglich.
            </p>
          </div>
          <div className="faq-item">
            <h3>Werden meine Punkte in Echtzeit aktualisiert?</h3>
            <p>
              Ja! Sobald ein Spielergebnis eingetragen wird, werden deine Punkte automatisch neu berechnet 
              und die Rangliste aktualisiert.
            </p>
          </div>
          <div className="faq-item">
            <h3>Was ist, wenn es ein Spiel gibt, bei dem ich nicht tippen möchte?</h3>
            <p>
              Du brauchst nicht auf jedes Spiel zu tippen. Nur Spiele mit abgegebenen Tipps zählen zur Berechnung 
              und werden auf der Rangliste berücksichtigt.
            </p>
          </div>
          <div className="faq-item">
            <h3>Kann ich einen Tipp nach Spielende ändern?</h3>
            <p>
              Nein. Sobald ein Spiel abgelaufen ist, ist der Tipp gespeichert. Das Spielergebnis kann dann 
              nur noch von Admins bearbeitet werden.
            </p>
          </div>
        </section>

        <section className="rule-section card">
          <h2>⚠️ Wichtige Hinweise</h2>
          <ul className="rules-list">
            <li><strong>Respekt und Fair Play:</strong> Alle Spieler sollen respektvoll miteinander umgehen.</li>
            <li><strong>Admin-Entscheidungen:</strong> Bei Streitfragen treffen die Admins die finale Entscheidung.</li>
            <li><strong>Datenschutz:</strong> Deine persönlichen Daten werden vertraulich behandelt und nicht weitergegeben.</li>
            <li><strong>Haftung:</strong> Für technische Fehler oder Datenverlust können die Betreiber nicht haftbar gemacht werden.</li>
          </ul>
        </section>

        <section className="rule-section card">
          <h2>💬 Fragen oder Probleme?</h2>
          <p>
            Wenn du Fragen zu den Regeln hast oder auf Probleme stößt, wende dich bitte an einen Admin.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Rules;
