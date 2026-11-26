// Web: expo-print's web version only calls window.print() on the current
// page, so instead the statement is placed into the page and print-only CSS
// hides everything else. The browser's print dialog then offers
// "Save as PDF" (Chrome on Android and desktop, Safari on iPhone and Mac).
const CONTAINER_ID = 'atlast-print-root';
const STYLE_ID = 'atlast-print-style';

function cleanUp() {
  document.getElementById(CONTAINER_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

export async function exportStatementPdf({ css, body }: { css: string; body: string }, title: string) {
  cleanUp();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${css}
#${CONTAINER_ID} { display: none; }
@page { size: A4; margin: 12mm; }
@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#${CONTAINER_ID}) { display: none !important; }
  #${CONTAINER_ID} { display: block !important; }
  #${CONTAINER_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.innerHTML = body;
  document.body.appendChild(container);

  // The suggested file name in "Save as PDF" comes from the page title.
  const previousTitle = document.title;
  document.title = title;
  const restore = () => {
    document.title = previousTitle;
    cleanUp();
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);

  window.print();
}
