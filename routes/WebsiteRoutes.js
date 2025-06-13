// WebsiteRoutes.js
const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/WebsiteController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const { extractUserInfo } = require('../middleware/auth');

router.use(ClerkExpressRequireAuth());
router.use(extractUserInfo);

router.post('/', websiteController.createWebsite);
router.patch('/:websiteId/name', websiteController.updateWebsiteName)
router.get('/', websiteController.getAllWebsites);
router.get('/:ownerId', websiteController.getWebsitesByOwner);
router.get('/website/:websiteId', websiteController.getWebsiteById);

module.exports = router;
