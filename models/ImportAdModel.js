// // importAdSchema.js
// const mongoose = require('mongoose');

// const importAdSchema = new mongoose.Schema({
//   userId: { type: String, required: true },
//   businessName: { type: String, required: true },
//   businessLocation: { type: String },
//   adDescription: { type: String },
//   imageUrl: { type: String },
//   pdfUrl: { type: String },
//   videoUrl: { type: String },
//   templateType: { type: String},
//   categories: [{ type: String }],
//   paymentStatus: { type: String, default: 'pending' },
//   paymentRef: { type: String },
//   amount: { type: Number },
//   email: { type: String },
//   phoneNumber: { type: String },
// }, { timestamps: true });

// module.exports = mongoose.model('ImportAd', importAdSchema);



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
  selectedSpaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdSpace' }],
  approved: { type: Boolean, default: false },
  confirmed: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
});

module.exports = mongoose.model('ImportAd', importAdSchema);