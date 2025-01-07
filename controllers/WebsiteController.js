// WebsiteController.js
const Website = require('../models/WebsiteModel');
const multer = require('multer');
const path = require('path');
const bucket = require('../config/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|avi|mov|mkv|webm/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

const uploadToGCS = async (file, retries = 3) => {
  let attempt = 0;
  
  while (attempt < retries) {
    try {
      const blob = bucket.file(`${Date.now()}-${file.originalname}`);
      
      // Set upload options with timeout and retry settings
      const blobStream = blob.createWriteStream({
        resumable: false,
        timeout: 30000, // 30 seconds timeout
        metadata: {
          contentType: file.mimetype,
        },
        public: true // Makes the file public by default
      });

      await new Promise((resolve, reject) => {
        // Handle stream errors
        blobStream.on('error', (err) => {
          console.error(`Upload attempt ${attempt + 1} failed:`, err);
          blobStream.end();
          reject(err);
        });

        // Handle successful upload
        blobStream.on('finish', async () => {
          try {
            // Generate signed URL instead of making public
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            resolve(publicUrl);
          } catch (err) {
            console.error('Error generating public URL:', err);
            reject(err);
          }
        });

        // Write file buffer to stream
        blobStream.end(file.buffer);
      });

      // If we get here, upload was successful
      return `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    } catch (error) {
      attempt++;
      console.error(`Upload attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error('Max upload retries reached');
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
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
        imageUrl = await uploadToGCS(req.file);
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