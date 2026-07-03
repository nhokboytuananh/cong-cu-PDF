import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  
  // Custom API endpoint to download the compiled HTML
  app.get('/api/download-offline', (req, res) => {
    const offlinePath = path.join(__dirname, 'public/CongCuTaoChuKySo.html');
    if (fs.existsSync(offlinePath)) {
      res.download(offlinePath, 'CongCuTaoChuKySo.html');
    } else {
      res.status(404).send('Bản build offline chưa có sẵn. Xin vui lòng thử lại sau.');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on port 3000');
  });
}

startServer();
