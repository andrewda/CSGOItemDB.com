const mongoose = require('mongoose');

module.exports = mongoose.model('History', {
	item: String,
	current_price: String,
	time: String
});
