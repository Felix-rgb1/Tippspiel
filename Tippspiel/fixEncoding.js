const fs = require('fs');
const file = './frontend/src/pages/Groups.jsx';
let c = fs.readFileSync(file, 'utf8');

const before = c.length;
// Fix common UTF-8 mojibake patterns
c = c.replace(/\u00C3\u0084nderungen/g, '\u00C4nderungen'); // Ä
c = c.replace(/\u00C3\u00A4/g, '\u00E4'); // ä  
c = c.replace(/\u00C3\u00BC/g, '\u00FC'); // ü
c = c.replace(/\u00C3\u009F/g, '\u00DF'); // ß
// Also handle plain text replacements
c = c.replace(/Ã„nderungen/g, 'Änderungen');
c = c.replace(/fÃ¼r/g, 'für');
c = c.replace(/â€"/g, '-');
c = c.replace(/âœ"/g, '✓');

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Before:', before, 'After:', c.length);
