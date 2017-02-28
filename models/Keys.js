const mongoose = require('mongoose');

module.exports = mongoose.model('Keys', {
	key: String,
	steamid: String,
	premium: Boolean
});
