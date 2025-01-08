// ApiGeneratorController.js
exports.generateApi = async (req, res) => {
  const { websiteId, categoryId, selectedSpaces, language } = req.body;

  if (!websiteId || !categoryId || !selectedSpaces || !language) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const generateApiCodesForAllLanguages = (spaceId, websiteId, categoryId, startDate = null, endDate = null) => {
    const baseUrl = 'https://yepper-backend.onrender.com';
    
    const jsonpScript = `
      function loadYepperAd_${spaceId}() {
        const script = document.createElement('script');
        const callback = 'handleYepperAd_' + Math.random().toString(36).substr(2, 9);
        window[callback] = function(response) {
          const container = document.getElementById("${spaceId}-ad");
          container.innerHTML = response.html;
          delete window[callback];
        };
        
        script.src = "${baseUrl}/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}&callback=" + callback;
        document.body.appendChild(script);
      }
  
      function recordAdClick(adId) {
        const img = new Image();
        img.src = "${baseUrl}/api/ads/click?adId=" + adId;
      }
  
      function recordAdView(adId) {
        const img = new Image();
        img.src = "${baseUrl}/api/ads/view?adId=" + adId;
      }
    `;
  
    return {
      HTML: `
        <div id="${spaceId}-ad"></div>
        <script>${jsonpScript}</script>
        <script>loadYepperAd_${spaceId}();</script>
      `,
      JavaScript: `
        (function() {
          const container = document.createElement('div');
          container.id = "${spaceId}-ad";
          document.currentScript.parentNode.insertBefore(container, document.currentScript);
          ${jsonpScript}
          loadYepperAd_${spaceId}();
        })();
      `,
      PHP: `
        <div id="<?php echo '${spaceId}-ad'; ?>"></div>
        <script><?php echo '${jsonpScript}'; ?></script>
        <script>loadYepperAd_<?php echo '${spaceId}'; ?>();</script>
      `,
      Python: `
        print(f'''
          <div id="${spaceId}-ad"></div>
          <script>{jsonpScript}</script>
          <script>loadYepperAd_${spaceId}();</script>
        ''')
      `
    };
  };

  let apiCode = '';

  Object.keys(selectedSpaces).forEach((spaceType) => {
    if (selectedSpaces[spaceType]) {  // Only generate for selected spaces
      if (language === 'HTML') {
        return `<script src="https://yepper-backend.onrender.com/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}"></script>`;
      } else if (language === 'JavaScript') {
        return `<script>\n(function() {\n  var ad = document.createElement('script');\n  ad.src = "https://yepper-backend.onrender.com/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}";\n  document.getElementById("${space}-ad").appendChild(ad);\n})();\n</script>`;
      } else if (language === 'PHP') {
        apiCode += `<?php echo '<div id="${space}-ad"><script src="https://yepper-backend.onrender.com/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}"></script></div>'; ?>\n`;
      } else if (language === 'Python') {
        apiCode += `print('<div id="${spaceType}-ad"><script src="https://yepper-backend.onrender.com/api/ads/display?space=${spaceId}&website=${websiteId}&category=${categoryId}"></script></div>')\n`;
      } else {
        apiCode += `<div id="${space}-ad">Language not supported</div>\n`;
      }
    }
  });

  res.status(200).json({ apiCode });
};
