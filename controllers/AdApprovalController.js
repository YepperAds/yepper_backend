// AdApprovalController.js
const sendEmailNotification = require('./emailService');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
const AdApproval = require('../models/AdApprovalModel');
const ImportAd = require('../models/ImportAdModel');
const AdSpace = require('../models/AdSpaceModel');
const AdCategory = require('../models/AdCategoryModel');
const Website = require('../models/WebsiteModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
const Payment = require('../models/PaymentModel');
const Withdrawal = require('../models/WithdrawalModel');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// exports.getPendingAds = async (req, res) => {
//   try {
//     const { ownerId } = req.params;  // Owner's ID from params

//     // Fetch the owner's websites, categories, and ad spaces
//     const websites = await Website.find({ ownerId });
//     const websiteIds = websites.map(website => website._id);

//     const categories = await AdCategory.find({ websiteId: { $in: websiteIds } });
//     const categoryIds = categories.map(category => category._id);

//     // const adSpaces = await AdSpace.find({ categoryId: { $in: categoryIds } });
//     // const adSpaceIds = adSpaces.map(space => space._id);

//     // Fetch pending ads that belong to the owner's ad spaces
//     const pendingAds = await ImportAd.find({
//       approved: false,
//       selectedCategories: { $in: categoryIds }
//     }).populate('selectedCategories selectedWebsites');

//     res.status(200).json(pendingAds);
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching pending ads' });
//   }
// };

exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    // First verify the requesting user owns these websites
    const websites = await Website.find({ 
      ownerId: ownerId 
    });
    
    if (!websites.length) {
      return res.status(403).json({ 
        message: 'No websites found for this owner' 
      });
    }

    const websiteIds = websites.map(website => website._id);

    // Add owner verification to the query
    const pendingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: { $in: websiteIds },
          approved: false
        }
      }
    })
    .populate({
      path: 'websiteSelections.websiteId',
      match: { ownerId: ownerId } // Only populate websites owned by the requesting user
    })
    .populate('websiteSelections.categories');

    // Filter out any selections where websiteId is null (means user doesn't own it)
    const transformedAds = pendingAds
      .map(ad => {
        // Only include website selections the user owns
        const validSelections = ad.websiteSelections.filter(
          selection => selection.websiteId !== null
        );

        // If no valid selections remain, return null
        if (validSelections.length === 0) return null;

        return {
          _id: ad._id,
          businessName: ad.businessName,
          businessLink: ad.businessLink,
          businessLocation: ad.businessLocation,
          adDescription: ad.adDescription,
          imageUrl: ad.imageUrl,
          videoUrl: ad.videoUrl,
          pdfUrl: ad.pdfUrl,
          websiteDetails: validSelections.map(selection => ({
            website: selection.websiteId,
            categories: selection.categories,
            approved: selection.approved
          }))
        };
      })
      .filter(ad => ad !== null); // Remove any null entries

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Error fetching pending ads', error: error.message });
  }
};

exports.approveAdForWebsite = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    // First verify the ad and website exist
    const ad = await ImportAd.findById(adId);
    const website = await Website.findById(websiteId);

    if (!ad || !website) {
      return res.status(404).json({ 
        message: `${!ad ? 'Ad' : 'Website'} not found` 
      });
    }

    // Find the website selection that matches our websiteId
    const websiteSelection = ad.websiteSelections.find(
      ws => ws.websiteId.toString() === websiteId
    );

    if (!websiteSelection) {
      return res.status(404).json({ 
        message: 'This ad is not associated with the specified website' 
      });
    }

    // Update the approval status
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId 
      },
      {
        $set: {
          'websiteSelections.$.approved': true,
          'websiteSelections.$.approvedAt': new Date()
        }
      },
      { 
        new: true,
        runValidators: true 
      }
    ).populate('websiteSelections.websiteId websiteSelections.categories');

    if (!updatedAd) {
      return res.status(500).json({ 
        message: 'Error updating ad approval status' 
      });
    }

    // Check if all websites are now approved
    const allWebsitesApproved = updatedAd.websiteSelections.every(ws => ws.approved);

    // If all websites are approved, update the main confirmed status
    if (allWebsitesApproved && !updatedAd.confirmed) {
      updatedAd.confirmed = true;
      await updatedAd.save();
    }

    res.status(200).json({
      message: 'Ad approved successfully',
      ad: updatedAd,
      allApproved: allWebsitesApproved
    });

  } catch (error) {
    console.error('Ad approval error:', error);
    res.status(500).json({ 
      message: 'Error processing ad approval', 
      error: error.message 
    });
  }
};

// exports.getUserMixedAds = async (req, res) => {
//   const { userId } = req.params;

//   try {
//     // Fetch both pending and approved ads in a single query
//     const mixedAds = await ImportAd.find({
//       userId,
//       $or: [
//         { approved: false },
//         { approved: true }
//       ]
//     })
//       .populate({
//         path: 'selectedCategories',
//         select: 'price ownerId',
//       })
//       // .populate({
//       //   path: 'selectedSpaces',
//       //   select: 'price webOwnerEmail',
//       // })
//       .populate('selectedWebsites', 'websiteName websiteLink logoUrl');

//     const adsWithDetails = mixedAds.map(ad => {
//       const categoryPriceSum = ad.selectedCategories.reduce((sum, category) => sum + (category.price || 0), 0);
//       // const spacePriceSum = ad.selectedSpaces.reduce((sum, space) => sum + (space.price || 0), 0);
//       const totalPrice = categoryPriceSum;
//       // const totalPrice = categoryPriceSum + spacePriceSum;

//       return {
//         ...ad.toObject(),
//         totalPrice,
//         isConfirmed: ad.confirmed,
//         categoryOwnerIds: ad.selectedCategories.map(cat => cat.ownerId),
//         // spaceOwnerEmails: ad.selectedSpaces.map(space => space.webOwnerEmail),
//         clicks: ad.clicks,
//         views: ad.views,
//         status: ad.approved ? 'approved' : 'pending'
//       };
//     });

//     res.status(200).json(adsWithDetails);
//   } catch (error) {
//     console.error('Error fetching mixed ads:', error);
//     res.status(500).json({ message: 'Failed to fetch ads', error });
//   }
// };

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

exports.getPendingAdById = async (req, res) => {
  try {
    const { adId } = req.params;
    console.log('Fetching ad with ID:', adId); // Debugging log

    const ad = await ImportAd.findById(adId)
      // .populate('selectedSpaces selectedCategories selectedWebsites');
      .populate('selectedCategories selectedWebsites');

    if (!ad) {
      console.log('Ad not found for ID:', adId); // Log when ad is missing
      return res.status(404).json({ message: 'Ad not found' });
    }

    res.status(200).json(ad);
  } catch (error) {
    console.error('Error fetching ad:', error); // Catch any unexpected errors
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.approveAd = async (req, res) => {
  try {
    const { adId } = req.params;

    // Only update the approved status, don't push to API yet
    const approvedAd = await ImportAd.findByIdAndUpdate(
      adId,
      { approved: true },
      { new: true }
    ).populate('userId');

    if (!approvedAd) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Notify the ad owner about approval (implement your notification system here)
    console.log(`Notification: Ad for ${approvedAd.businessName} has been approved. Awaiting confirmation from the ad owner.`);
    
    // // Notify each web owner via email
    //   const emailBody = `
    //     <h2>Your Ad has been approved</h2>
    //     <p>Hello,</p>
    //     <p><strong>Business Name:</strong> ${approvedAd.businessName}</p>
    //     <p><strong>Description:</strong> ${approvedAd.adDescription}</p>
    //   `;
    //   await sendEmailNotification(approvedAd.adOwnerEmail, 'New Ad Request for Your Space', emailBody);

    res.status(200).json({
      message: 'Ad approved successfully. Waiting for advertiser confirmation.',
      ad: approvedAd
    });

  } catch (error) {
    console.error('Error approving ad:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAdDetails = async (req, res) => {
  const { adId } = req.params;

  try {
    const ad = await ImportAd.findById(adId)
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'categoryName price ownerId'
      });

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const adDetails = {
      ...ad.toObject(),
      totalPrice: ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0),
      websiteStatuses: ad.websiteSelections.map(selection => ({
        websiteId: selection.websiteId._id,
        websiteName: selection.websiteId.websiteName,
        websiteLink: selection.websiteId.websiteLink,
        categories: selection.categories,
        approved: selection.approved,
        confirmed: selection.confirmed || false,
        approvedAt: selection.approvedAt
      }))
    };

    res.status(200).json(adDetails);
  } catch (error) {
    console.error('Error fetching ad details:', error);
    res.status(500).json({ message: 'Failed to fetch ad details', error: error.message });
  }
};

exports.getApprovedAds = async (req, res) => {
  try {
    const approvedAds = await ImportAd.find({ approved: true })
      .populate('selectedSpaces selectedWebsites selectedCategories');

    res.status(200).json(approvedAds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching approved ads' });
  }
};

exports.getApprovedAdsByUser = async (req, res) => {
  try {
    const { ownerId } = req.params;  // Owner's ID from params

    // Fetch the owner's websites, categories, and ad spaces
    const websites = await Website.find({ ownerId });
    const websiteIds = websites.map(website => website._id);

    const categories = await AdCategory.find({ websiteId: { $in: websiteIds } });
    const categoryIds = categories.map(category => category._id);

    const adSpaces = await AdSpace.find({ categoryId: { $in: categoryIds } });
    const adSpaceIds = adSpaces.map(space => space._id);

    // Fetch approved ads that belong to the owner's ad spaces
    const approvedAds = await ImportAd.find({
      approved: true,
      selectedSpaces: { $in: adSpaceIds }
    }).populate('selectedSpaces selectedCategories selectedWebsites');

    res.status(200).json(approvedAds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching approved ads' });
  }
};

// exports.confirmAdDisplay = async (req, res) => {
//   try {
//     const { adId } = req.params;

//     // Update the ad's confirmation status
//     const confirmedAd = await ImportAd.findByIdAndUpdate(
//       adId,
//       { 
//         confirmed: true,
//         $set: { 
//           confirmationDate: new Date() 
//         }
//       },
//       { new: true }
//     );

//     if (!confirmedAd) {
//       return res.status(404).json({ message: 'Ad not found' });
//     }

//     // Update all selected spaces to include this ad
//     await AdCategory.updateMany(
//       // { _id: { $in: confirmedAd.selectedSpaces } },
//       { _id: { $in: confirmedAd.selectedCategories } },
//       { 
//         $addToSet: { 
//           selectedAds: confirmedAd._id 
//         }
//       }
//     );

//     res.status(200).json({ 
//       message: 'Ad confirmed and now live on selected spaces',
//       ad: confirmedAd
//     });

//   } catch (error) {
//     console.error('Error confirming ad display:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

exports.confirmWebsiteAd = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    // Find the ad and update the specific website selection
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId,
        'websiteSelections.approved': true // Only allow confirmation if approved
      },
      { 
        $set: { 
          'websiteSelections.$.confirmed': true,
          'websiteSelections.$.confirmedAt': new Date()
        }
      },
      { new: true }
    );

    if (!updatedAd) {
      return res.status(404).json({ 
        message: 'Ad not found or website not approved for confirmation' 
      });
    }

    // Find the relevant website selection
    const websiteSelection = updatedAd.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId
    );

    // Update the ad categories for this website
    if (websiteSelection) {
      await AdCategory.updateMany(
        { _id: { $in: websiteSelection.categories } },
        { $addToSet: { selectedAds: updatedAd._id } }
      );
    }

    res.status(200).json({ 
      message: 'Ad confirmed for selected website',
      ad: updatedAd
    });

  } catch (error) {
    console.error('Error confirming website ad:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.initiateAdPayment = async (req, res) => {
  try {
    const { adId, amount, email, phoneNumber, userId } = req.body;

    if (!userId || userId.trim() === '') {
      return res.status(400).json({ message: 'Invalid request: User ID is required.' });
    }

    const ad = await ImportAd.findById(adId).populate('selectedSpaces');
    if (!ad || !ad.selectedSpaces || ad.selectedSpaces.length === 0) {
      return res.status(404).json({ message: 'Ad or selected spaces not found' });
    }

    // Get the web owner ID from the first selected space
    const webOwnerId = ad.selectedSpaces[0].webOwnerId;
    if (!webOwnerId) {
      return res.status(404).json({ message: 'Web owner ID not found for selected spaces.' });
    }

    const tx_ref = `CARDPAY-${Date.now()}`;

    const payment = new Payment({
      tx_ref,
      amount,
      currency: 'RWF',
      email,
      phoneNumber,
      userId,
      adId,
      webOwnerId, // Store the web owner ID in the payment
      status: 'pending',
    });

    await payment.save();

    const paymentPayload = {
      tx_ref,
      amount,
      currency: 'RWF',
      redirect_url: 'https://yepper-backend.onrender.com/api/accept/callback',
      customer: { email, phonenumber: phoneNumber },
      payment_options: 'card',
      customizations: {
        title: 'Ad Payment',
        description: 'Payment for ad display',
      },
    };

    const response = await axios.post('https://api.flutterwave.com/v3/payments', paymentPayload, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    });

    if (response.data?.data?.link) {
      res.status(200).json({ paymentLink: response.data.data.link });
    } else {
      res.status(500).json({ message: 'Payment initiation failed.' });
    }
  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({ message: 'Error initiating payment.', error });
  }
};

// exports.adPaymentCallback = async (req, res) => {
//   try {
//     const { tx_ref, transaction_id } = req.query;

//     const transactionVerification = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
//       headers: {
//         Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
//       }
//     });

//     const { status } = transactionVerification.data.data;

//     if (status === 'successful') {
//       const payment = await Payment.findOneAndUpdate(
//         { tx_ref },
//         { status: 'successful' },
//         { new: true }
//       );

//       if (payment) {
//         // Confirm the related ad
//         await ImportAd.findByIdAndUpdate(payment.adId, { confirmed: true });

//         return res.redirect('https://yepper.vercel.app/dashboard'); // Redirect user after successful payment
//       }
//     } else {
//       await Payment.findOneAndUpdate({ tx_ref }, { status: 'failed' });
//       return res.redirect('https://yepper.vercel.app');
//     }
//   } catch (error) {
//     console.error('Error in payment callback:', error);
//     res.status(500).send('Error verifying payment');
//   }
// };

exports.updateWebOwnerBalance = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || userId.trim() === '') {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    const balanceRecord = await WebOwnerBalance.findOneAndUpdate(
      { userId },
      { $inc: { totalEarnings: amount, availableBalance: amount } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({ message: 'Balance updated successfully.', balance: balanceRecord });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ message: 'Error updating balance.', error: error.message });
  }
};

exports.adPaymentCallback = async (req, res) => {
  try {
    const { tx_ref, transaction_id } = req.query;

    // Verify the transaction with Flutterwave
    const transactionVerification = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      },
    });

    const { status, customer } = transactionVerification.data.data;

    if (status === 'successful') {
      const payment = await Payment.findOne({ tx_ref });

      if (payment) {
        // Update payment status
        payment.status = 'successful';
        await payment.save();

        // Confirm the related ad
        await ImportAd.findByIdAndUpdate(payment.adId, { confirmed: true });

        // Update the web owner's balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId: payment.webOwnerId },
          {
            $inc: {
              totalEarnings: payment.amount,
              availableBalance: payment.amount,
            }
          },
          { 
            upsert: true,
            setDefaultsOnInsert: true 
          }
        );

        return res.redirect('http://localhost:3000/approved-ads');
      }
    } else {
      await Payment.findOneAndUpdate({ tx_ref }, { status: 'failed' });
      return res.redirect('http://localhost:3000');
    }
  } catch (error) {
    console.error('Error handling payment callback:', error);
    res.status(500).json({ message: 'Error handling payment callback.', error });
  }
};

exports.getWebOwnerBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const balance = await WebOwnerBalance.findOne({ userId });

    if (!balance) {
      return res.status(404).json({ message: 'No balance found for this user' });
    }

    res.status(200).json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ 
      message: 'Error fetching balance', 
      error: error.message 
    });
  }
};

exports.initiateWithdrawal = async (req, res) => {
  try {
    const { userId, amount, phoneNumber } = req.body;

    if (!userId || !amount || !phoneNumber) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if user has sufficient balance
    const balance = await WebOwnerBalance.findOne({ userId });
    if (!balance || balance.availableBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      userId,
      amount,
      phoneNumber,
    });

    // Initialize MoMo transfer using Flutterwave
    const transferPayload = {
      account_bank: 'MPS', // Mobile Payment Service
      account_number: phoneNumber,
      amount,
      currency: 'RWF',
      beneficiary_name: 'MoMo Transfer',
      reference: `MOMO-${Date.now()}`,
      callback_url: "https://yepper-backend.onrender.com/api/accept/withdrawal-callback",
      debit_currency: 'RWF'
    };

    const response = await axios.post('https://api.flutterwave.com/v3/transfers', transferPayload, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });

    if (response.data?.status === 'success') {
      withdrawal.transactionId = response.data.data.id;
      withdrawal.status = 'processing';
      await withdrawal.save();

      // Update user's available balance
      await WebOwnerBalance.findOneAndUpdate(
        { userId },
        { $inc: { availableBalance: -amount } }
      );

      return res.status(200).json({
        message: 'Withdrawal initiated successfully',
        withdrawal
      });
    } else {
      withdrawal.status = 'failed';
      withdrawal.failureReason = 'Transfer initiation failed';
      await withdrawal.save();
      return res.status(400).json({ message: 'Failed to initiate transfer' });
    }
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ message: 'Error processing withdrawal', error: error.message });
  }
};

exports.withdrawalCallback = async (req, res) => {
  try {
    const { data } = req.body;
    const withdrawal = await Withdrawal.findOne({ transactionId: data.id });

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    if (data.status === 'successful') {
      withdrawal.status = 'completed';
    } else {
      withdrawal.status = 'failed';
      withdrawal.failureReason = data.complete_message;
      
      // Refund the amount back to available balance
      await WebOwnerBalance.findOneAndUpdate(
        { userId: withdrawal.userId },
        { $inc: { availableBalance: withdrawal.amount } }
      );
    }

    await withdrawal.save();
    res.status(200).json({ message: 'Callback processed successfully' });
  } catch (error) {
    console.error('Withdrawal callback error:', error);
    res.status(500).json({ message: 'Error processing callback', error: error.message });
  }
};

exports.getOwnerPayments = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const payments = await Payment.find({ webOwnerId: userId });

    if (!payments.length) {
      return res.status(404).json({ message: 'No payments found for this user' });
    }

    res.status(200).json({ payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      message: 'Error fetching payments',
      error: error.message,
    });
  }
};

// exports.getUserPendingAds = async (req, res) => {
//   try {
//     const { userId } = req.params; // Importer's ID from params

//     // Fetch pending ads imported by this user
//     const pendingAds = await ImportAd.find({
//       userId,
//       approved: false
//     }).populate('selectedSpaces selectedCategories selectedWebsites');

//     res.status(200).json(pendingAds);
//   } catch (error) {
//     console.error('Error fetching user’s pending ads:', error);
//     res.status(500).json({ message: 'Error fetching user’s pending ads' });
//   }
// };