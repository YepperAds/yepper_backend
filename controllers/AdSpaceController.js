// AdSpaceController.js
const AdSpace = require('../models/AdSpaceModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');

// const generateApiCodesForAllLanguages = (spaceId, websiteId, categoryId, startDate = null, endDate = null) => {
//   const apiUrl = `http://localhost:5000/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}`;

//   const dateCheckScript = startDate && endDate
//     ? `const now = new Date();
//        const start = new Date("${startDate}");
//        const end = new Date("${endDate}");
//        if (now >= start && now <= end) {
//          loadAd();
//        }`
//     : 'loadAd();'; // Default if no start and end date

//   const rotationScript = `
//     const rotateAds = (ads) => {
//       let currentIndex = 0;
//       ads[currentIndex].style.display = 'block';
      
//       setInterval(() => {
//         ads[currentIndex].style.display = 'none';
//         currentIndex = (currentIndex + 1) % ads.length;
//         ads[currentIndex].style.display = 'block';
//       }, 5000); // Rotate every 5 seconds
//     };

//     const loadAd = () => {
//       const adContainer = document.getElementById("${spaceId}-ad");
//       fetch("${apiUrl}")
//         .then(response => response.text())
//         .then(adsHtml => {
//           adContainer.innerHTML = adsHtml;
//           const ads = adContainer.querySelectorAll('.ad');
//           if (ads.length > 0) {
//             rotateAds(ads); // Start rotating ads
//           }
//         })
//         .catch(error => {
//           console.error('Error loading ads:', error);
//           adContainer.innerHTML = '<p>Error loading ads</p>';
//         });
//     };

//     ${dateCheckScript}
//   `;

//   const apiCodes = {
//     HTML: `
//       <div id="${spaceId}-ad"></div>
//       <script>
//         ${rotationScript}
//       </script>`,
      
//     JavaScript: `
//       <div id="${spaceId}-ad"></div>
//       <script>
//         (function() {
//           ${rotationScript}
//         })();
//       </script>`,
      
//     PHP: `
//       <div id="${spaceId}-ad"></div>
//       <script>
//         <?php echo "${rotationScript}"; ?>
//       </script>`,

//     Python: `
//       print('''
//       <div id="${spaceId}-ad"></div>
//       <script>
//         ${rotationScript}
//       </script>
//       ''')`,
//   };

//   return apiCodes;
// };

const generateApiCodesForAllLanguages = (spaceId, websiteId, categoryId, startDate = null, endDate = null) => {
  const apiUrl = `https://yepper-backend.onrender.com/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}`;

  const dateCheckScript = startDate && endDate
    ? `const now = new Date();
       const start = new Date("${startDate}");
       const end = new Date("${endDate}");
       if (now >= start && now <= end) {
         loadAd();
       }`
    : 'loadAd();'; // Default if no start and end date

    const rotationScript = `
      const rotateAds = (ads) => {
        let currentIndex = 0;
        ads[currentIndex].style.display = 'block';

        setInterval(() => {
          ads[currentIndex].style.display = 'none';
          currentIndex = (currentIndex + 1) % ads.length;
          ads[currentIndex].style.display = 'block';
        }, 5000); // Rotate every 5 seconds
      };

      const loadAd = () => {
        const adContainer = document.getElementById("${spaceId}-ad");
        fetch("${apiUrl}")
          .then(response => response.text())
          .then(adsHtml => {
            adContainer.innerHTML = adsHtml;

            // Increment view count
            adContainer.querySelectorAll('.ad').forEach(adElement => {
              const adId = adElement.getAttribute('data-ad-id');
              fetch("https://yepper-backend.onrender.com/api/ads/view", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adId })
              });
            });

            // Rotate ads and add click event listeners
            const ads = adContainer.querySelectorAll('.ad');
            if (ads.length > 0) {
              rotateAds(ads);
              ads.forEach(ad => ad.addEventListener('click', () => {
                const adId = ad.getAttribute('data-ad-id');
                fetch("https://yepper-backend.onrender.com/api/ads/click", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ adId })
                });
              }));
            }
          })
          .catch(error => {
            console.error('Error loading ads:', error);
            adContainer.innerHTML = '<p>Error loading ads</p>';
          });
      };
      ${dateCheckScript}
    `;

  const apiCodes = {
    HTML: `
      <div id="${spaceId}-ad"></div>
      <script>
        ${rotationScript}
      </script>`,
      
    JavaScript: `
      <div id="${spaceId}-ad"></div>
      <script>
        (function() {
          ${rotationScript}
        })();
      </script>`,
      
    PHP: `
      <div id="${spaceId}-ad"></div>
      <script>
        <?php echo "${rotationScript}"; ?>
      </script>`,

    Python: `
      print('''
      <div id="${spaceId}-ad"></div>
      <script>
        ${rotationScript}
      </script>
      ''')`,
  };

  return apiCodes;
};

exports.createSpace = async (req, res) => {
  try {
    const { webOwnerId, categoryId, spaceType, price, availability, userCount, instructions, startDate, endDate, webOwnerEmail } = req.body;

    if (!webOwnerId || !categoryId || !spaceType || !price || !availability || !userCount) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Retrieve website ID from the category
    const category = await AdCategory.findById(categoryId).populate('websiteId');
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    const websiteId = category.websiteId._id;

    // Create new AdSpace
    const newSpace = new AdSpace({
      webOwnerId,
      categoryId,
      spaceType,
      price,
      availability,
      userCount,
      instructions,
      startDate,
      endDate,
      webOwnerEmail
    });
    const savedSpace = await newSpace.save();

    // Generate API codes
    const apiCodes = generateApiCodesForAllLanguages(savedSpace._id, websiteId, categoryId, startDate, endDate);
    savedSpace.apiCodes = apiCodes;
    await savedSpace.save();

    res.status(201).json(savedSpace);
  } catch (error) {
    console.error('Error saving ad space:', error);
    res.status(500).json({ message: 'Failed to create ad space', error });
  }
};

exports.getAllSpaces = async (req, res) => {
  try {
    const spaces = await AdSpace.find()
      .populate({
        path: 'categoryId', 
        populate: {
          path: 'websiteId'  // Populate the websiteId inside the category
        }
      });  
    res.status(200).json(spaces);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all ad spaces', error });
  }
};

exports.getSpaces = async (req, res) => {
  try {
    const spaces = await AdSpace.find({ categoryId: req.params.categoryId });
    res.status(200).json(spaces);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch ad spaces', error });
  }
};

exports.getSpacesByOwner = async (req, res) => {
  const { ownerId } = req.params;

  try {
    // Find spaces where the webOwnerEmail matches the owner's email
    const spaces = await AdSpace.find({ webOwnerEmail: ownerId }).populate({
      path: 'categoryId',
      populate: { path: 'websiteId' }, // Populating the website for each category
    });
    res.status(200).json(spaces);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch ad spaces', error });
  }
};

exports.getAdContent = async (req, res) => {
  try {
    const { space, category } = req.query;

    if (!space || !category) {
      return res.status(400).send('Invalid space or category');
    }

    // Find all AdSpaces matching the spaceType and categoryId
    const adSpaces = await AdSpace.find({ spaceType: space, categoryId: category });

    if (!adSpaces || adSpaces.length === 0) {
      return res.status(404).send('No ad spaces found');
    }

    // Find all ads that are linked to any of the ad spaces
    const ads = await ImportAd.find({ selectedSpaces: { $in: adSpaces.map(space => space._id) } });

    if (!ads || ads.length === 0) {
      return res.status(404).send('No ads found for the selected space');
    }

    // Create ad elements for each ad
    const adElements = ads.map(ad => {
      let adContent = '';

      if (ad.imageUrl) {
        adContent += `<img src="${ad.imageUrl}" alt="${ad.businessName}" style="width:100%;height:auto;" />`;
      }

      if (ad.videoUrl) {
        adContent += `<video controls style="width:100%;height:auto;"><source src="${ad.videoUrl}" type="video/mp4" /></video>`;
      }

      if (ad.pdfUrl) {
        adContent += `<a href="${ad.pdfUrl}" target="_blank">${ad.businessName} Ad PDF</a>`;
      }

      return `<div class="ad" style="display:none;">${adContent}</div>`;
    }).join('');

    res.send(`
      <div id="ad-container">${adElements}</div>
      <script>
        let ads = document.querySelectorAll('#ad-container .ad');
        let currentIndex = 0;
        if (ads.length > 0) {
          ads[currentIndex].style.display = 'block';
        }
        setInterval(() => {
          ads[currentIndex].style.display = 'none';
          currentIndex = (currentIndex + 1) % ads.length;
          ads[currentIndex].style.display = 'block';
        }, 5000);
      </script>
    `);
  } catch (error) {
    console.error('Error fetching ad content:', error);
    res.status(500).send('Internal Server Error');
  }
};