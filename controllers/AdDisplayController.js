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
    
    // Check if categoryId exists
    if (!categoryId) {
      console.error('[AdDisplay] Missing categoryId in request');
      return res.status(400).json({ 
        error: 'Category ID is required',
        errorCode: 'MISSING_CATEGORY_ID'
      });
    }

    // Validate categoryId format
    if (!categoryId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('[AdDisplay] Invalid categoryId format:', categoryId);
      return res.status(400).json({ 
        error: 'Invalid category ID format',
        errorCode: 'INVALID_CATEGORY_ID_FORMAT'
      });
    }

    // Find category and log the query
    console.log('[AdDisplay] Searching for category:', categoryId);
    const adCategory = await AdCategory.findById(categoryId);

    // Check if category exists
    if (!adCategory) {
      console.error('[AdDisplay] Category not found:', categoryId);
      return res.status(404).json({ 
        error: 'Ad category not found',
        errorCode: 'CATEGORY_NOT_FOUND'
      });
    }

    console.log('[AdDisplay] Category found:', {
      id: adCategory._id,
      name: adCategory.categoryName,
      selectedAdsCount: adCategory.selectedAds.length
    });

    // Populate and check selected ads
    const populatedCategory = await AdCategory.findById(categoryId).populate({
      path: 'selectedAds',
      match: { 
        approved: true,
        confirmed: true
      },
      select: 'imageUrl businessLink businessName _id approved confirmed'
    });

    if (!populatedCategory.selectedAds || populatedCategory.selectedAds.length === 0) {
      console.error('[AdDisplay] No eligible ads found for category:', categoryId, {
        totalAds: adCategory.selectedAds.length,
        filterCriteria: { approved: true, confirmed: true }
      });

      // Find all ads to see their status
      const allAds = await ImportAd.find({
        '_id': { $in: adCategory.selectedAds }
      }, 'approved confirmed businessName');

      console.log('[AdDisplay] Ad statuses:', allAds.map(ad => ({
        id: ad._id,
        businessName: ad.businessName,
        approved: ad.approved,
        confirmed: ad.confirmed
      })));

      return res.status(200).json({ 
        error: 'No eligible ads found',
        errorCode: 'NO_ELIGIBLE_ADS',
        debug: {
          totalAds: adCategory.selectedAds.length,
          approvedAndConfirmed: populatedCategory.selectedAds.length,
          adStatuses: allAds.map(ad => ({
            id: ad._id,
            status: {
              approved: ad.approved,
              confirmed: ad.confirmed
            }
          }))
        }
      });
    }

    const adsToShow = populatedCategory.selectedAds.slice(0, 
      adCategory.userCount || populatedCategory.selectedAds.length);

    console.log('[AdDisplay] Preparing to show ads:', {
      totalEligible: populatedCategory.selectedAds.length,
      showing: adsToShow.length,
      userCount: adCategory.userCount
    });

    const adsHtml = adsToShow
      .map((ad) => {
        if (!ad) {
          console.error('[AdDisplay] Null ad object encountered');
          return '';
        }

        try {
          const imageUrl = ad.imageUrl ? 
            (ad.imageUrl.startsWith('http') ? ad.imageUrl : `http://localhost:5000${ad.imageUrl}`) : '';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;

          console.log('[AdDisplay] Generated ad HTML for:', {
            adId: ad._id,
            businessName: ad.businessName,
            hasImage: !!ad.imageUrl
          });
            
          return `
            <div class="ad-container" style="display: none; border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
              <a href="${targetUrl}" class="ad" data-ad-id="${ad._id}" style="text-decoration: none; color: inherit;">
                ${imageUrl ? `<img src="${imageUrl}" alt="${ad.businessName}" style="max-width: 100%; height: auto;">` : ''}
                <p style="margin: 5px 0;">Sponsored by ${ad.businessName}</p>
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
      console.error('[AdDisplay] No HTML generated for ads');
      return res.status(200).json({ 
        error: 'No ad HTML generated',
        errorCode: 'NO_AD_HTML'
      });
    }

    console.log('[AdDisplay] Successfully generated HTML for', adsToShow.length, 'ads');

    if (callback) {
      res.set('Content-Type', 'application/javascript');
      const response = `${callback}(${JSON.stringify({ html: adsHtml })})`;
      console.log('[AdDisplay] Sending JSONP response');
      return res.send(response);
    }

    console.log('[AdDisplay] Sending HTML response');
    return res.send(adsHtml);

  } catch (error) {
    console.error('[AdDisplay] Critical error:', error);
    return res.status(500).json({ 
      error: 'Error displaying ads', 
      errorCode: 'INTERNAL_ERROR',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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