// NPM modules
var d3 = require('d3');
var request = require('d3-request');
var _ = require('lodash');

// Local modules
var features = require('./detectFeatures')();
var fm = require('./fm');
var utils = require('./utils');

// Globals
var DEFAULT_WIDTH = 940;
var MOBILE_BREAKPOINT = 600;
var MIN_DATE = new Date(2000, 1, 1);
var MAX_DATE = new Date(2021, 1, 1);
var TICK_VALUES = [
	MIN_DATE,
	new Date(2004, 1, 1),
	new Date(2008, 1, 1),
	new Date(2012, 1, 1),
	new Date(2016, 1, 1),
	new Date(2020, 1, 1)
];
var DISPLAY_ORDER = [
	'gdp',
	'unemployment',
	'labor',
	'poverty',
	'trade',
	'stocks',
	'wages',
	'budget',
	'debt'
]

var TERMS = [{
	'president': 'Clinton',
	'start': new Date(2000, 1, 1),
	'end': new Date(2000, 12, 31)
}, {
	'president': 'Bush',
	'start': new Date(2001, 1, 1),
	'end': new Date(2008, 12, 31)
}, {
	'president': 'Obama',
	'start': new Date(2009, 1, 1),
	'end': new Date(2016, 12, 31)
}, {
	'president': 'Trump',
	'start': new Date(2017, 1, 1),
	'end': new Date(2020, 12, 31)
}];

var graphicData = null;
var isMobile = false;

/**
 * Initialize the graphic.
 *
 * Fetch data, format data, cache HTML references, etc.
 */
function init() {
	request.json('data/metrics.json', function(error, data) {
		graphicData = formatData(data);

		makeHTML();
		render();
		$(window).resize(utils.throttle(onResize, 250));
	});
}

/**
 * Format data or generate any derived variables.
 */
function formatData(data) {
	_.forIn(data, function(value, key) {
		var date_format = d3.time.format('%Y-%m-%d');

		if (value['frequency'] == 'Annual') {
			date_format = d3.time.format('%Y');
		} else if (value['frequency'] == 'Monthly') {
			date_format = d3.time.format('%Y-%m');
		}

		_.forEach(value['data'], function(d) {
			d['date'] = date_format.parse(d['period']);
		});
	});

	return data;
}

/**
 * Create DOM elements for charts.
 */
function makeHTML() {
	var container = d3.select('#charts');

	_.forEach(DISPLAY_ORDER, function(key) {
		var data = graphicData[key];

		var wrapper = container.append('div')
			.attr('id', key)
			.attr('class', 'chart-wrapper');

		wrapper.append('h2')
			.text(data['metric']);

		wrapper.append('p')
			.html(data['description']);

		wrapper.append('div')
			.attr('class', 'chart');

		wrapper.append('div')
			.attr('class', 'source')
			.html('Data: <a href="' + data['url'] + '">' + data['source'] + '</a>.&nbsp;&nbsp;&nbsp;Last updated: ' + data['last_updated']);
	});
}

/**
 * Invoke on resize. By default simply rerenders the graphic.
 */
function onResize() {
	render();
}

/**
 * Figure out the current frame size and render the graphic.
 */
function render() {
	var width = $('#interactive-content').width();

	if (width <= MOBILE_BREAKPOINT) {
		isMobile = true;
	} else {
		isMobile = false;
	}

	_.forIn(graphicData, function(value, key) {
		renderGraphic({
			container: '#' + key + ' .chart',
			width: width,
			data: graphicData[key]
		});
	});

	// Inform parent frame of new height
	fm.resize()
}

/*
 * Render the graphic.
 */
function renderGraphic(config) {
	// Configuration
	var aspectRatio = isMobile ? 2.5 / 1 : 5 / 1;

	var margins = {
		top: 10,
		right: 20,
		bottom: 30,
		left: 50
	};

	// Calculate actual chart dimensions
	var width = config['width'];
	var height = width / aspectRatio;

	var chartWidth = width - (margins['left'] + margins['right']);
	var chartHeight = height - (margins['top'] + margins['bottom']);

	// Clear existing graphic (for redraw)
	var containerElement = d3.select(config['container']);
	containerElement.html('');

	// Create the root SVG element
	var chartWrapper = containerElement.append('div')
		.attr('class', 'graphic-wrapper');

	var chartElement = chartWrapper.append('svg')
		.attr('width', chartWidth + margins['left'] + margins['right'])
		.attr('height', chartHeight + margins['top'] + margins['bottom'])
		.append('g')
		.attr('transform', 'translate(' + margins['left'] + ',' + margins['top'] + ')');

	// Create scales
	var xScale = d3.time.scale()
		.range([0, chartWidth])
		.domain([ MIN_DATE, MAX_DATE ]);

	var yScale = d3.scale.linear()
		.range([chartHeight, 0])
		.domain([ config['data']['min'], config['data']['max'] ]);

	// Shading
	_.forEach(TERMS, function(term) {
		chartElement.append('rect')
			.attr('class', 'president ' + utils.classify(term['president']))
			.attr('x', xScale(term['start']))
			.attr('width', xScale(term['end']) - xScale(term['start']))
			.attr('y', 0)
			.attr('height', chartHeight);
	})

	// Create axes
	var xAxis = d3.svg.axis()
		.scale(xScale)
		.orient('bottom')
		.tickValues(TICK_VALUES)
		.tickFormat(function(d) {
			return d.getFullYear();
		});

	var yAxis = d3.svg.axis()
		.scale(yScale)
		.orient('left');

	if (config['data']['ticks']) {
		var tickValues = config['data']['ticks'];

		if (isMobile) {
			tickValues = [
				tickValues[0],
				tickValues[2],
				tickValues[4]
			];
		}

		yAxis.tickValues(tickValues)
			.tickFormat(function(d) {
				if (d <= 0) {
					return d;
				}

				if (config['data']['show_plus']) {
					return '+' + d;
				}

				return d;
			});
	}

	// Render axes
	var xAxisElement = chartElement.append('g')
		.attr('class', 'x axis')
		.attr('transform', utils.makeTranslate(0, chartHeight))
		.call(xAxis);

	var yAxisElement = chartElement.append('g')
		.attr('class', 'y axis')
		.call(yAxis);

	// Render axes grids
	var xAxisGrid = function() {
		return xAxis;
	};

	xAxisElement.append('g')
		.attr('class', 'x grid')
		.call(xAxisGrid()
			.tickSize(-chartHeight, 0)
			.tickFormat('')
		);

	var yAxisGrid = function() {
		return yAxis;
	};

	yAxisElement.append('g')
		.attr('class', 'y grid')
		.call(yAxisGrid()
			.tickSize(-chartWidth, 0)
			.tickFormat('')
		);

	// Render lines
	var line = d3.svg.line()
		.interpolate('monotone')
		.x(function(d) {
			return xScale(d['date']);
		})
		.y(function(d) {
			return yScale(d['value']);
		});

	chartElement.append('g')
		.attr('class', 'lines')
		.append('path')
		.attr('d', function(d) {
			return line(config['data']['data']);
		});

	// Label
	var bubble = chartElement.append('rect')
		.attr('class', 'label-bubble')
		.attr('x', xScale(MIN_DATE) - 9)
		.attr('y', -10)
		.attr('height', 20);

	var label = chartElement.append('text')
		.attr('class', 'label')
		.attr('x', xScale(MIN_DATE) - 9)
		.attr('y', yScale(config['data']['ticks'][config['data']['ticks'].length - 1]))
		.attr('dy', '.32em')
		.text(config['data']['label']);

	bubble.attr('width', label[0][0].getComputedTextLength() + 10)
}

// Bind on-load handler
$(document).ready(function() {
	init();
});
