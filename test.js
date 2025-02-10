const axios = require('axios');
const mongoose = require('mongoose');
const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel');
const Payment = require('../models/PaymentModel');
const PaymentTracker = require('../models/PaymentTracker');

exports.initiateAdPayment = async (req, res) => {
  try {
    const { adId, websiteId, amount, email, phoneNumber, userId } = req.body;

    // Input validation
    if (!adId || !websiteId || !amount || !email || !userId) {
      return res.status(400).json({ 
        message: 'Missing required fields', 
        required: ['adId', 'websiteId', 'amount', 'email', 'userId'] 
      });
    }

    // Validate amount is a positive number
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Check if the ad is already confirmed for this website
    const existingAd = await ImportAd.findOne({
      _id: adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          confirmed: true
        }
      }
    });

    if (existingAd) {
      return res.status(400).json({ message: 'Ad is already confirmed for this website' });
    }

    // Find ad and verify it's approved but not confirmed
    const ad = await ImportAd.findOne({
      _id: adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          approved: true,
          confirmed: { $ne: true }
        }
      }
    });

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found or not approved for this website' });
    }

    // Get website selection and verify categories
    const websiteSelection = ad.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId.toString()
    );

    if (!websiteSelection || !websiteSelection.categories?.length) {
      return res.status(400).json({ message: 'Invalid website selection or no categories selected' });
    }

    // Verify categories exist and have valid visitor ranges
    const categories = await AdCategory.find({
      _id: { $in: websiteSelection.categories },
      websiteId: websiteId
    });

    if (!categories.length) {
      return res.status(404).json({ message: 'Categories not found for this website' });
    }

    // Validate all categories have proper visitor ranges
    const invalidCategories = categories.filter(
      category => !category.visitorRange?.max || !category.visitorRange?.min
    );

    if (invalidCategories.length > 0) {
      return res.status(400).json({ 
        message: 'Invalid visitor ranges in categories',
        invalidCategories: invalidCategories.map(c => c._id)
      });
    }

    const tx_ref = `AD-${Date.now()}-${adId}-${websiteId}`;
    const formattedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

    // Create payment record
    const payment = new Payment({
      tx_ref,
      amount: Number(amount),
      currency: 'RWF',
      email,
      phoneNumber: formattedPhone,
      userId,
      adId,
      websiteId,
      webOwnerId: categories[0].ownerId,
      status: 'pending'
    });

    await payment.save();

    // Construct Flutterwave payment payload
    const paymentPayload = {
      tx_ref,
      amount: Number(amount),
      currency: 'RWF',
      redirect_url: "http://localhost:5000/api/accept/callback",
      meta: {
        adId,
        websiteId,
        userId
      },
      customer: {
        email,
        phonenumber: formattedPhone,
        name: ad.businessName || email
      },
      customizations: {
        title: 'Ad Space Payment',
        description: `Payment for ad space on website - ${ad.businessName}`,
        logo: process.env.COMPANY_LOGO_URL || ''
      }
    };

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments', 
      paymentPayload, 
      {
        headers: { 
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.status === 'success' && response.data?.data?.link) {
      return res.status(200).json({ 
        paymentLink: response.data.data.link,
        tx_ref
      });
    }

    // If we get here, something went wrong with the Flutterwave response
    await Payment.findOneAndDelete({ tx_ref });
    throw new Error('Invalid payment response from Flutterwave');

  } catch (error) {
    console.error('Error initiating payment:', error.response?.data || error.message);
    
    // Always try to delete the payment record if there's an error
    if (error.tx_ref) {
      try {
        await Payment.findOneAndDelete({ tx_ref: error.tx_ref });
      } catch (deleteError) {
        console.error('Error deleting failed payment record:', deleteError);
      }
    }

    return res.status(500).json({ 
      message: 'Error initiating payment',
      error: error.response?.data?.message || error.message
    });
  }
};

exports.adPaymentCallback = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    const { tx_ref, transaction_id } = req.query;
    
    // Validate callback parameters
    if (!tx_ref || !transaction_id) {
      return res.redirect('http://localhost:3000/approved-ads?status=invalid-params');
    }

    // Parse and validate tx_ref format
    const [prefix, timestamp, adId, websiteId] = tx_ref.split('-');
    if (!prefix || prefix !== 'AD' || !timestamp || !adId || !websiteId) {
      return res.redirect('http://localhost:3000/approved-ads?status=invalid-txref');
    }

    // Find the payment record first
    const payment = await Payment.findOne({ tx_ref });
    if (!payment) {
      console.error('Payment record not found for tx_ref:', tx_ref);
      return res.redirect('http://localhost:3000/approved-ads?status=payment-not-found');
    }

    // Verify the transaction with Flutterwave
    let transactionVerification;
    try {
      transactionVerification = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
        }
      );
    } catch (verifyError) {
      console.error('Flutterwave verification failed:', verifyError);
      payment.status = 'failed';
      await payment.save();
      return res.redirect('http://localhost:3000/approved-ads?status=verification-failed');
    }

    const { status, amount, currency } = transactionVerification.data.data;

    // Verify payment amount and currency
    if (payment.amount !== amount || payment.currency !== currency) {
      console.error('Payment amount or currency mismatch');
      payment.status = 'failed';
      await payment.save();
      return res.redirect('http://localhost:3000/approved-ads?status=amount-mismatch');
    }

    if (status !== 'successful') {
      payment.status = 'failed';
      await payment.save();
      return res.redirect('http://localhost:3000/approved-ads?status=failed');
    }

    // Start transaction for successful payments only
    await session.startTransaction();
    transactionStarted = true;

    // Find the ad and validate its current state
    const ad = await ImportAd.findOne({ _id: adId }).session(session);
    if (!ad) {
      throw new Error('Advertisement not found');
    }

    const websiteSelection = ad.websiteSelections.find(
      sel => sel.websiteId.toString() === websiteId.toString()
    );

    if (!websiteSelection || !websiteSelection.approved || websiteSelection.confirmed) {
      throw new Error('Invalid website selection or ad already confirmed');
    }

    // Find and validate all categories
    const categories = await AdCategory.find({
      _id: { $in: websiteSelection.categories },
      websiteId: websiteId
    }).session(session);

    if (!categories.length) {
      throw new Error('No valid categories found');
    }

    // Validate visitor ranges for all categories
    const invalidCategories = categories.filter(
      category => !category.visitorRange?.max || !category.visitorRange?.min
    );

    if (invalidCategories.length > 0) {
      throw new Error('Invalid visitor ranges in categories');
    }

    // Update the ad status
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections': {
          $elemMatch: {
            websiteId: websiteId,
            approved: true,
            confirmed: { $ne: true }
          }
        }
      },
      { 
        $set: { 
          'websiteSelections.$.confirmed': true,
          'websiteSelections.$.confirmedAt': new Date()
        }
      },
      { 
        new: true,
        session 
      }
    );

    if (!updatedAd) {
      throw new Error('Failed to update ad confirmation status');
    }

    // Update categories
    await AdCategory.updateMany(
      { 
        _id: { $in: websiteSelection.categories },
        websiteId: websiteId
      },
      { $addToSet: { selectedAds: updatedAd._id } },
      { session }
    );

    // Update web owner's balance
    await WebOwnerBalance.findOneAndUpdate(
      { userId: payment.webOwnerId },
      {
        $inc: {
          totalEarnings: payment.amount,
          availableBalance: payment.amount
        }
      },
      { upsert: true, session }
    );

    // Create payment trackers
    const paymentTrackers = categories.map(category => ({
      userId: payment.webOwnerId,
      adId: ad._id,
      categoryId: category._id,
      paymentDate: new Date(),
      amount: amount / categories.length,
      viewsRequired: category.visitorRange.max,
      currentViews: 0,
      status: 'pending'
    }));

    await PaymentTracker.insertMany(paymentTrackers, { session });
    
    // Update payment status
    payment.status = 'successful';
    await payment.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    return res.redirect('http://localhost:3000/approved-ads?status=success');

  } catch (error) {
    console.error('Error handling payment callback:', error);
    
    if (transactionStarted) {
      await session.abortTransaction();
    }

    // If we have a payment reference, mark it as failed
    if (tx_ref) {
      try {
        await Payment.findOneAndUpdate(
          { tx_ref },
          { $set: { status: 'failed' } }
        );
      } catch (updateError) {
        console.error('Error updating payment status:', updateError);
      }
    }

    return res.redirect('http://localhost:3000/approved-ads?status=error');
  } finally {
    await session.endSession();
  }
};



































// AdCategoryModel.js
const adCategorySchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryName: { type: String, required: true, minlength: 3 },
  description: { type: String, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  spaceType: { type: String, required: true },
  userCount: { type: Number, default: 0 },
  instructions: { type: String },
  customAttributes: { type: Map, of: String },
  apiCodes: {
    HTML: { type: String },
    JavaScript: { type: String },
    PHP: { type: String },
    Python: { type: String },
  },
  selectedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd' }],
  webOwnerEmail: { type: String, required: true },
  visitorRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

adCategorySchema.index({ ownerId: 1, websiteId: 1, categoryName: 1 });

// ImportAdModel.js
const importAdSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  adOwnerEmail: { type: String, required: true },
  imageUrl: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  businessName: { type: String, required: true },
  businessLink: { type: String, required: true },
  businessLocation: { type: String, required: true },
  adDescription: { type: String, required: true },
  websiteSelections: [{
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory' }],
    approved: { type: Boolean, default: false },
    approvedAt: { type: Date }
  }],
  confirmed: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
importAdSchema.index({ userId: 1, 'websiteSelections.websiteId': 1 });

// WebOwnerBalanceModel.js
const webOwnerBalanceSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true,
    unique: true,
    validate: {
      validator: (v) => v?.trim() !== '',
      message: 'User ID cannot be null or empty',
    },
  },
  totalEarnings: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
}, { timestamps: true });

// PaymentModel.js
const paymentSchema = new mongoose.Schema({
  tx_ref: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
  email: { type: String },
  phoneNumber: { type: String },
  userId: { type: String },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  webOwnerId: { type: String }, // New field for web owner
  withdrawn: { type: Boolean, default: false },
  paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' }
}, { timestamps: true });

// PaymentTracker.js
const paymentTrackerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  paymentDate: { type: Date, required: true },
  lastWithdrawalDate: { type: Date },
  amount: { type: Number, required: true },
  viewsRequired: { type: Number, required: true },
  currentViews: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'available', 'withdrawn'],
    default: 'pending'
  },
  paymentReference: { type: String, unique: true, sparse: true }
});

// AdApprovalController.js
const axios = require('axios');
const mongoose = require('mongoose');
const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
const Payment = require('../models/PaymentModel');
const PaymentTracker = require('../models/PaymentTracker');

exports.initiateAdPayment = async (req, res) => {
    try {
      const { adId, websiteId, amount, email, phoneNumber, userId } = req.body;
  
      // Input validation
      if (!adId || !websiteId || !amount || !email || !userId) {
        return res.status(400).json({ 
          message: 'Missing required fields', 
          required: ['adId', 'websiteId', 'amount', 'email', 'userId'] 
        });
      }
  
      // Check if the ad is already confirmed for this website
      const existingAd = await ImportAd.findOne({
        _id: adId,
        'websiteSelections': {
          $elemMatch: {
            websiteId: websiteId,
            confirmed: true
          }
        }
      });
  
      if (existingAd) {
        return res.status(400).json({ message: 'Ad is already confirmed for this website' });
      }
  
      // Find ad and verify it's approved but not confirmed
      const ad = await ImportAd.findOne({
        _id: adId,
        'websiteSelections': {
          $elemMatch: {
            websiteId: websiteId,
            approved: true,
            confirmed: { $ne: true }
          }
        }
      });
  
      if (!ad) {
        return res.status(404).json({ message: 'Ad not found or not approved for this website' });
      }
  
      // Get website selection and verify categories
      const websiteSelection = ad.websiteSelections.find(
        selection => selection.websiteId.toString() === websiteId.toString()
      );
  
      if (!websiteSelection || !websiteSelection.categories?.length) {
        return res.status(400).json({ message: 'Invalid website selection or no categories selected' });
      }
  
      // Verify categories exist
      const categories = await AdCategory.find({
        _id: { $in: websiteSelection.categories },
        websiteId: websiteId
      });
  
      if (!categories.length) {
        return res.status(404).json({ message: 'Categories not found for this website' });
      }
  
      const tx_ref = `AD-${Date.now()}-${adId}-${websiteId}`;
  
      // Format phone number to remove any spaces or special characters
      const formattedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
  
      // Create payment record first
      const payment = new Payment({
        tx_ref,
        amount: Number(amount),
        currency: 'RWF',
        email,
        phoneNumber: formattedPhone,
        userId,
        adId,
        websiteId,
        webOwnerId: categories[0].ownerId,
        status: 'pending'
      });
  
      await payment.save();
  
      // Construct Flutterwave payment payload
      const paymentPayload = {
        tx_ref,
        amount: Number(amount),
        currency: 'RWF',
        redirect_url: "http://localhost:5000/api/accept/callback",
        meta: {
          adId,
          websiteId,
          userId
        },
        customer: {
          email,
          phonenumber: formattedPhone,
          name: ad.businessName || email // Use business name or email as customer name
        },
        customizations: {
          title: 'Ad Space Payment',
          description: `Payment for ad space on website - ${ad.businessName}`,
          logo: process.env.COMPANY_LOGO_URL || '' // Optional company logo
        }
      };
  
      console.log('Flutterwave payment payload:', JSON.stringify(paymentPayload, null, 2));
  
      // Make request to Flutterwave
      const response = await axios.post(
        'https://api.flutterwave.com/v3/payments', 
        paymentPayload, 
        {
          headers: { 
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
  
      if (response.data?.status === 'success' && response.data?.data?.link) {
        res.status(200).json({ 
          paymentLink: response.data.data.link,
          tx_ref
        });
      } else {
        // If Flutterwave returns success but no payment link
        throw new Error('Invalid payment response from Flutterwave');
      }
    } catch (error) {
      console.error('Error initiating payment:', error.response?.data || error.message);
      
      // Delete the payment record if Flutterwave request failed
      if (error.response?.status === 400) {
        try {
          await Payment.findOneAndDelete({ tx_ref });
        } catch (deleteError) {
          console.error('Error deleting failed payment record:', deleteError);
        }
      }
  
      res.status(500).json({ 
        message: 'Error initiating payment',
        error: error.response?.data?.message || error.message
      });
    }
};
  
exports.adPaymentCallback = async (req, res) => {
    const session = await mongoose.startSession();
    let transactionStarted = false;
  
    try {
      const { tx_ref, transaction_id } = req.query;
      if (!tx_ref || !transaction_id) {
        return res.redirect('http://localhost:3000/approved-ads?status=invalid-params');
      }
  
      // Parse adId and websiteId from tx_ref
      const [prefix, timestamp, adId, websiteId] = tx_ref.split('-');
      if (!adId || !websiteId) {
        return res.redirect('http://localhost:3000/approved-ads?status=invalid-txref');
      }
  
      // Verify the transaction with Flutterwave
      const transactionVerification = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
        }
      );
  
      const { status, amount, currency } = transactionVerification.data.data;
  
      // Find the payment record
      const payment = await Payment.findOne({ tx_ref });
  
      if (!payment) {
        console.error('Payment record not found for tx_ref:', tx_ref);
        return res.redirect('http://localhost:3000/approved-ads?status=payment-not-found');
      }
  
      // Verify payment amount and currency
      if (payment.amount !== amount || payment.currency !== currency) {
        console.error('Payment amount or currency mismatch');
        payment.status = 'failed';
        await payment.save();
        return res.redirect('http://localhost:3000/approved-ads?status=amount-mismatch');
      }
  
      if (status === 'successful') {
        // Start transaction
        await session.startTransaction();
        transactionStarted = true;
  
        // Find the ad and its categories first
        const ad = await ImportAd.findOne({ _id: adId }).session(session);
        if (!ad) {
          throw new Error('Advertisement not found');
        }
  
        const websiteSelection = ad.websiteSelections.find(
          sel => sel.websiteId.toString() === websiteId.toString()
        );
  
        if (!websiteSelection) {
          throw new Error('Website selection not found');
        }
  
        // Find all relevant categories first
        const categories = await AdCategory.find({
          _id: { $in: websiteSelection.categories },
          websiteId: websiteId
        }).session(session);
  
        if (!categories.length) {
          throw new Error('No valid categories found');
        }
  
        // Update the ad status
        const updatedAd = await ImportAd.findOneAndUpdate(
          { 
            _id: adId,
            'websiteSelections': {
              $elemMatch: {
                websiteId: websiteId,
                approved: true,
                confirmed: { $ne: true }
              }
            }
          },
          { 
            $set: { 
              'websiteSelections.$.confirmed': true,
              'websiteSelections.$.confirmedAt': new Date()
            }
          },
          { 
            new: true,
            session 
          }
        );
  
        if (!updatedAd) {
          throw new Error('Failed to update ad confirmation status');
        }
  
        // Update categories
        await AdCategory.updateMany(
          { 
            _id: { $in: websiteSelection.categories },
            websiteId: websiteId
          },
          { $addToSet: { selectedAds: updatedAd._id } },
          { session }
        );
  
        // Update web owner's balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId: payment.webOwnerId },
          {
            $inc: {
              totalEarnings: payment.amount,
              availableBalance: payment.amount
            }
          },
          { upsert: true, session }
        );
  
        // Create payment trackers for each category
        const paymentTrackers = categories.map(category => ({
          userId: payment.webOwnerId,
          adId: ad._id,
          categoryId: category._id,
          paymentDate: new Date(),
          amount: amount / categories.length, // Split amount across categories
          viewsRequired: category.visitorRange.max,
          currentViews: 0,
          status: 'pending'
        }));
  
        await PaymentTracker.insertMany(paymentTrackers, { session });
        
        // Update payment status
        payment.status = 'successful';
        await payment.save({ session });
  
        await session.commitTransaction();
        transactionStarted = false;
  
        return res.redirect('http://localhost:3000/approved-ads?status=success');
      } else {
        payment.status = 'failed';
        await payment.save();
        return res.redirect('http://localhost:3000/approved-ads?status=failed');
      }
    } catch (error) {
      console.error('Error handling payment callback:', error);
      if (transactionStarted) {
        await session.abortTransaction();
      }
      return res.redirect('http://localhost:3000/approved-ads?status=error');
    } finally {
      await session.endSession();
    }
};