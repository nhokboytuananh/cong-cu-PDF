const fs = require('fs');

const inFile = 'dist/index.html';
const outFile = 'dist/CongCuTaoChuKySo.html'; // We can just overwrite dist files

let html = fs.readFileSync(inFile, 'utf8');

// The <script type="module" crossorigin> tag...
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);

if (scriptMatch) {
  const originalScript = scriptMatch[0];
  const scriptContent = scriptMatch[1];
  
  // Safe string replacement without replace() interpreting $
  const parts1 = html.split(originalScript);
  html = parts1.join(''); // remove the original script from head
  
  // Now add it before </body> as a classic script
  const parts2 = html.split('</body>');
  html = parts2[0] + '<script>' + scriptContent + '</script></body>' + (parts2[1] || '');
  
  fs.writeFileSync(outFile, html);
  try {
    fs.writeFileSync('public/CongCuTaoChuKySo.html', html);
  } catch (e) {
    console.error('Error writing to public folder', e);
  }
  console.log('Successfully generated offline files.');
} else {
  console.log('No script tag found!');
}
