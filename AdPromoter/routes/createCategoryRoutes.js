// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const AdCategory = require('../models/CreateCategoryModel');
const categoryController = require('../controllers/createCategoryController');
const WalletController = require('../controllers/WalletController');
const WithdrawalController = require('../controllers/WithdrawalController');
const adRejectionController = require('../controllers/AdRejectionController');
const authMiddleware = require('../../middleware/authmiddleware');

router.get('/category/:categoryId', categoryController.getCategoryById);
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);

router.use(authMiddleware);

router.post('/', categoryController.createCategory);
router.get('/pending-rejections', authMiddleware, categoryController.getPendingRejections);
router.get('/active-ads', authMiddleware, categoryController.getActiveAds);
router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, categoryController.rejectAd);
router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);
router.get('/', categoryController.getCategories);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);
router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);
router.get('/pending/:ownerId', categoryController.getPendingAds);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);

router.get('/categoriees/:categoryId', authMiddleware, async (req, res) => {
  try {
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching category' });
  }
});

// PUT /api/ad-categories/categoriees/:categoryId/customization
router.put('/categoriees/:categoryId/customization', authMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { customization } = req.body;
    
    // Validate that the category exists and belongs to the user
    const category = await AdCategory.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Verify ownership if needed
    if (category.ownerId !== req.user.id && category.ownerId !== req.user._id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Update the customization
    category.customization = customization;
    await category.save();
    
    res.json({ 
      message: 'Customization saved successfully',
      category: category
    });
    
  } catch (error) {
    console.error('Error saving customization:', error);
    res.status(500).json({ 
      error: 'Failed to save customization',
      message: error.message 
    });
  }
});

router.get('/wallet', authMiddleware, WalletController.getWallet);
router.get('/wallet/transactions', authMiddleware, WalletController.getWalletTransactions);

router.get('/wallet/:ownerType/balance', authMiddleware, WalletController.getWalletBalance);
router.get('/wallet/:ownerType/transactions', authMiddleware, WalletController.getTransactionHistory);

router.post('/wallet/:ownerType/withdrawal-request', authMiddleware, WithdrawalController.createWithdrawalRequest);
router.get('/wallet/:ownerType/withdrawal-requests', authMiddleware, WithdrawalController.getUserWithdrawalRequests);
router.patch('/wallet/withdrawal-request/:requestId/cancel', authMiddleware, WithdrawalController.cancelWithdrawalRequest);
router.get('/admin/withdrawal-requests', authMiddleware, WithdrawalController.getAllWithdrawalRequests);
router.patch('/admin/withdrawal-request/:requestId/process', authMiddleware, WithdrawalController.processWithdrawalRequest);

router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, adRejectionController.rejectAd);
router.get('/pending-rejections', authMiddleware, adRejectionController.getPendingRejections);

module.exports = router;