// WebsiteModel.js
const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 }); // Index for faster query by ownerId

module.exports = mongoose.model('Website', websiteSchema);

// AdCategoryModel.js
const mongoose = require('mongoose');

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
  createdAt: { type: Date, default: Date.now }
});

adCategorySchema.index({ ownerId: 1, websiteId: 1, categoryName: 1 });

const AdCategory = mongoose.model('AdCategory', adCategorySchema);
module.exports = AdCategory;

// ImportAdModel.js
const mongoose = require('mongoose');

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

module.exports = mongoose.model('ImportAd', importAdSchema);

// AdApprovalController.js
const Website = require('../models/WebsiteModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');

exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    // Security check: Verify the requesting user matches the ownerId parameter
    if (req.user.id !== ownerId) {
      return res.status(403).json({ 
        message: 'Unauthorized: You can only view pending ads for your own websites' 
      });
    }

    // First find websites owned by this user
    const websites = await Website.find({ ownerId });
    const websiteIds = websites.map(website => website._id);

    if (websiteIds.length === 0) {
      return res.status(200).json([]); // Return empty array if user has no websites
    }

    const pendingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: { $in: websiteIds },
          approved: false
        }
      }
    })
    .populate('websiteSelections.websiteId')
    .populate('websiteSelections.categories');

    // Transform data to match frontend expectations
    const transformedAds = pendingAds.map(ad => ({
      _id: ad._id,
      businessName: ad.businessName,
      businessLink: ad.businessLink,
      businessLocation: ad.businessLocation,
      adDescription: ad.adDescription,
      imageUrl: ad.imageUrl,
      videoUrl: ad.videoUrl,
      pdfUrl: ad.pdfUrl,
      websiteDetails: ad.websiteSelections
        // Only include website selections that belong to the requesting user
        .filter(selection => websiteIds.includes(selection.websiteId._id))
        .map(selection => ({
          website: selection.websiteId,
          categories: selection.categories,
          approved: selection.approved
        }))
    }));

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Error fetching pending ads', error: error.message });
  }
};

exports.approveAdForWebsite = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;
    const userId = req.user.id; // Assuming you have user info in req.user from auth middleware

    // First verify the website belongs to the requesting user
    const website = await Website.findOne({ 
      _id: websiteId,
      ownerId: userId
    });

    if (!website) {
      return res.status(403).json({ 
        message: 'Unauthorized: You can only approve ads for websites you own' 
      });
    }

    // Then verify the ad exists and is pending for this website
    const ad = await ImportAd.findOne({
      _id: adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          approved: false
        }
      }
    });

    if (!ad) {
      return res.status(404).json({ 
        message: 'Ad not found or already approved' 
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

// PendingAds.js
import React, { useEffect, useState } from 'react';
import { useUser } from "@clerk/clerk-react";
import { Link } from 'react-router-dom';
import { Check, Eye, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent } from "./components/card";
import LoadingSpinner from '../../components/LoadingSpinner';
import { motion } from 'framer-motion';
import Header from '../../components/backToPreviousHeader'

const PendingAds = () => {
  const [pendingAds, setPendingAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useUser();

  useEffect(() => {
    const fetchPendingAds = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`http://localhost:5000/api/accept/pending/${user.id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Fetched pending ads:', data); // Debug log
        setPendingAds(data);
      } catch (error) {
        console.error('Error fetching pending ads:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingAds();
  }, [user?.id]); // Changed dependency to user?.id

  const handleApprove = async (adId, websiteId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/accept/approve/${adId}/website/${websiteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update local state to reflect the approval
      setPendingAds(prevAds => 
        prevAds.map(ad => {
          if (ad._id === adId) {
            return {
              ...ad,
              websiteDetails: ad.websiteDetails.map(wd => ({
                ...wd,
                approved: wd.website._id === websiteId ? true : wd.approved
              }))
            };
          }
          return ad;
        })
      );
    } catch (error) {
      console.error('Error approving ad:', error);
      // Optionally add error handling UI here
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div>Error loading pending ads: {error}</div>;

};

export default PendingAds;