// AdCategoryModel.js
const mongoose = require('mongoose');

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
  createdAt: { type: Date, default: Date.now }
});

adCategorySchema.index({ ownerId: 1, websiteId: 1, categoryName: 1 });

const AdCategory = mongoose.model('AdCategory', adCategorySchema);
module.exports = AdCategory;

// ImportAdModel.js
const mongoose = require('mongoose');
const importAdSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  adOwnerEmail: { type: String, required: true },
  imageUrl: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  businessName: { type: String, required: true },
  businessLink: { type: String, required: true },
  businessLocation: { type: String, required: true },
  adDescription: { type: String, required: true },
  selectedWebsites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Website' }],
  selectedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory' }],
  approved: { type: Boolean, default: false },
  confirmed: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
});

module.exports = mongoose.model('ImportAd', importAdSchema);

// AdCategoryController.js
const AdCategory = require('../models/AdCategoryModel');

const encryptCode = (code) => {
  return Buffer.from(code).toString('base64');
};

const generateSecureScript = (categoryId) => {
  // Note: categoryId should be the _id of the AdCategory document
  const baseCode = `
    (function(){
      const d=document,
            _i="${categoryId}", // This should be the MongoDB _id of the category
            _b="http://localhost:5000",
            _t=5000;
      const _l=()=>{
        // Create container
        const c=d.createElement("div");
        c.id=_i+"-ad";
        
        // Find the script tag
        let currentScript = d.currentScript;
        if (!currentScript) {
          const scripts = d.getElementsByTagName('script');
          for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].textContent.includes("${categoryId}")) {
              currentScript = scripts[i];
              break;
            }
          }
        }
        
        // Insert container before the script tag if found, otherwise append to body
        if (currentScript && currentScript.parentNode) {
          currentScript.parentNode.insertBefore(c, currentScript);
        } else {
          d.body.appendChild(c);
        }

        // Load ads
        const s=d.createElement("script");
        const r="y"+Math.random().toString(36).substr(2,9);
        window[r]=h=>{
          if(!h||!h.html)return;
          c.innerHTML=h.html;
          const a=[...c.getElementsByClassName("ad-container")];
          if(!a.length)return;
          let x=0;
          a[x].style.display="block";
          a.forEach(e=>{
            const adLink = e.querySelector('a');
            if (!adLink) return;
            const i = adLink.dataset.adId;
            new Image().src=_b+"/api/ads/view/"+i;
            adLink.onclick=(event)=>{
              event.preventDefault();
              new Image().src=_b+"/api/ads/click/"+i;
              window.open(adLink.href, '_blank');
            };
          });
          if(a.length>1)setInterval(()=>{
            a[x].style.display="none";
            x=(x+1)%a.length;
            a[x].style.display="block";
          },_t);
          delete window[r];
        };
        s.src=_b+"/api/ads/display?categoryId="+_i+"&callback="+r;
        s.onerror = () => {
          console.error("Failed to load ads");
          c.innerHTML = "<!-- Ad loading failed -->";
        };
        d.body.appendChild(s);
      };
      
      // Execute when DOM is ready
      if(d.readyState==="loading") {
        d.addEventListener("DOMContentLoaded",_l);
      } else {
        _l();
      }
    })();
  `;

  return `eval(atob("${encryptCode(baseCode)}"))`;
};

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
      webOwnerEmail 
    } = req.body;

    if (!ownerId || !websiteId || !categoryName || !price || !spaceType || !webOwnerEmail) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newCategory = new AdCategory({
      ownerId,
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      userCount: userCount || 0,
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail,
      selectedAds: []
    });

    // Save the category first to get its _id
    const savedCategory = await newCategory.save();

    // Generate the script with the saved category's _id
    const secureScript = generateSecureScript(savedCategory._id.toString());

    // Update the category with the generated script
    savedCategory.apiCodes = {
      HTML: `<script>${secureScript}</script>`,
      JavaScript: secureScript,
      PHP: `<?php echo '<script>${secureScript}</script>'; ?>`,
      Python: `print('<script>${secureScript}</script>')`
    };

    // Save again with the updated apiCodes
    const finalCategory = await savedCategory.save();
    
    res.status(201).json(finalCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ 
      message: 'Failed to create category', 
      error: error.message 
    });
  }
};

// AdApprovalController.js
const ImportAd = require('../models/ImportAdModel');
const AdSpace = require('../models/AdSpaceModel');
const AdCategory = require('../models/AdCategoryModel');

exports.confirmAdDisplay = async (req, res) => {
    try {
      const { adId } = req.params;
  
      // Update the ad's confirmation status
      const confirmedAd = await ImportAd.findByIdAndUpdate(
        adId,
        { 
          confirmed: true,
          $set: { 
            confirmationDate: new Date() 
          }
        },
        { new: true }
      );
  
      if (!confirmedAd) {
        return res.status(404).json({ message: 'Ad not found' });
      }
  
      // Update all selected spaces to include this ad
      await AdCategory.updateMany(
        { _id: { $in: confirmedAd.selectedCategories } },
        { 
          $addToSet: { 
            selectedAds: confirmedAd._id 
          }
        }
      );
  
      res.status(200).json({ 
        message: 'Ad confirmed and now live on selected spaces',
        ad: confirmedAd
      });
  
    } catch (error) {
      console.error('Error confirming ad display:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
};

// AdDisplayController.js
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');

exports.displayAd = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { categoryId, callback } = req.query;
    
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' });
    }

    // Find the category directly by its _id
    const adCategory = await AdCategory.findById(categoryId).populate({
      path: 'selectedAds',
      match: { approved: true, active: true },
      select: 'imageUrl businessLink businessName _id'
    });

    if (!adCategory) {
      return res.status(404).json({ error: 'Ad category not found' });
    }

    const adsToShow = adCategory.selectedAds.slice(0, adCategory.userCount);

    const adsHtml = adsToShow
      .map((ad) => {
        const imageUrl = ad.imageUrl ? `http://localhost:5000${ad.imageUrl}` : '';
        const targetUrl = ad.businessLink.startsWith('http') ? 
          ad.businessLink : `https://${ad.businessLink}`;
        return `
          <div class="ad-container" style="display: none;">
            <a href="${targetUrl}" class="ad" data-ad-id="${ad._id}">
              <img src="${imageUrl}" alt="Advertisement">
              <p>Sponsored by ${ad.businessName}</p>
            </a>
          </div>
        `;
      })
      .join('');

    if (callback) {
      res.set('Content-Type', 'application/javascript');
      return res.send(`${callback}(${JSON.stringify({ html: adsHtml })})`);
    }

    return res.send(adsHtml);

  } catch (error) {
    console.error('Error displaying ads:', error);
    return res.status(500).json({ error: 'Error displaying ads' });
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

<!DOCTYPE html>
<html lang="en">
    <body>

    <header>
        <h1>Daily News</h1>
        <nav>
        <a href="#">Home</a>
        <a href="#">World</a>
        </nav>
    </header>

    <div class="container">
        <!-- Main Content -->
        <div class="main-content">
        <div class="article">
            <img src="https://via.placeholder.com/600x300" alt="News Image">
            <h2>Breaking News Headline</h2>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam.</p>
        </div>

        <div class="ad-container">
            <script>eval(atob("CiAgICAoZnVuY3Rpb24oKXsKICAgICAgY29uc3QgZD1kb2N1bWVudCwKICAgICAgICAgICAgX2k9IjY3ODJjZmM4ZjJkOWNlYjJlMTA0MDgyOCIsCiAgICAgICAgICAgIF9iPSJodHRwOi8vbG9jYWxob3N0OjUwMDAiLAogICAgICAgICAgICBfdD01MDAwOwogICAgICBjb25zdCBfbD0oKT0+ewogICAgICAgIC8vIENyZWF0ZSBjb250YWluZXIKICAgICAgICBjb25zdCBjPWQuY3JlYXRlRWxlbWVudCgiZGl2Iik7CiAgICAgICAgYy5pZD1faSsiLWFkIjsKICAgICAgICAKICAgICAgICAvLyBGaW5kIHRoZSBzY3JpcHQgdGFnCiAgICAgICAgbGV0IGN1cnJlbnRTY3JpcHQgPSBkLmN1cnJlbnRTY3JpcHQ7CiAgICAgICAgaWYgKCFjdXJyZW50U2NyaXB0KSB7CiAgICAgICAgICBjb25zdCBzY3JpcHRzID0gZC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7CiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHsKICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0udGV4dENvbnRlbnQuaW5jbHVkZXMoIjY3ODJjZmM4ZjJkOWNlYjJlMTA0MDgyOCIpKSB7CiAgICAgICAgICAgICAgY3VycmVudFNjcmlwdCA9IHNjcmlwdHNbaV07CiAgICAgICAgICAgICAgYnJlYWs7CiAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICB9CiAgICAgICAgCiAgICAgICAgLy8gSW5zZXJ0IGNvbnRhaW5lciBiZWZvcmUgdGhlIHNjcmlwdCB0YWcgaWYgZm91bmQsIG90aGVyd2lzZSBhcHBlbmQgdG8gYm9keQogICAgICAgIGlmIChjdXJyZW50U2NyaXB0ICYmIGN1cnJlbnRTY3JpcHQucGFyZW50Tm9kZSkgewogICAgICAgICAgY3VycmVudFNjcmlwdC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShjLCBjdXJyZW50U2NyaXB0KTsKICAgICAgICB9IGVsc2UgewogICAgICAgICAgZC5ib2R5LmFwcGVuZENoaWxkKGMpOwogICAgICAgIH0KCiAgICAgICAgLy8gTG9hZCBhZHMKICAgICAgICBjb25zdCBzPWQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iik7CiAgICAgICAgY29uc3Qgcj0ieSIrTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsOSk7CiAgICAgICAgd2luZG93W3JdPWg9PnsKICAgICAgICAgIGlmKCFofHwhaC5odG1sKXJldHVybjsKICAgICAgICAgIGMuaW5uZXJIVE1MPWguaHRtbDsKICAgICAgICAgIGNvbnN0IGE9Wy4uLmMuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgiYWQtY29udGFpbmVyIildOwogICAgICAgICAgaWYoIWEubGVuZ3RoKXJldHVybjsKICAgICAgICAgIGxldCB4PTA7CiAgICAgICAgICBhW3hdLnN0eWxlLmRpc3BsYXk9ImJsb2NrIjsKICAgICAgICAgIGEuZm9yRWFjaChlPT57CiAgICAgICAgICAgIGNvbnN0IGFkTGluayA9IGUucXVlcnlTZWxlY3RvcignYScpOwogICAgICAgICAgICBpZiAoIWFkTGluaykgcmV0dXJuOwogICAgICAgICAgICBjb25zdCBpID0gYWRMaW5rLmRhdGFzZXQuYWRJZDsKICAgICAgICAgICAgbmV3IEltYWdlKCkuc3JjPV9iKyIvYXBpL2Fkcy92aWV3LyIraTsKICAgICAgICAgICAgYWRMaW5rLm9uY2xpY2s9KGV2ZW50KT0+ewogICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7CiAgICAgICAgICAgICAgbmV3IEltYWdlKCkuc3JjPV9iKyIvYXBpL2Fkcy9jbGljay8iK2k7CiAgICAgICAgICAgICAgd2luZG93Lm9wZW4oYWRMaW5rLmhyZWYsICdfYmxhbmsnKTsKICAgICAgICAgICAgfTsKICAgICAgICAgIH0pOwogICAgICAgICAgaWYoYS5sZW5ndGg+MSlzZXRJbnRlcnZhbCgoKT0+ewogICAgICAgICAgICBhW3hdLnN0eWxlLmRpc3BsYXk9Im5vbmUiOwogICAgICAgICAgICB4PSh4KzEpJWEubGVuZ3RoOwogICAgICAgICAgICBhW3hdLnN0eWxlLmRpc3BsYXk9ImJsb2NrIjsKICAgICAgICAgIH0sX3QpOwogICAgICAgICAgZGVsZXRlIHdpbmRvd1tyXTsKICAgICAgICB9OwogICAgICAgIHMuc3JjPV9iKyIvYXBpL2Fkcy9kaXNwbGF5P2NhdGVnb3J5SWQ9IitfaSsiJmNhbGxiYWNrPSIrcjsKICAgICAgICBzLm9uZXJyb3IgPSAoKSA9PiB7CiAgICAgICAgICBjb25zb2xlLmVycm9yKCJGYWlsZWQgdG8gbG9hZCBhZHMiKTsKICAgICAgICAgIGMuaW5uZXJIVE1MID0gIjwhLS0gQWQgbG9hZGluZyBmYWlsZWQgLS0+IjsKICAgICAgICB9OwogICAgICAgIGQuYm9keS5hcHBlbmRDaGlsZChzKTsKICAgICAgfTsKICAgICAgCiAgICAgIC8vIEV4ZWN1dGUgd2hlbiBET00gaXMgcmVhZHkKICAgICAgaWYoZC5yZWFkeVN0YXRlPT09ImxvYWRpbmciKSB7CiAgICAgICAgZC5hZGRFdmVudExpc3RlbmVyKCJET01Db250ZW50TG9hZGVkIixfbCk7CiAgICAgIH0gZWxzZSB7CiAgICAgICAgX2woKTsKICAgICAgfQogICAgfSkoKTsKICA="))</script>
        </div>

    </body>
</html>