// ApiGeneratorController.js
exports.generateApi = async (req, res) => {
  const { websiteId, categoryId, selectedSpaces, language } = req.body;

  if (!websiteId || !categoryId || !selectedSpaces || !language) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const generateAdScriptForSpace = (spaceType, websiteId, categoryId) => {
    return `<script src="https://yepper-backend.onrender.com/api/ads?space=${spaceType}&website=${websiteId}&category=${categoryId}"></script>`;
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
