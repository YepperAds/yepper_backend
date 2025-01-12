const crypto = require('crypto');

const generateEncryptionKey = () => crypto.randomBytes(32);

const obfuscateScript = (script) => script
  .replace(/\s+/g, ' ')
  .replace(/\/\/.*/g, '')
  .replace(/console\.log.*?;/g, '');

const generateSecureLoader = (encodedScript, categoryId) => `
  (function(){
    try {
      const scriptData = '${encodedScript}';
      const categoryId = '${categoryId}';

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.text = atob(scriptData);
      document.body.appendChild(script);
    } catch (e) {
      console.error('Error loading ad script:', e);
      const errorDiv = document.createElement('div');
      errorDiv.textContent = 'Ad temporarily unavailable';
      document.body.appendChild(errorDiv);
    }
  })();
`;

const generateSecureScript = (categoryId) => {
  const script = `
    (function(){
      const categoryId = '${categoryId}';
      const baseUrl = '${process.env.BASE_URL || 'http://localhost:5000'}/api';

      function loadAd() {
        // Ad loading logic here
      }

      document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', loadAd)
        : loadAd();
    })();
  `;

  const obfuscated = obfuscateScript(script);
  const encoded = Buffer.from(obfuscated).toString('base64');
  return generateSecureLoader(encoded, categoryId);
};

module.exports = {
  generateEncryptionKey,
  generateSecureScript,
};
