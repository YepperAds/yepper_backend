// // AdDisplayController.js
// const AdSpace = require('../models/AdSpaceModel');
// const ImportAd = require('../models/ImportAdModel');

// exports.displayAd = async (req, res) => {
//   try {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type');
    
//     const { spaceId, website, category, callback } = req.query;
    
//     if (!spaceId) {
//       return res.status(400).send('Space ID is required');
//     }

//     // Find by webOwnerId instead of _id
//     const adSpace = await AdSpace.findOne({ webOwnerId: spaceId }).populate({
//       path: 'selectedAds',
//       match: { approved: true, confirmed: true }
//     });

//     if (!adSpace) {
//       return res.status(404).send('Ad space not found');
//     }

//     const currentDate = new Date();
//     const { startDate, endDate, availability } = adSpace;
    
//     if (
//       (availability === 'Reserved for future date' || availability === 'Pick a date') &&
//       (currentDate < new Date(startDate) || currentDate > new Date(endDate))
//     ) {
//       return res.status(403).send('Ad is not available during this time period.');
//     }

//     const userCount = adSpace.userCount;
//     const adsToShow = adSpace.selectedAds.slice(0, userCount);

//     const adsHtml = adsToShow
//       .map((selectedAd) => {
//         const imageUrl = selectedAd.imageUrl ? `http://localhost:5000${selectedAd.imageUrl}` : '';
//         const targetUrl = selectedAd.businessLink.startsWith('http') ? 
//           selectedAd.businessLink : `https://${selectedAd.businessLink}`;
//         return `
//           <div class="ad-container">
//             <a href="${targetUrl}" target="_blank" class="ad" data-ad-id="${selectedAd._id}" 
//                 onclick="recordAdClick('${selectedAd._id}')">
//               <img src="${selectedAd.imageUrl}" alt="Ad Image">
//               <p>Sponsored by ${selectedAd.businessName}</p>
//             </a>
//           </div>
//         `;
//       })
//       .join('');

//     if (callback) {
//       res.set('Content-Type', 'application/javascript');
//       return res.send(`${callback}(${JSON.stringify({ html: adsHtml })})`);
//     }

//     return res.status(200).send(adsHtml);

//   } catch (error) {
//     console.error('Error displaying ads:', error);
//     return res.status(500).send('Error displaying ads');
//   }
// };

// exports.incrementView = async (req, res) => {
//   try {
//     const { adId } = req.body;
    
//     if (!adId) {
//       return res.status(400).send('Ad ID is required');
//     }

//     const updatedAd = await ImportAd.findByIdAndUpdate(
//       adId, 
//       { $inc: { views: 1 } },
//       { new: true }
//     );

//     if (!updatedAd) {
//       return res.status(404).send('Ad not found');
//     }

//     return res.status(200).json({ message: 'View recorded', views: updatedAd.views });
//   } catch (error) {
//     console.error('Error recording view:', error);
//     return res.status(500).send('Failed to record view');
//   }
// };

// exports.incrementClick = async (req, res) => {
//   try {
//     const { adId } = req.body;
    
//     if (!adId) {
//       return res.status(400).send('Ad ID is required');
//     }

//     const updatedAd = await ImportAd.findByIdAndUpdate(
//       adId, 
//       { $inc: { clicks: 1 } },
//       { new: true }
//     );

//     if (!updatedAd) {
//       return res.status(404).send('Ad not found');
//     }

//     return res.status(200).json({ message: 'Click recorded', clicks: updatedAd.clicks });
//   } catch (error) {
//     console.error('Error recording click:', error);
//     return res.status(500).send('Failed to record click');
//   }
// };

































// AdDisplayController.js
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');

exports.displayAd = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { categoryId, callback } = req.query;

    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) {
      return res.status(404).json({ 
        error: 'Category not found',
        errorCode: 'CATEGORY_NOT_FOUND'
      });
    }

    // Modified query to correctly match the database structure
    const ads = await ImportAd.find({
      _id: { $in: adCategory.selectedAds },
      'websiteSelections': {
        $elemMatch: {
          websiteId: adCategory.websiteId,
          categories: categoryId,
          approved: true
        }
      },
      'confirmed': true
    });

    if (!ads || ads.length === 0) {
      return res.status(200).json({ 
        error: 'No eligible ads found',
        errorCode: 'NO_ELIGIBLE_ADS'
      });
    }

    const adsToShow = ads.slice(0, adCategory.userCount || ads.length);

    const adsHtml = adsToShow
      .map((ad) => {
        if (!ad) return '';

        try {
          const websiteSelection = ad.websiteSelections.find(
            sel => sel.websiteId.toString() === adCategory.websiteId.toString() &&
                  sel.approved
          );

          if (!websiteSelection) {
            return '';
          }

          const imageUrl = ad.imageUrl || 'https://via.placeholder.com/600x300';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;

          return `
            <div class="ad-container" style="margin: 10px 0;">
              <a href="${targetUrl}" class="ad" data-ad-id="${ad._id}" style="text-decoration: none; color: inherit; display: block;">
                <img src="${imageUrl}" alt="${ad.businessName}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
                <p style="margin: 5px 0; text-align: center;">Sponsored by ${ad.businessName}</p>
              </a>
            </div>
          `;
        } catch (err) {
          console.error('[AdDisplay] Error generating HTML for ad:', ad._id, err);
          return '';
        }
      })
      .filter(html => html)
      .join('');

    if (!adsHtml) {
      return res.status(200).json({ 
        error: 'No ad HTML generated',
        errorCode: 'NO_AD_HTML'
      });
    }

    if (callback) {
      res.set('Content-Type', 'application/javascript');
      const response = `${callback}(${JSON.stringify({ html: adsHtml })})`;
      return res.send(response);
    }

    return res.send(adsHtml);

  } catch (error) {
    console.error('[AdDisplay] Critical error:', error);
    return res.status(500).json({ 
      error: 'Error displaying ads', 
      errorCode: 'INTERNAL_ERROR',
      details: error.message
    });
  }
};

exports.incrementView = async (req, res) => {
  try {
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ error: 'Ad ID is required' });
    }

    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId, 
      { $inc: { views: 1 } },
      { new: true, select: 'views' }
    );

    if (!updatedAd) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    return res.status(200).json({ views: updatedAd.views });
  } catch (error) {
    console.error('Error recording view:', error);
    return res.status(500).json({ error: 'Failed to record view' });
  }
};

exports.incrementClick = async (req, res) => {
  try {
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ error: 'Ad ID is required' });
    }

    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId, 
      { $inc: { clicks: 1 } },
      { new: true, select: 'clicks' }
    );

    if (!updatedAd) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    return res.status(200).json({ clicks: updatedAd.clicks });
  } catch (error) {
    console.error('Error recording click:', error);
    return res.status(500).json({ error: 'Failed to record click' });
  }
};