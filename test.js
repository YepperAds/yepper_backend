// websocketServer.js
const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');

function setupWebSocketServer(server, io) {
  const clients = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('subscribe', (userId) => {
      console.log('User subscribed:', userId);
      clients.set(userId, socket);
      socket.userId = userId;
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.userId);
      if (socket.userId) {
        clients.delete(socket.userId);
      }
    });
  });

  const changeStream = ImportAd.watch();
  
  changeStream.on('change', async (change) => {
    try {
      console.log('Change detected:', change.operationType);
      
      if (change.operationType === 'insert') {
        const newAd = change.fullDocument;
        console.log('New ad inserted:', newAd._id);
        
        // Get unique category IDs from all website selections
        const categoryIds = [...new Set(newAd.websiteSelections.flatMap(selection => 
          selection.categories))];

        // Notify category owners
        for (const categoryId of categoryIds) {
          const adCategory = await AdCategory.findById(categoryId);
          if (adCategory && adCategory.ownerId) {
            const socket = clients.get(adCategory.ownerId.toString());
            if (socket) {
              console.log('Sending notification to owner:', adCategory.ownerId);
              socket.emit('notification', {
                type: 'newPendingAd',
                businessName: newAd.businessName,
                adId: newAd._id,
                timestamp: new Date(),
                read: false
              });
            }
          }
        }
      }
      
      if (change.operationType === 'update') {
        const updatedAd = await ImportAd.findById(change.documentKey._id);
        if (updatedAd && updatedAd.websiteSelections.every(sel => sel.approved)) {
          const socket = clients.get(updatedAd.userId.toString());
          if (socket) {
            console.log('Sending approval notification to user:', updatedAd.userId);
            socket.emit('notification', {
              type: 'adApproved',
              businessName: updatedAd.businessName,
              adId: updatedAd._id,
              timestamp: new Date(),
              read: false
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in change stream handler:', error);
    }
  });

  return io;
}

module.exports = setupWebSocketServer;

// AdApprovalController.js
const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');

exports.getUserMixedAds = async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch ads with populated website selections
    const mixedAds = await ImportAd.find({ userId })
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink logoUrl'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'price ownerId categoryName'
      });

    const adsWithDetails = mixedAds.map(ad => {
      // Calculate total price across all website selections and their categories
      const totalPrice = ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0);

      return {
        ...ad.toObject(),
        totalPrice,
        isConfirmed: ad.confirmed,
        // Get unique owner IDs across all categories
        categoryOwnerIds: [...new Set(ad.websiteSelections.flatMap(selection => 
          selection.categories.map(cat => cat.ownerId)))],
        clicks: ad.clicks,
        views: ad.views,
        status: ad.websiteSelections.every(sel => sel.approved) ? 'approved' : 'pending'
      };
    });

    res.status(200).json(adsWithDetails);
  } catch (error) {
    console.error('Error fetching mixed ads:', error);
    res.status(500).json({ message: 'Failed to fetch ads', error: error.message });
  }
};

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
      'http://yepper.cc',
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
    origin: process.env.CLIENT_URL || 'http://yepper.cc',
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