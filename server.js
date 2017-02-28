const express 		= require('express');
const handlebars 	= require('express-handlebars');
const session 		= require('express-session');
const passport 		= require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const path 			= require('path');
const bodyParser 	= require('body-parser');
const fs 			= require('fs');
const request 		= require('request');

const mongoose = require('mongoose');
	  mongoose.connect('mongodb://127.0.0.1:27017/itemdb');

var options = {},
	lastCheck = 0,
	lastResult;

const ItemPrice 	= require('./models/Prices');
const ApiKeys 		= require('./models/Keys');
const PriceHistory	= require('./models/History');

// get the options from `options.json`
try {
	options = JSON.parse(fs.readFileSync('options.json'));
} catch (err) {
	throw err;
}

const port = process.env.PORT || 8080;
const router = express.Router();

passport.serializeUser((user, done) => {
	done(null, user._json);
});

passport.deserializeUser((obj, done) => {
	done(null, obj);
});

passport.use(new SteamStrategy({
		returnURL: 'http://localhost:'+port+'/auth/steam/return',
		realm: 'http://localhost:'+port+'/',
		apiKey: 'your api key'
	}, (identifier, profile, done) => {
		return done(null, profile);
	}
));

const 	hbs = handlebars.create();
const 	app = express();
		app.engine('hbs', hbs.engine);
		app.set('views', path.join(__dirname, 'views'));
		app.set('view engine', 'hbs');
		app.use(bodyParser.urlencoded({ extended: true }));
		app.use(bodyParser.json());
		app.use(session({
			secret: 'some secret string',
			name: 'U_SESSION',
			resave: true,
			saveUninitialized: true
		}));
		app.use(passport.initialize());
		app.use(passport.session());

var key = '';
app.get('/', (req, res) => {
	if(req.user !== undefined) {
		ApiKeys.findOne({
			steamid: req.user.steamid
		}, (err, key) => {
			if(err) {
				throw err;
			} else {
				res.render('main', {
					user: req.user,
					key: key.key
				});
			}
		});
	} else {
		res.render('main', {
			user: req.user,
			key: key
		});		
	}
});

app.get(/^\/auth\/steam(\/return)?$/,
	passport.authenticate('steam', { failureRedirect: '/' }),
	(req, res) => {
		res.redirect('/');
	});

app.get('/logout', (req, res) => {
	req.logout();
	res.redirect('/');
});

router.get('/register', function(req, res) {
	if(req.user == undefined) {
		console.log('1');
		res.redirect('/');
	} else {
		ApiKeys.findOne({
			steamid: req.user.steamid
		}, (err, key) => {
			if(err) {
				throw err;
			}

			if(key !== null) {
				console.log('2');
				res.redirect('/');
			} else {
				var randomKey = (Math.random().toString(36).substring(7)).toString();

				ApiKeys.findOne({
					key: randomKey
				}, (err, key) => {
					if(err) {
						throw err;
					}

					if(key == null) {
						const apiKey = new ApiKeys({
							"key": randomKey,
							"steamid": req.user.steamid,
							"premium": true // Assuming everybody who registers gets access					
						});

						apiKey.save((err, response) => {
							if (err) {
								throw err;
							} else {
								res.redirect('/');
								console.log('added key');
							}
						});
					} else {
						console.log('3');
						res.redirect('/api/register');
					}
				});
			}
		});
	}
});

////////////////////
// On GET request //
////////////////////
router.get('/', function(req, res) {
	var query = res.req.query;

	if (query.key === undefined || query.item === undefined) {
		res.json({ success: false, error: options.errors.missing_params });
		return;
	}

	ApiKeys.findOne({
		key: query.key
	}, (err, key) => {
		if(err) {
			throw err;
		}

		if (key !== null) {
			var isPremium = key.premium;

			if (isPremium) {
				ItemPrice.findOne({
					item: query.item
				}, (err, price) => {
					if(err) {
						throw err;
					}

					if(price != null) {
						var current_price, avg_week_price, avg_month_price;

						if (price.current_price !== undefined && price.avg_week_price !== undefined && price.avg_month_price !== undefined) {
							current_price 	= price.current_price;
							avg_week_price 	= price.avg_week_price;
							avg_month_price = price.avg_month_price;
						}

						if (current_price !== undefined && avg_week_price !== undefined && avg_month_price !== undefined) {
							res.json({ success: true, current_price: current_price, avg_week_price: avg_week_price, avg_month_price: avg_month_price, lastupdate: price.lastupdate });
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
								const item = new ItemPrice({
									"item": query.item,
									"current_price": json.lowest_price.replace('$', ''),
									"avg_week_price": json.median_price.replace('$', ''),
									"avg_month_price": json.median_price.replace('$', ''),
									"lastupdate": current	
								});

								item.save((err, response) => {
									if (err) {
										throw err;
									}
								})

								const history = new PriceHistory({
									item: query.item,
									current_price: json.median_price.replace('$', ''),
									time: current
								});

								history.save((err, response) => {
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
										const item = new ItemPrice({
											"item": query.item,
											"current_price": json[query.item].toString().replace('$', ''),
											"avg_week_price": json[query.item].toString().replace('$', ''),
											"avg_month_price": json[query.item].toString().replace('$', ''),
											"lastupdate": current	
										});

										item.save((err, response) => {
											if (err) {
												throw err;
											}
										})

										const history = new PriceHistory({
											item: query.item,
											current_price: json[query.item].toString().replace('$', ''),
											time: current
										});

										history.save((err, response) => {
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
	
	ApiKeys.findOne({
		key: query.key
	}, (err, key) => {
		if(err) {
			throw err;
		}

		if (key !== null) {
			var isPremium = key.premium;

			if (isPremium) {		
				ItemPrice.find({}, (err, prices) => {
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
	
	ApiKeys.findOne({
		key: query.key
	}, (err, key) => {
		if(err) {
			throw err;
		}

		if (key !== null) {
			var isPremium = key.premium;

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
