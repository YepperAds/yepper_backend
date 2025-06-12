// Websites.js - Fixed fetchWebsites function
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';

function Websites() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const { file, userId, businessName, businessLink, businessLocation, adDescription } = location.state || {};
  const [websites, setWebsites] = useState([]);
  const [filteredWebsites, setFilteredWebsites] = useState([]);
  const [selectedWebsites, setSelectedWebsites] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWebsites = async () => {
      // Wait for user to be loaded and check if user exists
      if (!isLoaded) {
        return; // Wait for Clerk to load
      }

      if (!user?.emailAddresses?.[0]?.emailAddress) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const currentUserEmail = user.emailAddresses[0].emailAddress;
        console.log('Fetching websites for user:', currentUserEmail);
        
        // Pass current user email to backend
        const response = await fetch(
          `https://yepper-backend.onrender.com/api/websites?userEmail=${encodeURIComponent(currentUserEmail)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Websites received:', data.length);
        
        setWebsites(data);
        setFilteredWebsites(data);
        
        // Extract unique categories if they exist
        const uniqueCategories = ['All', ...new Set(
          data.map(site => site.category).filter(Boolean)
        )];
        setCategories(uniqueCategories);
        
      } catch (error) {
        console.error('Failed to fetch websites:', error);
        setError(`Failed to load websites: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWebsites();
  }, [user, isLoaded]); // Add isLoaded to dependencies

  // Rest of your component logic stays the same...
  useEffect(() => {
    let result = websites;
    
    if (searchTerm) {
      result = result.filter(site => 
        site.websiteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.websiteLink.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedCategory !== 'All') {
      result = result.filter(site => site.category === selectedCategory);
    }
    
    setFilteredWebsites(result);
  }, [searchTerm, selectedCategory, websites]);

  const handleSelect = (websiteId) => {
    setSelectedWebsites(prev => 
      prev.includes(websiteId) 
        ? prev.filter(id => id !== websiteId)
        : [...prev, websiteId]
    );
  };

  const handleNext = () => {
    if (selectedWebsites.length === 0) return;

    navigate('/categories', {
      state: {
        file,
        userId,
        businessName,
        businessLink,
        businessLocation,
        adDescription,
        selectedWebsites,
      },
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading websites...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Your existing JSX content */}
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Select Websites</h1>
        
        {/* Search and filters */}
        <div className="mb-6 space-y-4">
          <input
            type="text"
            placeholder="Search websites..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
          
          {categories.length > 1 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="p-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Websites grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {filteredWebsites.map(website => (
            <div
              key={website._id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedWebsites.includes(website._id)
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-700 bg-gray-800'
              }`}
              onClick={() => handleSelect(website._id)}
            >
              {website.imageUrl && (
                <img
                  src={website.imageUrl}
                  alt={website.websiteName}
                  className="w-full h-32 object-cover rounded mb-3"
                />
              )}
              <h3 className="font-semibold text-lg mb-2">{website.websiteName}</h3>
              <p className="text-gray-400 text-sm mb-2">{website.websiteLink}</p>
              <p className="text-xs text-gray-500">
                Owner: {website.ownerId}
              </p>
            </div>
          ))}
        </div>

        {filteredWebsites.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No websites found matching your criteria.</p>
          </div>
        )}

        {/* Next button */}
        <div className="text-center">
          <button
            onClick={handleNext}
            disabled={selectedWebsites.length === 0}
            className={`px-8 py-3 rounded-lg font-medium transition-colors ${
              selectedWebsites.length > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            Next ({selectedWebsites.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}

export default Websites;
















































// WebsiteModel.js
const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 }); // Index for faster query by ownerId

module.exports = mongoose.model('Website', websiteSchema);

// WebsiteController.js
const Website = require('../models/WebsiteModel');
const multer = require('multer');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();
const Referral = require('../models/Referral'); // Add this import

// Create credentials object from environment variables
const credentials = {
  type: 'service_account',
  project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
  private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLOUD_CLIENT_EMAIL)}`
};

// Initialize storage with credentials object
const storage = new Storage({
  credentials,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|avi|mov|mkv|webm/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

const uploadToGCS = async (file) => {
  try {
    console.log('Initializing upload with credentials for:', credentials.client_email);
    
    const bucket = storage.bucket(bucketName);
    const fileName = `${Date.now()}-${file.originalname}`;
    
    // Create file in bucket
    const cloudFile = bucket.file(fileName);
    
    // Upload with promise
    await cloudFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
      public: true,
      validation: 'md5'
    });

    // Make file public
    await cloudFile.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log('File uploaded successfully to:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Detailed upload error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw new Error(`Upload failed: ${error.message}`);
  }
};

exports.createWebsite = [upload.single('file'), async (req, res) => {
  try {
    const { ownerId, websiteName, websiteLink } = req.body;

    if (!ownerId || !websiteName || !websiteLink) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ message: 'Website URL already exists' });
    }

    let imageUrl = '';

    if (req.file) {
      try {
        console.log('Starting file upload...');
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
        
        imageUrl = await uploadToGCS(req.file);
        console.log('Upload successful, URL:', imageUrl);
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload file',
          error: uploadError.message 
        });
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
      // Update referral with website info
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
  } catch (error) {
    console.error('Error creating website:', error);
    res.status(500).json({ 
      message: 'Failed to create website',
      error: error.message 
    });
  }
}];

exports.getAllWebsites = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const currentUserEmail = req.query.userEmail || req.headers['x-user-email']; // Get current user email
  
  try {
    const TEST_ACCOUNT_EMAIL = 'olympusexperts@gmail.com';
    
    // Add debugging
    console.log('Current user email:', currentUserEmail);
    console.log('Is test account?', currentUserEmail === TEST_ACCOUNT_EMAIL);
    
    let query = {};
    
    // If current user is NOT the test account, exclude test account websites
    if (currentUserEmail !== TEST_ACCOUNT_EMAIL) {
      query.ownerId = { $ne: TEST_ACCOUNT_EMAIL };
      console.log('Non-test user - excluding test websites');
    } else {
      console.log('Test user - showing all websites');
    }
    // If current user IS the test account, show all websites (including their own)
    
    console.log('Query being used:', query);
    
    const websites = await Website.find(query)
      .lean()
      .select('ownerId websiteName websiteLink imageUrl createdAt');

    console.log('Websites found:', websites.length);
    console.log('Website owners:', websites.map(w => w.ownerId));
    
    res.status(200).json(websites);
  } catch (error) {
    console.error('Error fetching websites:', error);
    res.status(500).json({ message: 'Failed to fetch websites', error });
  }
};

// dashboard-layout.js
import * as React from 'react';
import { useAuth } from "@clerk/clerk-react";
import { Outlet, Navigate } from "react-router-dom";
import LoadingSpinner from '../components/LoadingSpinner';

export default function DashboardLayout() {
  const { userId, isLoaded } = useAuth();

  if (!isLoaded) return <LoadingSpinner />;
  
  if (!userId) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Outlet />;
}

// root-layout.js
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react';
import { useEffect } from 'react';
import './root.css';
import { NotificationProvider } from '../components/NotificationContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../store/query-client';

const PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const publicRoutes = ['/', '/yepper-ads', '/yepper-spaces','/videos','/pricing', '/terms', '/privacy', '/sign-in', '/sign-up'];

  useEffect(() => {
    const isAuthPage = ['/sign-in', '/sign-up'].includes(location.pathname);
    
    if (isAuthPage) {
      return; // Let ClerkProvider handle auth page redirects
    }
  }, [location.pathname, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <NotificationProvider>
          <div className="root-layout">
            <main className="main-content">
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
            </main>
          </div>
        </NotificationProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

// Websites.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react'; // Import useUser hook

function Websites() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser(); // Get current user from Clerk
  const { file, userId, businessName, businessLink, businessLocation, adDescription } = location.state || {};
  const [websites, setWebsites] = useState([]);
  const [filteredWebsites, setFilteredWebsites] = useState([]);
  const [selectedWebsites, setSelectedWebsites] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Test account identifier
  const TEST_ACCOUNT_EMAIL = 'olympusexperts@gmail.com';

  useEffect(() => {
    const fetchWebsites = async () => {
      if (!user?.emailAddresses?.[0]?.emailAddress) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const currentUserEmail = user.emailAddresses[0].emailAddress;
        
        // Pass current user email to backend
        const response = await fetch(
          `https://yepper-backend.onrender.com/api/websites?userEmail=${encodeURIComponent(currentUserEmail)}`
        );
        const data = await response.json();
        
        setWebsites(data);
        setFilteredWebsites(data);
        const uniqueCategories = ['All', ...new Set(data.map(site => site.category))];
        setCategories(uniqueCategories);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch websites:', error);
        setError('Failed to load websites');
        setLoading(false);
      }
    };

    fetchWebsites();
  }, [user]);

  useEffect(() => {
    let result = websites;
    
    if (searchTerm) {
      result = result.filter(site => 
        site.websiteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.websiteLink.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedCategory !== 'All') {
      result = result.filter(site => site.category === selectedCategory);
    }
    
    setFilteredWebsites(result);
  }, [searchTerm, selectedCategory, websites]);

  const handleSelect = (websiteId) => {
    setSelectedWebsites(prev => 
      prev.includes(websiteId) 
        ? prev.filter(id => id !== websiteId)
        : [...prev, websiteId]
    );
  };

  const handleNext = () => {
    if (selectedWebsites.length === 0) return;

    navigate('/categories', {
      state: {
        file,
        userId,
        businessName,
        businessLink,
        businessLocation,
        adDescription,
        selectedWebsites,
      },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
        {/* codes */}
    </div>
  );
}

export default Websites;

// index.css
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom'
import RootLayout from './layouts/root-layout'
import DashboardLayout from './layouts/dashboard-layout'
import SignInPage from './routes/sign-in'
import SignUpPage from './routes/sign-up'

import Home from './home/Home'
import Advertisers from './register/import/Websites'
// other imports

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/sign-up", element: <SignUpPage /> },

      { path: "/", element: <Home /> },
      {
        element: <DashboardLayout />,
        children: [
            { path: "/websites", element: <Advertisers /> },
            //other paths...   
        ]
      },
      {
        path: "/ref/:code",
        element: <Navigate to={location => `/sign-up?ref=${location.params.code}`} replace />
      }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

I want the test account (olympusexperts@gmail.com) websites to be completely hidden from all other users, but when i'm logged in as the test account, i should see ALL websites (both my test websites and real user websites for testing purposes). but i don't even know how the backend will know that it's olympusexperts@gmail.com that's signed in(maybe that's my low logic) cause the authentication is only in the frontend

here's the logic:
If user is NOT test account → exclude test account websites ✓
If user IS test account → show all websites (including test websites) ✓