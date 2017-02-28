var request = require('request');
var fs = require('fs');

// define constants
var WEEK_SECONDS = 604800;
var MONTH_SECONDS = 2592000;

var options = {};

const   mongoose = require('mongoose');
		mongoose.connect('mongodb://127.0.0.1:27017/itemdb');

const Prices = require('./models/Prices');
const Keys = require('./models/Keys');
const History = require('./models/History');

// get the options from `options.json`
try {
	options = JSON.parse(fs.readFileSync('options.json'));
} catch (err) {
	throw err;
}

////////////////////////////////////////////////////
// Update the prices of all items in the database //
////////////////////////////////////////////////////
function refreshPrices() {
	var current = Math.floor(Date.now() / 1000);

	Prices.find({
		lastupdate: {$lt:(parseInt(current-options.update_time))}
	}, (err, prices) => {
		if(err) {
			throw err;
		}

		if(prices.length > 0) {
			var time = Math.floor(Date.now() / 1000);

			prices.forEach(function(item) {
				Prices.update( {item: item.item}, {$set: {lastupdate: current}}, (err, response) => {
					if(err) {
						throw err;
					}
				});

				request('http://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=730&market_hash_name=' + encodeURIComponent(item.item), function (error, response, body) {
					if(error) {
						throw error;
					}

					var json = null;
					
					if (body.indexOf("success") > 0) {
						json = JSON.parse(body);
					}

					if (!error && response.statusCode === 200 && json.lowest_price !== undefined) {
						time = Math.floor(Date.now() / 1000);

						Prices.update( {item:item.item}, {$set: {current_price:parseFloat(json.lowest_price.replace('$', '')).toString()} }, (err, response) => {
							if(err) {
								throw err;
							}
						});

						const a = new History({
							item: item.item,
							current_price: parseFloat(json.lowest_price.replace('$', '')).toString(),
							time: time.toString()
						});

						a.save((err, response) => {
							if (err) {
								throw err;
							} else {
								console.log('Succesfully updated ' + item.item + ' w/ ' + json.lowest_price);
							}
						});
					} else {
						console.log('Attempting to use CSGOFAST-API for '+ item.item);

						request('https://api.csgofast.com/price/all', function(error, response, body) {
							var json = '';

							try {
								json = JSON.parse(body);
							} catch (e) {
								console.log(item.item + " not found in the Steam Market");
								return;
							}

							var current = Math.floor(Date.now() / 1000);
							if (!error && response.statusCode === 200 && (item.item in json)) {		
								Prices.update( {item:item.item}, {$set: {current_price:json[item.item].toString().replace('$', '')} }, (err, response) => {
									if(err) {
										throw err;
									}
								});

								const a = new History({
									item: item.item,
									current_price: json[item.item].toString().replace('$', ''),
									time: time.toString()
								});

								a.save((err, response) => {
									if (err) {
										throw err;
									} else {
										console.log('Succesfully updated ' + item.item + ' w/ ' + json[item.item].toString().replace('$', ''));
									}
								});
							} else {
								console.log('An error occured receiving price for item: ' + item.item);
							}						
						});
					}
				});
				setTimeout(function() {
					time = Math.floor(Date.now() / 1000);

					// Update Weekly Price
					History.find({
						item: item.item,
						time: {$lt:(time - WEEK_SECONDS)}
					}, (err, his) => {
						if(err) {
							throw err;
						}

						var total = 0;
						var num = 0;
						
						his.forEach(function(item) {
							total += parseFloat(item.price);
							num++;
						});

						if (!isNaN(total/num) && num !== 0) {
							Prices.update( {item: item}, {$set: {avg_week_price: (total/num).toFixed(2).toString()} }, (err, response) => {
								if(err) {
									throw err;
								}
							});
						}
					});

					// Update Monthly Price
					History.find({
						item: item.item,
						time: {$lt:(time - MONTH_SECONDS)}
					}, (err, his) => {
						if(err) {
							throw err;
						}

						var total = 0;
						var num = 0;
						
						his.forEach(function(item) {
							total += parseFloat(item.price);
							num++;
						});

						if (!isNaN(total/num) && num !== 0) {
							Prices.update( {item: item}, {$set: {avg_month_price: (total/num).toFixed(2).toString()} }, (err, response) => {
								if(err) {
									throw err;
								}
							});
						}
					});
				}, 10000);

			});
		}
	});
}

///////////////////////////////////////////////////////////////
// Delete all rows from `price_history` older than one month //
///////////////////////////////////////////////////////////////
function deleteOld() {
	var time = Math.floor(Date.now() / 1000);

	History.remove({
		"time":{$lte:(time - MONTH_SECONDS).toString()}
	}, (err, response) => {
		if(err) {
			throw err;
		}
	});  
}

setTimeout(refreshPrices, 1000);
setInterval(refreshPrices, options.refresh_interval);
setInterval(deleteOld, options.delete_old_interval);
