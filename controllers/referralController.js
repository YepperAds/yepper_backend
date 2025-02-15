// controllers/referralController.js
const ReferralCode = require('../models/ReferralCode');
const Referral = require('../models/Referral');
const Website = require('../models/WebsiteModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');
const Payment = require('../models/PaymentModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel');

function generateUniqueCode(length = 8) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

const referralController = {
  async generateCode(req, res) {
    try {
      const { userId, userType } = req.body;
      console.log('Generating code for user:', userId); // Debug log
      
      let referralCode = await ReferralCode.findOne({ userId });
      
      if (!referralCode) {
        let code;
        let isUnique = false;
        
        while (!isUnique) {
          code = generateUniqueCode();
          const existing = await ReferralCode.findOne({ code });
          if (!existing) {
            isUnique = true;
          }
        }
        
        referralCode = await ReferralCode.create({
          userId,
          code,
          userType,
          totalReferrals: 0
        });
        console.log('Created new referral code:', referralCode); // Debug log
      }
      
      res.json({ 
        success: true, 
        referralCode: {
          code: referralCode.code,
          userId: referralCode.userId,
          totalReferrals: referralCode.totalReferrals
        }
      });
    } catch (error) {
      console.error('Error generating code:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
  
  async recordReferral(req, res) {
    try {
      const { referralCode, referredUserId, userType, referredUserDetails } = req.body;
      
      // Validate referral code
      const referrerCode = await ReferralCode.findOne({ code: referralCode });
      if (!referrerCode) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid referral code' 
        });
      }
      
      // Check for existing referral
      const existingReferral = await Referral.findOne({ referredUserId });
      if (existingReferral) {
        return res.status(400).json({ 
          success: false, 
          message: 'User already referred' 
        });
      }
      
      // Create new referral
      const referral = await Referral.create({
        referrerId: referrerCode.userId,
        referredUserId,
        referralCode,
        userType,
        referredUserDetails,
        status: 'pending',
        lastUpdated: new Date()
      });
      
      res.json({ success: true, referral });
    } catch (error) {
      console.error('Error in recordReferral:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error recording referral' 
      });
    }
  },

  async debugReferral(req, res) {
    try {
      const { userId } = req.params;
      
      console.log('Debugging referral for user:', userId);
      
      const referralCode = await ReferralCode.find({}).lean();
      console.log('All referral codes:', referralCode);
      
      const referrals = await Referral.find({}).lean();
      console.log('All referrals:', referrals);
      
      const websites = await Website.find({ ownerId: userId }).lean();
      console.log('User websites:', websites);
      
      const categories = await AdCategory.find({ ownerId: userId }).lean();
      console.log('User categories:', categories);
      
      res.json({
        referralCodes: referralCode,
        referrals,
        websites,
        categories
      });
    } catch (error) {
      console.error('Debug error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async completeReferral(req, res) {
    try {
      const { referredUserId } = req.body;
      
      const referral = await Referral.findOne({ referredUserId, status: 'pending' });
      if (!referral) {
        return res.status(404).json({ success: false, error: 'No pending referral found' });
      }
      
      referral.status = 'qualified';
      referral.qualifiedAt = new Date();
      await referral.save();
      
      await ReferralCode.updateOne(
        { userId: referral.referrerId },
        { $inc: { totalReferrals: 1 } }
      );
      
      res.json({ success: true, referral });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getReferralStats(req, res) {
    try {
      const { userId } = req.params;
      
      const [referralCode, referrals] = await Promise.all([
        ReferralCode.findOne({ userId }).lean(),
        Referral.find({ referrerId: userId })
          .sort({ createdAt: -1 })
          .lean()
      ]);
      
      if (!referralCode) {
        return res.status(404).json({ 
          success: false, 
          message: 'Referral code not found' 
        });
      }
      
      const stats = {
        code: referralCode.code,
        totalReferrals: referralCode.totalReferrals,
        pendingReferrals: referrals.filter(r => r.status === 'pending').length,
        qualifiedReferrals: referrals.filter(r => r.status === 'qualified').length,
        referrals: referrals.map(ref => ({
          userId: ref.referredUserId,
          status: ref.status,
          userDetails: ref.referredUserDetails,
          websiteDetails: ref.websiteDetails,
          categoryDetails: ref.categoryDetails,
          createdAt: ref.createdAt,
          qualifiedAt: ref.qualifiedAt
        }))
      };
      
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Error in getReferralStats:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching referral stats' 
      });
    }
  },

  async checkQualifications(req, res) {
    try {
      const pendingReferrals = await Referral.find({ status: 'pending' });
      
      for (const referral of pendingReferrals) {
        if (referral.userType === 'website_owner') {
          const websiteCount = await Website.countDocuments({ ownerId: referral.referredUserId });
          const adCategoryCount = await AdCategory.countDocuments({ ownerId: referral.referredUserId });

          if (websiteCount >= 1 && adCategoryCount >= 1) {
            referral.status = 'qualified';
            referral.qualifiedAt = new Date();
            await referral.save();
          }
        } else if (referral.userType === 'advertiser') {
          const adsCount = await ImportAd.countDocuments({ userId: referral.referredUserId });

          if (adsCount >= 1) {
            referral.status = 'qualified';
            referral.qualifiedAt = new Date();
            await referral.save();
          }
        }
      }
      
      res.json({ success: true, message: 'Qualification check completed' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = referralController;