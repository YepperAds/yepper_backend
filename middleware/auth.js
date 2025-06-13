// middleware/auth.js - Create this new middleware file
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Middleware to extract user info from Clerk token
const extractUserInfo = async (req, res, next) => {
  try {
    // The user info is available in req.auth after ClerkExpressRequireAuth
    if (req.auth && req.auth.userId) {
      // Get user details from Clerk
      const { clerkClient } = require('@clerk/clerk-sdk-node');
      const user = await clerkClient.users.getUser(req.auth.userId);
      
      // Add email to request object
      req.userEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress;
    }
    
    next();
  } catch (error) {
    console.error('Error extracting user info:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

module.exports = { extractUserInfo };