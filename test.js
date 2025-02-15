// index.js
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import RootLayout from './layouts/root-layout'
import DashboardLayout from './layouts/dashboard-layout'
import SignInPage from './routes/sign-in'
import SignUpPage from './routes/sign-up'
// ... other imports

const router = createBrowserRouter([
  {
    element: (
      <ClerkProvider 
        publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      >
        <RootLayout />
      </ClerkProvider>
    ),
    children: [
      // Public Routes
      { path: "/", element: <Home /> },
      { path: "/yepper-ads", element: <AdsPage /> },
      { path: "/yepper-spaces", element: <WebPage /> },
      { path: "/terms", element: <TermsAndConditions /> },
      { path: "/privacy", element: <PrivacyPolicy /> },
      
      // Auth Routes
      { 
        path: "/sign-in/*", 
        element: <SignInPage /> 
      },
      { 
        path: "/sign-up/*", 
        element: <SignUpPage /> 
      },

      // Protected Routes
      {
        element: <DashboardLayout />,
        children: [
          { path: "/referral", element: <ReferralPage /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/request", element: <Request /> },
          { path: "/select", element: <Select /> },
          { path: "/business", element: <Business /> },
          { path: "/websites", element: <Advertisers /> },
          { path: "/categories", element: <Categories /> },
          { path: "/ad-success", element: <AdSuccess /> },
          { path: "/approved-detail/:adId", element: <ApprovedAdDetail /> },
          { path: "/projects", element: <Projects /> },
          { path: "/pending-ads", element: <PendingAds /> },
          { path: "/pending-ad/:adId", element: <PendingAdPreview /> },
          { path: "/website/:websiteId", element: <WebsiteDetails /> },
          { path: "/categories/:id", element: <ProjectCategories /> },
          { path: "/create-website", element: <WebsiteCreation /> },
          { path: "/create-categories/:websiteId", element: <CategoriesCreation /> },
          { path: "/wallet", element: <Wallet /> },
        ]
      },

      // Referral Route
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

// routes/sign-up.js
import { SignUp } from "@clerk/clerk-react";
import { useLocation } from "react-router-dom";
import axios from "axios";

export default function SignUpPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const referralCode = searchParams.get('ref');
  const [isRecordingReferral, setIsRecordingReferral] = useState(false);

  const handleSignUpComplete = async (user) => {
    if (referralCode) {
      try {
        setIsRecordingReferral(true);
        await axios.post(`${import.meta.env.VITE_API_URL}/api/referrals/record-referral`, {
          referralCode,
          referredUserId: user.id,
          userType: 'website_owner',
          userData: {
            firstName: user.firstName,
            lastName: user.lastName,
            emailAddress: user.primaryEmailAddress?.emailAddress,
          }
        });
        
        localStorage.setItem('referralCode', referralCode);
      } catch (error) {
        console.error('Error recording referral:', error);
      } finally {
        setIsRecordingReferral(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <SignUp
        path="/sign-up"
        routing="hash"
        signInUrl="/sign-in"
        afterSignUpUrl="/create-website"
        redirectUrl="/create-website"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "p-8 rounded-lg shadow-md bg-white",
            // Add more custom styles as needed
          }
        }}
        onSignUpComplete={handleSignUpComplete}
      />
    </div>
  );
}

// .env.local
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:5000










































// WebsiteModel.js
const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

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
  referrerId: { type: String, required: true },
  referredUserId: { type: String, required: true },
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
  websiteDetails: {
    websiteId: String,
    websiteName: String,
    websiteLink: String,
    createdAt: Date
  },
  categoryDetails: {
    categoryId: String,
    categoryName: String,
    createdAt: Date
  },
  createdAt: { type: Date, default: Date.now },
  qualifiedAt: Date,
  lastUpdated: { type: Date, default: Date.now }
});

// WebsiteController.js
const Website = require('../models/WebsiteModel');
const Referral = require('../models/Referral'); // Add this import
const axios = require('axios'); // Add this import

exports.createWebsite = [upload.single('file'), async (req, res) => {
  try {
    const { ownerId, websiteName, websiteLink } = req.body;
    const existingWebsite = await Website.findOne({ websiteLink }).lean();

    const newWebsite = new Website({
      // data
    });

    const savedWebsite = await newWebsite.save();
    const referral = await Referral.findOne({ 
      referredUserId: ownerId,
      status: { $in: ['pending', 'website_created'] }
    });

    if (referral) {
      referral.status = 'website_created';
      referral.websiteDetails = {
        websiteId: savedWebsite._id,
        websiteName: savedWebsite.websiteName,
        websiteLink: savedWebsite.websiteLink,
        createdAt: new Date()
      };
      referral.lastUpdated = new Date();
      await referral.save();
    }
    
    res.status(201).json(savedWebsite);
  }
}];

// AdCategoryController.js
const AdCategory = require('../models/AdCategoryModel');
const Referral = require('../models/Referral'); // Add this import

exports.createCategory = async (req, res) => {
  try {
    const { 
      ownerId, 
      websiteId, 
      categoryName, 
      description, 
      price, 
      customAttributes,
      spaceType,
      userCount,
      instructions,
      webOwnerEmail,
      visitorRange,
      tier
    } = req.body;

    const newCategory = new AdCategory({
      // data
    });

    const savedCategory = await newCategory.save();
    const { script } = generateSecureScript(savedCategory._id.toString());

    savedCategory.apiCodes = {
      HTML: `<script>\n${script}\n</script>`
    };

    const finalCategory = await savedCategory.save();

    const referral = await Referral.findOne({ 
      referredUserId: ownerId,
      status: { $in: ['pending', 'website_created', 'category_created'] }
    });

    if (referral) {
      referral.status = 'category_created';
      referral.categoryDetails = {
        categoryId: savedCategory._id,
        categoryName: savedCategory.categoryName,
        createdAt: new Date()
      };
      
      if (referral.websiteDetails) {
        referral.status = 'qualified';
        referral.qualifiedAt = new Date();
        
        await ReferralCode.updateOne(
          { userId: referral.referrerId },
          { $inc: { totalReferrals: 1 } }
        );
      }

      referral.lastUpdated = new Date();
      await referral.save();
    }
    res.status(201).json(finalCategory); 
  }
};

// controllers/referralController.js
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
  async generateCode(req, res, next) {
    try {
      const { userId, userType } = req.body;
      let referralCode = await ReferralCode.findOne({ userId }).lean();
      
      if (!referralCode) {
        let code;
        let isUnique = false;
        
        while (!isUnique) {
          code = generateUniqueCode();
          const existing = await ReferralCode.findOne({ code }).lean();
          if (!existing) {
            isUnique = true;
          }
        }
        
        referralCode = await ReferralCode.create({
          userId,
          code,
          userType
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
    }
  },

  async recordReferral(req, res) {
    try {
      const { referralCode, referredUserId, userType } = req.body;
      const referrerCode = await ReferralCode.findOne({ code: referralCode });      
      const existingReferral = await Referral.findOne({ referredUserId });
      const referral = await Referral.create({
        referrerId: referrerCode.userId,
        referredUserId,
        referralCode,
        userType,
        status: 'pending',
        lastUpdated: new Date()
      });
      
      res.json({ success: true, referral });
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

  async getReferralStats(req, res, next) {
    try {
      const { userId } = req.params;
      const referralCode = await ReferralCode.findOne({ userId }).lean();
      const referrals = await Referral.find({ referrerId: userId })
        .select('-__v')
        .lean();
      
      const stats = {
        code: referralCode.code,
        totalReferrals: referralCode.totalReferrals,
        referrals: referrals.map(ref => ({
          userId: ref.referredUserId,
          status: ref.status,
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

// routes/referralRoutes.js
router.post('/generate-code', referralController.generateCode);
router.post('/record-referral', referralController.recordReferral);
router.post('/complete-referral', referralController.completeReferral);
router.get('/stats/:userId', referralController.getReferralStats);
router.post('/check-qualifications', referralController.checkQualifications);

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

// sign-up.js
export default function SignUpPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const referralCode = searchParams.get('ref');
  const [signUpError, setSignUpError] = useState(null);
  
  const handleSignUpComplete = async (user) => {
    if (referralCode) {
      try {
        const response = await axios.post('http://localhost:5000/api/referrals/record-referral', {
          referralCode,
          referredUserId: user.id,
          userType: 'website_owner',
          referredUserDetails: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.primaryEmailAddress?.emailAddress,
            createdAt: new Date()
          }
        });
        
        if (!response.data.success) {
          setSignUpError('Failed to record referral. Please contact support.');
        }
      } catch (error) {
        console.error('Error recording referral:', error);
        setSignUpError('An error occurred during signup. Please try again.');
      }
    }
  };
  
  return (
    <SignUp 
      path="/sign-up"
      routing="path"
      signInUrl="/sign-in"
      redirectUrl="/create-website"
      appearance={authAppearance}
      afterSignUpUrl="/create-website"
      onSignUpComplete={handleSignUpComplete}
    />
  );
}

// components/ReferralDashboard.js
const ReferralDashboard = () => {
  const { user } = useClerk();
  const [referralData, setReferralData] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadReferralData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const generateResponse = await axios.post('http://localhost:5000/api/referrals/generate-code', {
        userId: user.id,
        userType: 'promoter'
      });
      const statsResponse = await axios.get(`http://localhost:5000/api/referrals/stats/${user.id}`);
      if (statsResponse.data.success) {
        setReferralData(statsResponse.data.stats);
      }
    }
  };

  useEffect(() => {
    loadReferralData();
    const pollInterval = setInterval(loadReferralData, 30000);
    return () => clearInterval(pollInterval);
  }, [user?.id]);

  const renderReferralList = () => {
    return referralData.referrals.map((referral, index) => (
      <div key={index} className="mb-4 border rounded-lg p-4">
        <div className={`p-4 rounded-lg ${
          referral.status === 'qualified' ? 'bg-green-50' : 'bg-yellow-50'
        }`}>
          {referral.userDetails && (
            <div className="mt-2 mb-4">
              <p>{`${referral.userDetails.firstName} ${referral.userDetails.lastName}`}</p>
            </div>
          )}
          <div className="mt-2">
            {referral.websiteDetails && (
              <p>{referral.websiteDetails.websiteName}</p>
            )}
            {referral.categoryDetails && (
              <p>{referral.categoryDetails.categoryName}</p>
            )}
          </div>
        </div>
      </div>
    ));
  };

  const getReferralLink = () => {
    if (!referralData?.code) return '';
    return `${window.location.origin}/sign-up?ref=${referralData.code}`;
  };

  const copyReferralLink = async () => {
    // codes...
  };
};