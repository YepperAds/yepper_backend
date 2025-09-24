// Updated server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

// User
const authRoutes = require('./routes/authRoutes');

// Ad Promoter
const createWebsiteRoutes = require('./AdPromoter/routes/createWebsiteRoutes');
const createCategoryRoutes = require('./AdPromoter/routes/createCategoryRoutes');
const adDisplayRoutes = require('./AdPromoter/routes/AdDisplayRoutes');
const businessCategoriesRoutes = require('./AdPromoter/routes/businessCategoriesRoutes');
const withdrawalRoutes = require('./AdPromoter/routes/withdrawalRoutes');

// AdOwner.js
const webAdvertiseRoutes = require('./AdOwner/routes/WebAdvertiseRoutes');

const app = express();

// Middleware
app.use(express.json());

// CORS Configuration - Allow your frontend domain
app.use(cors({
  origin: ['https://demo.yepper.cc', 'http://localhost:3000'], // Add localhost for development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

// Health check endpoint (add this BEFORE your other routes)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Keep server warm function
const keepWarm = () => {
  const url = `https://yepper-backend.onrender.com/api/health`;
  
  setInterval(async () => {
    try {
      // Use native fetch instead of external request to avoid CORS
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'KeepWarm/1.0'
        }
      });
      console.log(`Keep warm ping: ${response.status} at ${new Date().toISOString()}`);
    } catch (error) {
      console.log('Keep warm ping failed:', error.message);
    }
  }, 13 * 60 * 1000); // Ping every 13 minutes (safer than 14)
};

// Auth Routes
app.use('/api/auth', authRoutes);

// AdPromoter Routes
app.use('/api/createWebsite', createWebsiteRoutes);
app.use('/api/business-categories', businessCategoriesRoutes);
app.use('/api/ad-categories', createCategoryRoutes);
app.use('/api/ads', adDisplayRoutes);
app.use('/api/withdrawals', withdrawalRoutes);

// AdOwner Routes
app.use('/api/web-advertise', webAdvertiseRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected');
  
  // Start the keep warm service only in production and after DB connection
  if (process.env.NODE_ENV === 'production') {
    console.log('Starting keep warm service...');
    keepWarm();
  }
})
.catch(err => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
});