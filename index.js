import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import startupRoutes from './s.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'CloudPlatform API' });
});


app.use('/api/s', startupRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
