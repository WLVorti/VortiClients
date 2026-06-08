import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8081;

app.use(cors());
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Web client: http://localhost:${PORT}`);
});
