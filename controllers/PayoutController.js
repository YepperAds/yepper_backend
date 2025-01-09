// controllers/PayoutController.js
const Flutterwave = require('flutterwave-node-v3');
const Payment = require('../models/PaymentModel');
const Picture = require('../models/PictureModel');
const { getPublicIP } = require('../utils/ipUtil');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const MIN_PAYOUT_AMOUNT = 1000; // Minimum payout in RWF
const MAX_PAYOUT_AMOUNT = 2000000; // Maximum payout in RWF

exports.requestPayout = async (req, res) => {
  let transaction = null;
  
  try {
    const { creatorId, amount, phoneNumber, beneficiaryName } = req.body;
    
    // Input validation
    if (!creatorId || !amount || !phoneNumber || !beneficiaryName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields',
        details: { creatorId, amount, phoneNumber, beneficiaryName }
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < MIN_PAYOUT_AMOUNT || numAmount > MAX_PAYOUT_AMOUNT) {
      return res.status(400).json({
        status: 'error',
        message: `Amount must be between ${MIN_PAYOUT_AMOUNT} and ${MAX_PAYOUT_AMOUNT} RWF`,
        details: { amount, min: MIN_PAYOUT_AMOUNT, max: MAX_PAYOUT_AMOUNT }
      });
    }

    // Phone validation for Rwanda
    const phoneRegex = /^(?:\+250|0)?7[23489]\d{7}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Rwandan phone number format',
        examples: ['+250781234567', '0781234567']
      });
    }

    // Format phone number consistently
    const formattedPhone = phoneNumber.startsWith('+250') 
      ? phoneNumber 
      : phoneNumber.replace(/^0/, '+250');

    // Verify available balance
    const pictures = await Picture.find({ ownerId: creatorId });
    if (!pictures.length) {
      return res.status(404).json({
        status: 'error',
        message: 'No content found for creator',
        creatorId
      });
    }

    const payments = await Payment.find({
      pictureId: { $in: pictures.map(p => p._id) },
      status: 'successful',
      withdrawalStatus: 'none'
    });

    const availableBalance = payments.reduce((sum, p) => sum + p.amount, 0);
    if (numAmount > availableBalance) {
      return res.status(400).json({
        status: 'error',
        message: 'Insufficient balance',
        details: {
          requested: numAmount,
          available: availableBalance,
          currency: 'RWF'
        }
      });
    }

    // Generate unique reference
    const reference = `PAYOUT-${creatorId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initiate transfer
    const payoutResponse = await flw.Transfer.initiate({
      account_bank: 'MPS', // Mobile Money Rwanda
      account_number: formattedPhone,
      amount: numAmount,
      narration: `Creator payout - ${creatorId}`,
      currency: 'RWF',
      reference,
      callback_url: `${process.env.BASE_URL}/api/payout/callback`,
      debit_currency: 'RWF',
      beneficiary_name: beneficiaryName, // Add beneficiary name field
      meta: {
        creator_id: creatorId,
        payment_ids: payments.map(p => p._id.toString())
      }
    });

    if (payoutResponse.status !== 'success') {
      throw new Error(payoutResponse.message || 'Transfer initiation failed');
    }

    // Update payment records
    await Payment.updateMany(
      { _id: { $in: payments.map(p => p._id) } },
      { 
        $set: {
          withdrawalStatus: 'pending',
          payoutReference: reference,
          payoutInitiatedAt: new Date(),
          lastModified: new Date()
        }
      }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Payout initiated successfully',
      data: {
        reference,
        amount: numAmount,
        currency: 'RWF',
        phone: formattedPhone,
        beneficiaryName,
        transferId: payoutResponse.data.id
      }
    });

  } catch (error) {
    console.error('Payout Error:', error);

    // If we have a transaction ID, try to verify its status
    if (transaction?.id) {
      try {
        const status = await flw.Transfer.fetch(transaction.id);
        console.log('Transfer status:', status);
      } catch (verifyError) {
        console.error('Status verification failed:', verifyError);
      }
    }

    return res.status(error.response?.status || 500).json({
      status: 'error',
      message: error.message || 'Payout processing failed',
      code: error.response?.data?.code,
      reference: transaction?.reference
    });
  }
};








// const axios = require('axios');
// const Payment = require('../models/PaymentModel');
// const Withdrawal = require('../models/WithdrawalModel');
// const mongoose = require('mongoose');

// class PayoutService {
//   // Validate input parameters
//   static validatePayoutInput(amount, phoneNumber, beneficiaryName, userId) {
//     if (!amount || typeof amount !== 'number' || amount <= 0) {
//       throw new Error('Invalid amount. Must be a positive number.');
//     }
  
//     if (!phoneNumber || !/^(07\d{8})$/.test(phoneNumber)) {
//       throw new Error('Invalid phone number. Must start with 07 and be 10 digits.');
//     }
  
//     if (!beneficiaryName) {
//       throw new Error('Beneficiary name is required.');
//     }
  
//     if (!userId) {
//       throw new Error('User ID is required.');
//     }
//   }

//   // Fetch user earnings
//   static async fetchUserEarnings(userId) {
//     try {
//       const response = await axios.get(`https://yepper-backend.onrender.com/api/picture/earnings/${userId}`);
//       return response.data.totalEarnings;
//     } catch (error) {
//       console.error('Error fetching user earnings:', error);
//       throw new Error('Could not retrieve user earnings');
//     }
//   }

//   // Prepare Flutterwave payout payload
//   static preparePayoutPayload(phoneNumber, amount, tx_ref, beneficiaryName) {
//     return {
//       account_bank: "MPS", 
//       account_number: phoneNumber.replace(/^0/, '250'), // Convert leading 0 to 250
//       amount: Number(amount).toFixed(2),
//       narration: "Creator Earnings Payout",
//       currency: "RWF",
//       reference: tx_ref,
//       beneficiary_name: beneficiaryName, // Add beneficiary name
//       callback_url: "https://yepper-backend.onrender.com/api/payout/callback"
//     };
//   }

//   static logDetailedError(error) {
//     console.error('Detailed Payout Error:', {
//       message: error.message,
//       requestPayload: this.lastPayload, // Store the last payload as a class variable
//       response: error.response ? error.response.data : 'No response',
//       status: error.response ? error.response.status : 'Unknown',
//       headers: error.response ? error.response.headers : 'No headers'
//     });
//   }
// }
 
// exports.initiatePayoutTransfer = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { amount, phoneNumber, userId, beneficiaryName } = req.body;

//     // Validate input
//     PayoutService.validatePayoutInput(amount, phoneNumber, beneficiaryName, userId);

//     if (!beneficiaryName) {
//       return res.status(400).json({ 
//         message: 'Beneficiary name is required for the transfer'
//       });
//     }
    
//     // Verify user's earnings
//     const totalEarnings = await PayoutService.fetchUserEarnings(userId);

//     // Check if user has enough earnings
//     if (totalEarnings < amount) {
//       return res.status(400).json({ 
//         message: 'Insufficient funds',
//         currentBalance: totalEarnings 
//       });
//     }

//     // Generate a unique, more robust transaction reference
//     const tx_ref = `PAYOUT-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

//     // Prepare Flutterwave payout payload
//     const payoutPayload = PayoutService.preparePayoutPayload(
//       phoneNumber, 
//       amount, 
//       tx_ref, 
//       beneficiaryName
//     );

//     try {
//       // Initiate payout via Flutterwave
//       const response = await axios.post('https://api.flutterwave.com/v3/transfers', payoutPayload, {
//         headers: {
//           Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
//           'Content-Type': 'application/json',
//         },
//         timeout: 10000 // 10 second timeout
//       });

//       // Create withdrawal record
//       const withdrawal = new Withdrawal({
//         userId,
//         phoneNumber,
//         amount,
//         beneficiaryName, // Add this line
//         status: response.data.status === 'success' ? 'pending' : 'failed'
//       });

//       await withdrawal.save({ session });

//       // Create payment record
//       const payment = new Payment({
//         tx_ref,
//         amount,
//         currency: 'RWF',
//         status: response.data.status === 'success' ? 'pending' : 'failed',
//         phoneNumber,
//         userId,
//         pictureId: null, // Generate a new ObjectId
//         withdrawalStatus: response.data.status === 'success' ? 'pending' : 'none'
//       });

//       await payment.save({ session });

//       // Commit transaction
//       await session.commitTransaction();
//       session.endSession();

//       // Respond based on Flutterwave response
//       if (response.data.status === 'success') {
//         return res.status(200).json({ 
//           message: 'Payout initiated successfully', 
//           reference: tx_ref,
//           amount: amount
//         });
//       } else {
//         return res.status(400).json({ 
//           message: 'Payout initiation failed', 
//           error: response.data 
//         });
//       }
//     } catch (flutterwaveError) {
//       // Log detailed Flutterwave error
//       PayoutService.logDetailedError(flutterwaveError);

//       // Abort transaction
//       await session.abortTransaction();
//       session.endSession();

//       // Handle specific Flutterwave error scenarios
//       if (flutterwaveError.response) {
//         const errorData = flutterwaveError.response.data;
//         return res.status(500).json({ 
//           message: 'Flutterwave payout error',
//           details: {
//             code: errorData.code || 'UNKNOWN',
//             message: errorData.message || 'Unexpected Flutterwave error'
//           }
//         });
//       }

//       return res.status(500).json({ 
//         message: 'Error processing payout', 
//         error: flutterwaveError.message 
//       });
//     }
//   } catch (error) {
//     // Handle validation or other errors
//     console.error('Payout initialization error:', error);
//     return res.status(400).json({ 
//       message: error.message || 'Payout initialization failed'
//     });
//   }
// };

// // Payout callback handler
// exports.payoutCallback = async (req, res) => {
//   try {
//     const { tx_ref, status, id: transferId } = req.body;

//     // Find and update the payment record
//     const payment = await Payment.findOneAndUpdate(
//       { tx_ref },
//       { 
//         status: status === 'successful' ? 'successful' : 'failed',
//         withdrawalStatus: status === 'successful' ? 'completed' : 'none',
//         flutterwaveTransferId: transferId
//       },
//       { new: true }
//     );

//     // Update corresponding withdrawal
//     if (payment) {
//       await Withdrawal.findOneAndUpdate(
//         { userId: payment.userId, amount: payment.amount },
//         { status: status === 'successful' ? 'processed' : 'failed' }
//       );
//     }

//     res.status(200).json({ message: 'Callback processed successfully' });
//   } catch (error) {
//     console.error('Payout callback error:', error);
//     res.status(500).json({ message: 'Error processing payout callback' });
//   }
// };