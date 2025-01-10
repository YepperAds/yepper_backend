// server.js
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const setupWebSocketServer = require('./config/websocketServer'); // Add this line
const waitlistRoutes = require('./routes/WaitlistRoutes');
const sitePartnersRoutes = require('./routes/SitePartnersRoutes');
const importAdRoutes = require('./routes/ImportAdRoutes');
const requestAdRoutes = require('./routes/RequestAdRoutes');
const websiteRoutes = require('./routes/WebsiteRoutes');
const adCategoryRoutes = require('./routes/AdCategoryRoutes');
const adSpaceRoutes = require('./routes/AdSpaceRoutes');
const apiGeneratorRoutes = require('./routes/ApiGeneratorRoutes');
const adApprovalRoutes = require('./routes/AdApprovalRoutes');
const adDisplayRoutes = require('./routes/AdDisplayRoutes');
const paymentRoutes = require('./routes/PaymentRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const pictureRoutes = require('./routes/PictureRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests from null origin (local files), localhost:3000, and your production domain
    const allowedOrigins = [
      'https://www.yepper.cc/',
      'null',
      'file://',
      process.env.CLIENT_URL
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/join-site-waitlist', sitePartnersRoutes);
app.use('/api/join-waitlist', waitlistRoutes);
app.use('/api/importAds', importAdRoutes);
app.use('/api/requestAd', requestAdRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/ad-categories', adCategoryRoutes);
app.use('/api/ad-spaces', adSpaceRoutes);
app.use('/api/generate-api', apiGeneratorRoutes);
app.use('/api/accept', adApprovalRoutes);
app.use('/api/ads', adDisplayRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/picture', pictureRoutes);
app.use('/api/payout', payoutRoutes);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'https://www.yepper.cc',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set up WebSocket server with existing socket.io instance
setupWebSocketServer(server, io); // Add this line

module.exports.io = io;
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.log(error);
  });