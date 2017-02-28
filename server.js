var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var request = require('request');
var fs = require('fs');

var options = {};

var lastCheck = 0;
var lastResult;


const 	mongoose = require('mongoose');
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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;
var router = express.Router();

////////////////////
// On GET request //
////////////////////
router.get('/', function(req, res) {
	var query = res.req.query;

	if (query.key === undefined || query.item === undefined) {
		res.json({ success: false, error: options.errors.missing_params });
		return;
	}

	Keys.findOne({
		key: query.key
	}, (err, keys) => {
		if(err) {
			throw err;
		}

		if (keys !== null) {
			var isPremium = keys.premium;

			if (isPremium) {
				Prices.findOne({
					item: query.item
				}, (err, prices) => {
					if(err) {
						throw err;
					}

					if(prices != null) {
						var current_price, avg_week_price, avg_month_price;

						if (prices.current_price !== undefined && prices.avg_week_price !== undefined && prices.avg_month_price !== undefined) {
							current_price = prices.current_price;
							avg_week_price = prices.avg_week_price;
							avg_month_price = prices.avg_month_price;
						}

						if (current_price !== undefined && avg_week_price !== undefined && avg_month_price !== undefined) {
							res.json({ success: true, current_price: current_price, avg_week_price: avg_week_price, avg_month_price: avg_month_price, lastupdate: prices.lastupdate });
						}					
					} else {
						// if the item is not found in our database, get the data from the market
						request('http://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=730&market_hash_name=' + encodeURIComponent(query.item), function(error, response, body) {
							var json = '';
							
							try {
								json = JSON.parse(body);
							} catch (e) {
								res.json({ success: false, error: options.errors.unknown_item });
								return;
							}
							
							var current = Math.floor(Date.now() / 1000);
							if (!error && response.statusCode === 200 && json.lowest_price !== undefined && json.median_price !== undefined) {
								const a = new Prices({
									"item": query.item,
									"current_price": json.lowest_price.replace('$', ''),
									"avg_week_price": json.median_price.replace('$', ''),
									"avg_month_price": json.median_price.replace('$', ''),
									"lastupdate": current	
								});

								a.save((err, response) => {
									if (err) {
										throw err;
									}
								})

								const b = new History({
									item: query.item,
									current_price: json.median_price.replace('$', ''),
									time: current
								});

								b.save((err, response) => {
									if (err) {
										throw err;
									}
								})
						
								res.json({ 
									success: true, 
									current_price: json.lowest_price.replace('$', ''), 
									avg_week_price: json.median_price.replace('$', ''), 
									avg_month_price: json.median_price.replace('$', ''), 
									lastupdate: current
								});				
							} else {
								console.log('Attempting to use CSGOFAST-API for '+ query.item);

								request('https://api.csgofast.com/price/all', function(error, response, body) {
									var json = '';

									try {
										json = JSON.parse(body);
									} catch (e) {
										res.json({ success: false, error: options.errors.unknown_item });
										return;
									}

									var current = Math.floor(Date.now() / 1000);
									if (!error && response.statusCode === 200 && (query.item in json)) {		
										const a = new Prices({
											"item": query.item,
											"current_price": json[query.item].toString().replace('$', ''),
											"avg_week_price": json[query.item].toString().replace('$', ''),
											"avg_month_price": json[query.item].toString().replace('$', ''),
											"lastupdate": current	
										});

										a.save((err, response) => {
											if (err) {
												throw err;
											}
										})

										const b = new History({
											item: query.item,
											current_price: json[query.item].toString().replace('$', ''),
											time: current
										});

										b.save((err, response) => {
											if (err) {
												throw err;
											}
										})
								
										res.json({
											success: true, 
											current_price: json[query.item].toString().replace('$', ''),
											avg_week_price: json[query.item].toString().replace('$', ''),
											avg_month_price: json[query.item].toString().replace('$', ''),
											lastupdate: current
										});							
									} else {
										res.json({ success: false, error: options.errors.unknown_item });
									}						
								});
							}
						});
					}
				});
			} else {
				res.json({ success: false, error: options.errors.not_premium });
			}
		} else {
			res.json({ success: false, error: options.errors.invalid_key });
		}
	});
});

router.get('/all', function(req, res) {
	var query = res.req.query;

	if (query.key === undefined) {
		res.json({ success: false, error: options.errors.missing_params });
		return;
	}
	
	Keys.findOne({
		key: query.key
	}, (err, keys) => {
		if(err) {
			throw err;
		}

		if (keys !== null) {
			var isPremium = keys.premium;

			if (isPremium) {		
				Prices.find({}, (err, prices) => {
					if(err) {
						throw err;
					}

					var output = {};

					prices.forEach(function(item) {
						output[item.item] = {
							current_price: item.current_price,
						};
					});

					res.json({ success: true, items: output });
				});
			} else {
				res.json({ success: false, error: options.errors.not_premium });
			}
		} else {
			res.json({ success: false, error: options.errors.invalid_key });
		}
	});
});

router.get('/backpacktf', function(req, res) {
	var query = res.req.query;

	if (query.key === undefined) {
		res.json({ success: false, error: options.errors.missing_params });
		return;
	}
	
	// check if the key exists
	Keys.findOne({
		key: query.key
	}, (err, keys) => {
		if(err) {
			throw err;
		}

		if (keys !== null) {
			var isPremium = keys.premium;

			if(isPremium) {
				if (Math.floor(Date.now() / 1000) - lastCheck >= 120) {
					request('http://backpack.tf/api/IGetMarketPrices/v1/?key=' + options.backpacktf_key + '&appid=730', function(err, response, body) {
						if (err) {
							console.log("Error receiving backpack.tf prices");
							res.json({ success: true, items: lastResult });
							return;
						}
						
						try {
							body = JSON.parse(body);
						} catch (e) {
							console.log("Error parsing JSON from backpack.tf");
							res.json({ success: true, items: lastResult });
							return;
						}
						
						if (body.response.success) {
							res.json({ success: true, items: body.response.items });
							lastResult = body.response.items;
						} else {
							res.json({ success: true, items: lastResult });
						}
					});
				}	
			} else {
				res.json({ success: false, error: options.errors.not_premium });
			}
		} else {
			res.json({ success: false, error: options.errors.invalid_key });
		}
	});
});

// register the router
app.use('/api', router);

// start the server
app.listen(port);
console.log('Magic happens on port ' + port);
