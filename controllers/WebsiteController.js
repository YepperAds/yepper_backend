// WebsiteController.js
const Website = require('../models/WebsiteModel');
const multer = require('multer');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// Initialize storage with options
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n')  // Handle newline characters
  }
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
    const bucket = storage.bucket(bucketName);
    const fileName = `${Date.now()}-${file.originalname}`;
    const fileOptions = {
      public: true,
      metadata: {
        contentType: file.mimetype,
      }
    };

    // Create file in bucket
    const cloudFile = bucket.file(fileName);

    // Upload file directly using save() method
    await cloudFile.save(file.buffer, fileOptions);

    // Get public URL
    return `https://storage.googleapis.com/${bucketName}/${fileName}`;
  } catch (error) {
    console.error('Upload error details:', error);
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
  const { page = 1, limit = 10 } = req.query;  // Pagination parameters
  try {
    const websites = await Website.find()
      .lean()  // Use lean for performance
      .select('ownerId websiteName websiteLink imageUrl createdAt')  // Fetch only necessary fields
      // .skip((page - 1) * limit)
      // .limit(parseInt(limit));

    res.status(200).json(websites);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch websites', error });
  }
};

exports.getWebsitesByOwner = async (req, res) => {
  const { ownerId } = req.params;
  try {
    const websites = await Website.find({ ownerId })
      .lean()
      .select('ownerId websiteName websiteLink imageUrl createdAt');
    res.status(200).json(websites);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch websites', error });
  }
};

exports.getWebsiteById = async (req, res) => {
  const { websiteId } = req.params;
  try {
    const website = await Website.findById(websiteId).lean();  // Use lean for fast loading
    if (!website) {
      return res.status(404).json({ message: 'Website not found' });
    }
    res.status(200).json(website);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch website', error });
  }
};