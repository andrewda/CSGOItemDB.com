const mongoose = require('mongoose');

module.exports = mongoose.model('Prices', {
	item: String,
	current_price: String,
	avg_week_price: String,
	avg_month_price: String,
	lastupdate: String	
});
