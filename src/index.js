require('../lib/IgePrimitives');

var IgeClass = require('../lib/IgeClass'),
	IgeEventingClass = require('../lib/IgeEventingClass');

var MetricsSrv = IgeEventingClass.extend({
	classId: 'App.EventSrv',
	
	init: function () {
		var self = this;
		
		this.options = {
			port: 8000,
			version: 'v1.1'
		};
		
		this.apiRootPath = '/' + this.options.version;
		
		this.http = require('http');
		this.querystring = require('querystring');
		this.async = require('async');
		this.express = require('express');
		this.route = this.express();
		this.crypto = require('crypto');
		this.exec = require('child_process').exec;
		this.fs = require('fs');
		this.urlUtil = require('url');
		this.monge = new (require('monge').MongeManager)();
		
		// Setup the object to contain endpoint instances
		this.endPoint = {};
		
		// Setup mongodb connection
		this.monge.connect([{
			name: 'metrics', host: 'localhost', db: 'metrics'
		}], function (err) {
			if (!err) {
				// Start the server
				self.log('DB Connected, Starting Server...');
				self.startServer();
			} else {
				// Kill this process and it will be restarted by forever
				self.log('Could not connect to DB!');
				process.exit();
			}
		});
	},
	
	allowCrossDomain: function(req, res, next) {
		var self = this;
		
		req.params = req.params || {};

		// Check the origin matches the allowed list by regex
		var origin = req.headers.origin,
			match,
			domain,
			domainHost,
			domainArr = self.originDomains;

		if (origin) {
			// Check the DB for allowed domains
			// Loop the allowed domains and check for a match
			while (match === -1 && (domain = domainArr.shift())) {
				domainHost = domain.host;
				
				if (domainHost) {
					// Convert the domain to a regex
					domainHost = domainHost.replace(/\./g, "\\.");
					domainHost = domainHost.replace(/\*/g, ".*?");
					
					match = origin.search(new RegExp(domainHost));
				}
			}
			
			if (match > -1) {
				res.header('Access-Control-Allow-Origin', origin);
				res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
				res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
				
				// intercept OPTIONS method
				if ('OPTIONS' == req.method) {
					res.send(200);
				} else {
					next();
				}
			} else {
				res.header('Access-Control-Allow-Origin', 'http://www.open-metrics.com');
				res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
				res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			
				// intercept OPTIONS method
				if ('OPTIONS' == req.method) {
					res.send(200);
				} else {
					next();
				}
			}
		} else {
			// intercept OPTIONS method
			if ('OPTIONS' == req.method) {
				res.send(200);
			} else {
				next();
			}
		}
	},
	
	acceptIeXdrCrap: function (req, res, next) {
		// Force a content type header when none exists
		if (!req.headers['content-type']) {
			req.headers['content-type'] = 'application/x-www-form-urlencoded';
		}
		
		next();
	},
	
	startServer: function () {
		var self = this;
		
		// Grab a list of allowed domain origins from the DB
		self.monge.metrics.query('domain', {}, {}, function (err, domainArr) {
			if (!err && domainArr) {
				self.originDomains = domainArr;
			} else {
				// No origin domains setup
				console.log('Error, please add at least one origin domain to the domain collection.');
				process.exit();
			}
		});
		
		// Setup cross-domain security
		this.route.use(function () { self.allowCrossDomain.apply(self, arguments); });
		this.route.use(this.acceptIeXdrCrap);
		
		// Parse POST messages into query strings
		this.route.use(this.express.bodyParser());
		
		// Setup endpoint objects
		this.endPoint.action = require('./endPoint/action.js').setup(this);
		
		// Listen for connections
		this.route.listen(this.options.port);
	},
	
	md5: function (str) {
		return this.crypto.createHash('md5').update(str).digest('hex');
	},
	
	unescape: function (query, key) {
		var self = this;
		
		if (query[key]) {
			if (!query.__unescaped || !query.__unescaped[key]) {
				query.__unescaped = query.__unescaped || {};
				query.__unescaped[key] = true;
				
				query[key] = self.querystring.unescape(query[key].replace(/\+/g, '%20'));
			}
		}
		
		return query[key];
	}
});

var metricsSrv = new MetricsSrv();