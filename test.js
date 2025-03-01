// ----- MODELS -----

// models/ReferralCode.js
const mongoose = require('mongoose');

const referralCodeSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true, unique: true, index: true },
  userType: { type: String, enum: ['promoter', 'website_owner', 'advertiser'], required: true },
  totalReferrals: { type: Number, default: 0 },
  totalQualifiedReferrals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('ReferralCode', referralCodeSchema);

// models/Referral.js
const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: String, required: true, index: true },
  referredUserId: { type: String, required: true, unique: true, index: true },
  referralCode: { type: String, required: true, index: true },
  userType: { type: String, enum: ['website_owner', 'advertiser'], required: true },
  status: { 
    type: String, 
    enum: ['pending', 'website_created', 'category_created', 'qualified'],
    default: 'pending'
  },
  referredUserDetails: {
    firstName: String,
    lastName: String,
    email: String,
    createdAt: Date
  },
  websiteDetails: [{
    websiteId: String,
    websiteName: String,
    websiteLink: String,
    createdAt: Date
  }],
  categoryDetails: [{
    categoryId: String,
    categoryName: String,
    createdAt: Date
  }],
  createdAt: { type: Date, default: Date.now },
  qualifiedAt: Date,
  lastUpdated: { type: Date, default: Date.now },
  completionProgress: { type: Number, default: 0 }
});

module.exports = mongoose.model('Referral', referralSchema);

// ----- CONTROLLERS -----

// controllers/referralController.js
const ReferralCode = require('../models/ReferralCode');
const Referral = require('../models/Referral');
const Website = require('../models/WebsiteModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');
const { createLogger } = require('../utils/logger');

const logger = createLogger('referralController');

function generateUniqueCode(length = 8) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

function calculateReferralProgress(referral) {
  let totalSteps = 0;
  let completedSteps = 0;
  
  // Define required steps based on user type
  if (referral.userType === 'website_owner') {
    totalSteps = 2; // Website creation + Category creation
    if (referral.websiteDetails && referral.websiteDetails.length > 0) completedSteps++;
    if (referral.categoryDetails && referral.categoryDetails.length > 0) completedSteps++;
  } else if (referral.userType === 'advertiser') {
    totalSteps = 1; // Import ad creation
    // Check ad creation (determined elsewhere)
  }
  
  return Math.round((completedSteps / totalSteps) * 100);
}

const referralController = {
  /**
   * Generates or retrieves a referral code for a user
   */
  async generateCode(req, res) {
    try {
      const { userId, userType } = req.body;
      
      if (!userId || !userType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId and userType are required'
        });
      }
      
      // Find existing code or create new one
      let referralCode = await ReferralCode.findOne({ userId });
      
      if (!referralCode) {
        let code;
        let isUnique = false;
        
        // Generate a unique code
        while (!isUnique) {
          code = generateUniqueCode();
          const existing = await ReferralCode.findOne({ code });
          if (!existing) {
            isUnique = true;
          }
        }
        
        // Create the new referral code
        referralCode = await ReferralCode.create({
          userId,
          code,
          userType,
          totalReferrals: 0,
          totalQualifiedReferrals: 0,
          lastUpdated: new Date()
        });
        
        logger.info(`New referral code generated for user ${userId}: ${code}`);
      }
      
      res.json({ 
        success: true, 
        referralCode: {
          code: referralCode.code,
          userId: referralCode.userId,
          totalReferrals: referralCode.totalReferrals,
          qualifiedReferrals: referralCode.totalQualifiedReferrals
        }
      });
    } catch (error) {
      logger.error('Error generating referral code:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  /**
   * Records a new referral when a user signs up with a referral code
   */
  async recordReferral(req, res) {
    try {
      const { referralCode, referredUserId, userType, referredUserDetails } = req.body;
      
      if (!referralCode || !referredUserId || !userType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: referralCode, referredUserId, and userType are required'
        });
      }
      
      // Validate the referral code
      const referrerCode = await ReferralCode.findOne({ code: referralCode });
      if (!referrerCode) {
        return res.status(404).json({
          success: false,
          error: 'Invalid referral code'
        });
      }
      
      // Check if this user was already referred
      const existingReferral = await Referral.findOne({ referredUserId });
      if (existingReferral) {
        return res.status(409).json({
          success: false,
          error: 'User has already been referred',
          referral: existingReferral
        });
      }
      
      // Create the referral record
      const referral = await Referral.create({
        referrerId: referrerCode.userId,
        referredUserId,
        referralCode,
        userType,
        referredUserDetails,
        status: 'pending',
        completionProgress: 0,
        lastUpdated: new Date()
      });
      
      // Increment the total referrals counter
      await ReferralCode.updateOne(
        { _id: referrerCode._id },
        { 
          $inc: { totalReferrals: 1 },
          $set: { lastUpdated: new Date() }
        }
      );
      
      logger.info(`Referral recorded: User ${referredUserId} referred by ${referrerCode.userId}`);
      
      res.json({ 
        success: true, 
        message: 'Referral recorded successfully',
        referral
      });
    } catch (error) {
      logger.error('Error recording referral:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  /**
   * Updates referral status when a website is created
   */
  async updateWebsiteCreation(userId, websiteId, websiteName, websiteLink) {
    try {
      // Find the referral for this user
      const referral = await Referral.findOne({ 
        referredUserId: userId,
        status: { $in: ['pending', 'website_created'] }
      });
      
      if (!referral) {
        logger.info(`No pending referral found for user ${userId} when creating website`);
        return null;
      }
      
      // Update the referral with website details
      referral.websiteDetails.push({
        websiteId,
        websiteName,
        websiteLink,
        createdAt: new Date()
      });
      
      referral.status = 'website_created';
      referral.completionProgress = calculateReferralProgress(referral);
      referral.lastUpdated = new Date();
      
      await referral.save();
      logger.info(`Referral updated with website creation for user ${userId}`);
      
      return referral;
    } catch (error) {
      logger.error(`Error updating referral with website creation for user ${userId}:`, error);
      return null;
    }
  },
  
  /**
   * Updates referral status when a category is created
   */
  async updateCategoryCreation(userId, categoryId, categoryName) {
    try {
      // Find the referral for this user
      const referral = await Referral.findOne({ 
        referredUserId: userId,
        status: { $in: ['pending', 'website_created', 'category_created'] }
      });
      
      if (!referral) {
        logger.info(`No pending referral found for user ${userId} when creating category`);
        return null;
      }
      
      // Update the referral with category details
      referral.categoryDetails.push({
        categoryId,
        categoryName,
        createdAt: new Date()
      });
      
      // Check if this completes the qualification requirements
      const hasWebsite = referral.websiteDetails && referral.websiteDetails.length > 0;
      
      if (hasWebsite) {
        // User has created both website and category - qualify the referral
        referral.status = 'qualified';
        referral.qualifiedAt = new Date();
        
        // Update the referrer's qualified referral count
        await ReferralCode.updateOne(
          { userId: referral.referrerId },
          { 
            $inc: { totalQualifiedReferrals: 1 },
            $set: { lastUpdated: new Date() }
          }
        );
        
        logger.info(`Referral qualified for user ${userId}`);
      } else {
        referral.status = 'category_created';
        logger.info(`Referral updated with category creation for user ${userId}`);
      }
      
      referral.completionProgress = calculateReferralProgress(referral);
      referral.lastUpdated = new Date();
      await referral.save();
      
      return referral;
    } catch (error) {
      logger.error(`Error updating referral with category creation for user ${userId}:`, error);
      return null;
    }
  },
  
  /**
   * Manually completes/qualifies a referral
   */
  async completeReferral(req, res) {
    try {
      const { referredUserId } = req.body;
      
      if (!referredUserId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: referredUserId'
        });
      }
      
      const referral = await Referral.findOne({ 
        referredUserId, 
        status: { $ne: 'qualified' }
      });
      
      if (!referral) {
        return res.status(404).json({
          success: false,
          error: 'No pending referral found for this user'
        });
      }
      
      // Update referral status
      referral.status = 'qualified';
      referral.qualifiedAt = new Date();
      referral.completionProgress = 100;
      referral.lastUpdated = new Date();
      await referral.save();
      
      // Update referrer's stats
      await ReferralCode.updateOne(
        { userId: referral.referrerId },
        { 
          $inc: { totalQualifiedReferrals: 1 },
          $set: { lastUpdated: new Date() }
        }
      );
      
      logger.info(`Referral manually completed for user ${referredUserId}`);
      
      res.json({ 
        success: true, 
        message: 'Referral qualified successfully',
        referral 
      });
    } catch (error) {
      logger.error('Error completing referral:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  /**
   * Gets referral statistics for a user
   */
  async getReferralStats(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: userId'
        });
      }
      
      // Get referral code and referrals
      const [referralCode, referrals] = await Promise.all([
        ReferralCode.findOne({ userId }).lean(),
        Referral.find({ referrerId: userId })
          .sort({ createdAt: -1 })
          .lean()
      ]);
      
      if (!referralCode) {
        return res.status(404).json({
          success: false,
          error: 'No referral code found for this user'
        });
      }
      
      // Prepare statistics
      const stats = {
        code: referralCode.code,
        totalReferrals: referralCode.totalReferrals,
        qualifiedReferrals: referralCode.totalQualifiedReferrals,
        pendingReferrals: referrals.filter(r => r.status !== 'qualified').length,
        conversionRate: referralCode.totalReferrals > 0 
          ? Math.round((referralCode.totalQualifiedReferrals / referralCode.totalReferrals) * 100) 
          : 0,
        referrals: referrals.map(ref => ({
          userId: ref.referredUserId,
          status: ref.status,
          progress: ref.completionProgress,
          userDetails: ref.referredUserDetails,
          websiteDetails: ref.websiteDetails,
          categoryDetails: ref.categoryDetails,
          createdAt: ref.createdAt,
          qualifiedAt: ref.qualifiedAt,
          daysSinceCreation: Math.floor((new Date() - new Date(ref.createdAt)) / (1000 * 60 * 60 * 24))
        }))
      };
      
      res.json({ 
        success: true, 
        stats 
      });
    } catch (error) {
      logger.error('Error getting referral stats:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  /**
   * Automatically checks and updates qualification status for all pending referrals
   */
  async checkQualifications(req, res) {
    try {
      const pendingReferrals = await Referral.find({ 
        status: { $ne: 'qualified' } 
      });
      
      const results = {
        total: pendingReferrals.length,
        qualified: 0,
        updated: 0,
        errors: 0
      };
      
      for (const referral of pendingReferrals) {
        try {
          if (referral.userType === 'website_owner') {
            // Count websites and categories for this user
            const [websiteCount, adCategoryCount] = await Promise.all([
              Website.countDocuments({ ownerId: referral.referredUserId }),
              AdCategory.countDocuments({ ownerId: referral.referredUserId })
            ]);
            
            // Update website details if not already recorded
            if (websiteCount > 0 && (!referral.websiteDetails || referral.websiteDetails.length === 0)) {
              const websites = await Website.find({ ownerId: referral.referredUserId }).lean();
              referral.websiteDetails = websites.map(site => ({
                websiteId: site._id.toString(),
                websiteName: site.websiteName,
                websiteLink: site.websiteLink,
                createdAt: site.createdAt
              }));
              referral.status = 'website_created';
              results.updated++;
            }
            
            // Update category details if not already recorded
            if (adCategoryCount > 0 && (!referral.categoryDetails || referral.categoryDetails.length === 0)) {
              const categories = await AdCategory.find({ ownerId: referral.referredUserId }).lean();
              referral.categoryDetails = categories.map(cat => ({
                categoryId: cat._id.toString(),
                categoryName: cat.categoryName,
                createdAt: cat.createdAt
              }));
              results.updated++;
            }
            
            // Check qualification criteria
            if (websiteCount >= 1 && adCategoryCount >= 1 && referral.status !== 'qualified') {
              referral.status = 'qualified';
              referral.qualifiedAt = new Date();
              referral.completionProgress = 100;
              
              // Update the referrer's qualified referral count
              await ReferralCode.updateOne(
                { userId: referral.referrerId },
                { 
                  $inc: { totalQualifiedReferrals: 1 },
                  $set: { lastUpdated: new Date() }
                }
              );
              
              results.qualified++;
            } else {
              // Update progress even if not fully qualified
              referral.completionProgress = calculateReferralProgress(referral);
            }
          } else if (referral.userType === 'advertiser') {
            // Check ad creation for advertisers
            const adsCount = await ImportAd.countDocuments({ userId: referral.referredUserId });
            
            if (adsCount >= 1 && referral.status !== 'qualified') {
              referral.status = 'qualified';
              referral.qualifiedAt = new Date();
              referral.completionProgress = 100;
              
              // Update the referrer's qualified referral count
              await ReferralCode.updateOne(
                { userId: referral.referrerId },
                { 
                  $inc: { totalQualifiedReferrals: 1 },
                  $set: { lastUpdated: new Date() }
                }
              );
              
              results.qualified++;
            }
          }
          
          referral.lastUpdated = new Date();
          await referral.save();
        } catch (innerError) {
          logger.error(`Error processing referral ${referral._id}:`, innerError);
          results.errors++;
        }
      }
      
      logger.info(`Qualification check completed: ${results.qualified} qualified, ${results.updated} updated, ${results.errors} errors`);
      
      res.json({ 
        success: true, 
        message: 'Qualification check completed',
        results
      });
    } catch (error) {
      logger.error('Error checking qualifications:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  /**
   * For debugging - gets all referral data
   */
  async debugReferral(req, res) {
    try {
      const { userId } = req.params;
      
      const [referralCodes, referrals, websites, categories] = await Promise.all([
        ReferralCode.find({}).lean(),
        Referral.find({}).lean(),
        userId ? Website.find({ ownerId: userId }).lean() : [],
        userId ? AdCategory.find({ ownerId: userId }).lean() : []
      ]);
      
      res.json({
        referralCodes,
        referrals,
        websites,
        categories
      });
    } catch (error) {
      logger.error('Error debugging referrals:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = referralController;

// ----- MIDDLEWARE -----

// middleware/referralMiddleware.js
const referralController = require('../controllers/referralController');

/**
 * Middleware to update referral tracking when a website is created
 */
const trackWebsiteCreation = async (req, res, next) => {
  const originalJson = res.json;
  
  // Override the json method to intercept the response
  res.json = function(data) {
    const originalData = data;
    
    // Only process if website creation was successful
    if (data && data._id && req.body.ownerId) {
      // Update referral status asynchronously
      referralController.updateWebsiteCreation(
        req.body.ownerId, 
        data._id.toString(),
        data.websiteName,
        data.websiteLink
      ).catch(err => {
        console.error('Error in trackWebsiteCreation middleware:', err);
      });
    }
    
    // Restore original json method and call it
    res.json = originalJson;
    return res.json(originalData);
  };
  
  next();
};

/**
 * Middleware to update referral tracking when a category is created
 */
const trackCategoryCreation = async (req, res, next) => {
  const originalJson = res.json;
  
  // Override the json method to intercept the response
  res.json = function(data) {
    const originalData = data;
    
    // Only process if category creation was successful
    if (data && data._id && req.body.ownerId) {
      // Update referral status asynchronously
      referralController.updateCategoryCreation(
        req.body.ownerId,
        data._id.toString(),
        data.categoryName
      ).catch(err => {
        console.error('Error in trackCategoryCreation middleware:', err);
      });
    }
    
    // Restore original json method and call it
    res.json = originalJson;
    return res.json(originalData);
  };
  
  next();
};

module.exports = {
  trackWebsiteCreation,
  trackCategoryCreation
};

// ----- UTILS -----

// utils/logger.js
const createLogger = (module) => {
  return {
    info: (message, data) => {
      console.log(`[INFO][${module}] ${message}`, data || '');
    },
    error: (message, error) => {
      console.error(`[ERROR][${module}] ${message}`, error || '');
    },
    warn: (message, data) => {
      console.warn(`[WARN][${module}] ${message}`, data || '');
    }
  };
};

module.exports = { createLogger };

// ----- FRONTEND COMPONENTS -----

// components/ReferralDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useClerk } from '@clerk/clerk-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Share2, Copy, CheckCircle, XCircle, Clock } from 'lucide-react';

const ReferralDashboard = () => {
  const { user } = useClerk();
  const [referralData, setReferralData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  const loadReferralData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Generate or get referral code
      await axios.post(`${process.env.API_URL}/api/referrals/generate-code`, {
        userId: user.id,
        userType: 'promoter'
      });
      
      // Get stats
      const statsResponse = await axios.get(`${process.env.API_URL}/api/referrals/stats/${user.id}`);
      setReferralData(statsResponse.data.stats);
    } catch (err) {
      setError('Failed to load referral data. Please try again later.');
      console.error('Error loading referral data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadReferralData();
    }
  }, [user?.id]);

  const getReferralLink = () => {
    if (!referralData?.code) return '';
    return `${window.location.origin}/sign-up?ref=${referralData.code}`;
  };

  const copyReferralLink = async () => {
    const link = getReferralLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'qualified':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Qualified
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'website_created':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
            <Clock className="w-3 h-3 mr-1" />
            Website Created
          </Badge>
        );
      case 'category_created':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-300">
            <Clock className="w-3 h-3 mr-1" />
            Category Created
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-300">
            Unknown
          </Badge>
        );
    }
  };

  const filteredReferrals = () => {
    if (!referralData?.referrals) return [];
    
    switch (activeTab) {
      case 'qualified':
        return referralData.referrals.filter(r => r.status === 'qualified');
      case 'pending':
        return referralData.referrals.filter(r => r.status !== 'qualified');
      case 'all':
      default:
        return referralData.referrals;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
        <p>{error}</p>
        <Button variant="outline" className="mt-2" onClick={loadReferralData}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Referral Link Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Share2 className="mr-2 h-5 w-5" />
            Your Referral Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center bg-gray-50 p-3 rounded-md border border-gray-200">
              <input
                type="text"
                readOnly
                value={getReferralLink()}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={copyReferralLink}
                className="ml-2 flex items-center"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                <p className="text-sm text-blue-600 font-medium">Total Referrals</p>
                <p className="text-2xl font-bold">{referralData?.totalReferrals || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-md border border-green-100">
                <p className="text-sm text-green-600 font-medium">Qualified</p>
                <p className="text-2xl font-bold">{referralData?.qualifiedReferrals || 0}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-md border border-purple-100">
                <p className="text-sm text-purple-600 font-medium">Conversion Rate</p>
                <p className="text-2xl font-bold">{referralData?.conversionRate || 0}%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referrals List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Referrals</TabsTrigger>
              <TabsTrigger value="qualified">Qualified</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
            
            <TabsContent value



























































































// ReferralCode.js
const referralCodeSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true, unique: true, index: true },
  userType: { type: String, enum: ['promoter', 'website_owner'], required: true },
  totalReferrals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Referral.js
const referralSchema = new mongoose.Schema({
  referrerId: { type: String, required: true, index: true },
  referredUserId: { type: String, required: true, unique: true, index: true },
  referralCode: { type: String, required: true },
  userType: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'website_created', 'category_created', 'qualified'],
    default: 'pending'
  },
  referredUserDetails: {
    firstName: String,
    lastName: String,
    email: String,
    createdAt: Date
  },
  websiteDetails: [{
    websiteId: String,
    websiteName: String,
    websiteLink: String,
    createdAt: Date
  }],
  categoryDetails: [{
    categoryId: String,
    categoryName: String,
    createdAt: Date
  }],
  createdAt: { type: Date, default: Date.now },
  qualifiedAt: Date,
  lastUpdated: { type: Date, default: Date.now }
});

// WebsiteModel.js
const websiteSchema = new mongoose.Schema({
  // records
});

// AdCategoryModel.js
const adCategorySchema = new mongoose.Schema({
  // records
});

// ImportAdModel.js
const importAdSchema = new mongoose.Schema({
  // records
});

// referralController.js
const ReferralCode = require('../models/ReferralCode');
const Referral = require('../models/Referral');
const Website = require('../models/WebsiteModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');

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
      const referrerCode = await ReferralCode.findOne({ code: referralCode });
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
    }
  }

  async debugReferral(req, res) {
    try {
      const { userId } = req.params;
      const referralCode = await ReferralCode.find({}).lean();
      const referrals = await Referral.find({}).lean();
      const websites = await Website.find({ ownerId: userId }).lean();
      const categories = await AdCategory.find({ ownerId: userId }).lean();
      
      res.json({
        referralCodes: referralCode,
        referrals,
        websites,
        categories
      });
    }
  },

  async completeReferral(req, res) {
    try {
      const { referredUserId } = req.body;
      const referral = await Referral.findOne({ referredUserId, status: 'pending' });
      
      referral.status = 'qualified';
      referral.qualifiedAt = new Date();
      await referral.save();
      
      await ReferralCode.updateOne(
        { userId: referral.referrerId },
        { $inc: { totalReferrals: 1 } }
      );
      
      res.json({ success: true, referral });
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
    }
  }
};

// websiteController.js
const Website = require('../models/WebsiteModel');
const Referral = require('../models/Referral');

exports.createWebsite = [upload.single('file'), async (req, res) => {
  try {
    const { ownerId, websiteName, websiteLink } = req.body;
    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (req.file) {
      try {
               
        imageUrl = await uploadToGCS(req.file);
      }
    }

    const newWebsite = new Website({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl
    });
    const savedWebsite = await newWebsite.save();
    const referral = await Referral.findOne({ 
      referredUserId: ownerId,
      status: { $in: ['pending', 'website_created'] }
    });

    if (referral) {
      referral.status = 'website_created';
      referral.websiteDetails.push({
        websiteId: savedWebsite._id,
        websiteName: savedWebsite.websiteName,
        websiteLink: savedWebsite.websiteLink,
        createdAt: new Date()
      });
      referral.lastUpdated = new Date();
      await referral.save();
    }
    
    res.status(201).json(savedWebsite);
  }
}];

// adCategoryController.js
const AdCategory = require('../models/AdCategoryModel');
const Referral = require('../models/Referral');

exports.createCategory = async (req, res) => {
  try {
    const { 
      ownerId, 
      websiteId, 
      // ....continues
    } = req.body;

    const newCategory = new AdCategory({
      ownerId, 
      websiteId, 
      // ....continues
    });

    const savedCategory = await newCategory.save();
    const { script } = generateSecureScript(savedCategory._id.toString());
    savedCategory.apiCodes = {
      HTML: `<script>\n${script}\n</script>`,
    };
    const finalCategory = await savedCategory.save();
    const referral = await Referral.findOne({ 
      referredUserId: ownerId,
      status: { $in: ['pending', 'website_created'] }
    });
    if (referral) {
      referral.categoryDetails = {
        categoryId: finalCategory._id,
        categoryName: finalCategory.categoryName,
        createdAt: new Date()
      };
      const website = await Website.findOne({ ownerId });
      if (website) {
        referral.status = 'qualified';
        referral.qualifiedAt = new Date();
        await ReferralCode.updateOne(
          { userId: referral.referrerId },
          { 
            $inc: { totalReferrals: 1 },
            $set: { lastUpdated: new Date() }
          }
        );
      } else {
        referral.status = 'category_created';
      }
      referral.lastUpdated = new Date();
      await referral.save();
    }
    res.status(201).json(finalCategory);
  }
};

// dashboard-layout.js
export default function DashboardLayout() {
  return <Outlet />;
}

// root-layout.js
export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const publicRoutes = ['/', '/yepper-ads', '/yepper-spaces', '/terms', '/privacy', '/sign-in', '/sign-up'];

  useEffect(() => {
    const isAuthPage = ['/sign-in', '/sign-up'].includes(location.pathname);
    
    if (isAuthPage) {
      return;
    }
  }, [location.pathname, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <NotificationProvider>
          <div className="root-layout">
            <SignedIn>
              <Outlet />
            </SignedIn>
            <SignedOut>
              {publicRoutes.includes(location.pathname) ? (
                <Outlet />
              ) : (
                <Navigate to="/sign-in" replace />
              )}
            </SignedOut>
          </div>
        </NotificationProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

// sign-up.js
export default function SignUpPage() {
  const location = useLocation();
  const [isRecordingReferral, setIsRecordingReferral] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const referralCode = searchParams.get('ref');

  const handleSignUpComplete = async (user) => {
    if (referralCode) {
      try {
        setIsRecordingReferral(true);
        const response = await axios.post(`http://localhost:5000/api/referrals/record-referral`, {
          referralCode,
          referredUserId: user.id,
          userType: 'website_owner',
          referredUserDetails: {  // Changed from userData to match backend
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.primaryEmailAddress?.emailAddress,
            createdAt: new Date()
          }
        });
        localStorage.setItem('referralCode', referralCode);
      }
    }
  };
  
  return (
    <div className="auth-page">
      <SignUp 
        redirectUrl="/dashboard" 
        appearance={authAppearance}
        onSignUpComplete={handleSignUpComplete}
      />
    </div>
  );
}

// ReferralDashboard.js
const ReferralDashboard = () => {
  const { user } = useClerk();
  const [referralData, setReferralData] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadReferralData = async () => {
    try {
      const generateResponse = await axios.post(`http://localhost:5000/api/referrals/generate-code`, {
        userId: user.id,
        userType: 'promoter'
      });
      const statsResponse = await axios.get(`http://localhost:5000/api/referrals/stats/${user.id}`);
      setReferralData(statsResponse.data.stats);
    }
  };

  const renderReferralList = () => {
    return referralData.referrals.map((referral, index) => (
      <div key={index}>
        <div>
          {referral.userDetails && (
            <div>
              <p>{referral.userDetails.firstName} {referral.userDetails.lastName}</p>
            </div>
          )}
          
          {referral.websiteDetails?.length > 0 && (
            <div>
              {referral.websiteDetails.map((website, idx) => (
                <div key={idx}>
                  <p>{website.websiteName}</p>
                </div>
              ))}
            </div>
          )}
          
          {referral.categoryDetails?.length > 0 && (
            <div>
              {referral.categoryDetails.map((category, idx) => (
                <div key={idx}>
                  <p>{category.categoryName}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ));
  };

  const getReferralLink = () => {
    if (!referralData?.code) return '';
    return `${window.location.origin}/sign-up?ref=${referralData.code}`;
  };

  const copyReferralLink = async () => {
    const link = getReferralLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div>
          <input 
            type="text"
            readOnly
            value={getReferralLink()}
          />
          <button
            onClick={copyReferralLink}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

      <div>
        {referralData?.referrals?.length > 0 ? (
          <div>
            {renderReferralList()}
          </div>
        ) : (
          <p>No referrals yet</p>
        )}
      </div>
    </div>
  );
};

// CategoriesComponent.js
const CategoriesComponent = ({ onSubmitSuccess }) => {
    const handleSubmit = async (event) => {
        try {
            const categoriesToSubmit = Object.entries(selectedCategories)
                .filter(([category]) => completedCategories.includes(category))
                .map(([category]) => ({
                    ownerId: user?.id,
                    websiteId,
                    categoryName: category.charAt(0).toUpperCase() + category.slice(1),
                    price: categoryData[category]?.price || 0,
                    description: categoryDetails[category]?.description || '',
                    spaceType: categoryDetails[category]?.spaceType,
                    userCount: parseInt(categoryData[category]?.userCount) || 0,
                    instructions: categoryData[category]?.instructions || '',
                    customAttributes: {},
                    webOwnerEmail: user?.emailAddresses[0]?.emailAddress,
                    visitorRange: categoryData[category]?.visitorRange || { min: 0, max: 10000 },
                    tier: categoryData[category]?.tier || 'bronze'
                }));
        
            const responses = await Promise.all(
                categoriesToSubmit.map(async (category) => {
                const response = await axios.post('http://localhost:5000/api/ad-categories', category);
                return { ...response.data, name: category.categoryName };
                })
            );
        
            const categoriesWithId = responses.reduce((acc, category) => {
                acc[category.name.toLowerCase()] = { 
                    id: category._id, 
                    price: category.price,
                    apiCodes: category.apiCodes
                };
                return acc;
            }, {});
    
          onSubmitSuccess();
        }
    };
};

// WebsiteCreation.js
function WebsiteCreation() {
  const handleSubmit = async (e) => {
    try {
      const formData = new FormData();
      formData.append('ownerId', user?.id);
      formData.append('websiteName', formState.websiteName);
      formData.append('websiteLink', formState.websiteUrl);
      if (formState.imageUrl) {
        formData.append('file', formState.imageUrl);
      }
      const response = await axios.post(
        'http://localhost:5000/api/websites',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.status === 201) {
        navigate(`/create-categories/${response.data._id}`, {
          state: {
            websiteDetails: {
              id: response.data._id,
              name: formState.websiteName,
              url: formState.websiteUrl
            }
          }
        });
      }
    }
  };
}