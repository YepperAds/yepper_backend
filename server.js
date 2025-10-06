// server.js
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

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://yepper.cc',
  'https://yepper.cc',
  'https://yepper-backend.onrender.com',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

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
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




// // server.js
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const session = require('express-session');
// const passport = require('passport');
// require('dotenv').config();
// require('./config/passport');

// // User
// const authRoutes = require('./routes/authRoutes');

// // Ad Promoter
// const createWebsiteRoutes = require('./AdPromoter/routes/createWebsiteRoutes');
// const createCategoryRoutes = require('./AdPromoter/routes/createCategoryRoutes');
// const adDisplayRoutes = require('./AdPromoter/routes/AdDisplayRoutes');
// const businessCategoriesRoutes = require('./AdPromoter/routes/businessCategoriesRoutes');
// const withdrawalRoutes = require('./AdPromoter/routes/withdrawalRoutes');

// // AdOwner.js
// const webAdvertiseRoutes = require('./AdOwner/routes/WebAdvertiseRoutes');

// const app = express();

// // Middleware
// app.use(express.json());

// // CORS Configuration - Allow multiple origins
// const allowedOrigins = [
//   'http://localhost:3000',
//   'http://localhost:3001',
//   'http://localhost:3000',
//   'http://localhost:3000',
//   'http://http://localhost:3000',
//   'http://yepper.cc'
// ];

// app.use(cors({
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps or curl requests)
//     if (!origin) return callback(null, true);
    
//     if (allowedOrigins.indexOf(origin) === -1) {
//       const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
//       return callback(new Error(msg), false);
//     }
//     return callback(null, true);
//   },
//   credentials: true
// }));

// app.use(session({
//   secret: process.env.SESSION_SECRET || 'your-secret-key',
//   resave: false,
//   saveUninitialized: false,
//   cookie: { secure: false }
// }));

// app.use(passport.initialize());
// app.use(passport.session());

// // Auth Routes
// app.use('/api/auth', authRoutes);

// // AdPromoter Routes
// app.use('/api/createWebsite', createWebsiteRoutes);
// app.use('/api/business-categories', businessCategoriesRoutes);
// app.use('/api/ad-categories', createCategoryRoutes);
// app.use('/api/ads', adDisplayRoutes);
// app.use('/api/withdrawals', withdrawalRoutes);

// // AdOwner Routes
// app.use('/api/web-advertise', webAdvertiseRoutes);

// // MongoDB Connection
// mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => console.log('MongoDB connected'))
// .catch(err => console.log('MongoDB connection error:', err));

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });