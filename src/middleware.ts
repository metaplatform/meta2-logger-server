/*
 * meta2-logger-server
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

import fs = require("fs");
import path = require("path");
import BodyParser = require("body-parser");
import Pug = require("pug");
import {Request, Response, Router, static as staticMiddleware} from "express";
import jsYaml = require("js-yaml");

import {
	Logger, LoggerFacility, IMemoryTargetMessage, IMemoryTargetOptions, parseLogLevel,
	MemoryTarget, LOG_LEVEL, LOG_LEVEL_NAME_MAP_INV
} from "meta2-logger";

import {escapeHtml, formatMessage} from "./util";

/**
 * Log level map Label -> Value
 */
const logLevelMap = {
	Debug: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.DEBUG],
	Info: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.INFO],
	Notice: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.NOTICE],
	Warning: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.WARN],
	Error: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.ERROR],
	Critical: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.CRITICAL],
	Alert: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.ALERT],
	Emergency: LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.EMERGENCY]
};

/**
 * Management middleware configuration options
 */
export interface ILoggerMiddlewareOptions {

	/** Public server port - is added to OpenAPI specification */
	port?: number;

	/** If to expose UI, default true */
	exposeUi?: boolean;

	/** If to enable memory logging and provide endpoints to access them, default true */
	exposeLogs?: boolean;

	/** Memory log message count limit, default 1000 */
	logLimit?: number;

	/** Memory target log level, default LOG_LEVEL.INFO */
	logLevel?: LOG_LEVEL;

	/** Facility for endpoint logging */
	managementFacility?: LoggerFacility;

	/** If to expose OpenAPI specification for endpoints */
	exposeOpenApi?: boolean;

}

/**
 * Log endpoint filter query
 */
interface ILogFilterQuery {

	/** Log levels */
	levels: Array<LOG_LEVEL>;

	/** Facilities - empty for all */
	facilities: Array<string>;

	/** Fulltext search fields */
	search: {
		timestamp?: string;
		level?: string;
		facility?: string;
		message?: string;
		meta?: string;
	};

}

/**
 * Parse log filter query params
 *
 * @param query Query params
 */
function parseLogFilterQuery(query: any): ILogFilterQuery {

	const filter: ILogFilterQuery = {
		levels: [],
		facilities: [],
		search: {
			timestamp: null,
			level: null,
			facility: null,
			message: null,
			meta: null
		}
	};

	if (typeof query !== "object")
		return filter;

	// Parse levels
	if (query.levels) {

		if (!(query.levels instanceof Array))
			throw new Error("Query value 'levels' must be an array.");

		for (let i = 0; i < query.levels.length; i++)
			filter.levels.push( parseLogLevel( query.levels[i] ) );

	}

	// Parse facilities
	if (query.facilities) {

		if (!(query.facilities instanceof Array))
			throw new Error("Query value 'facilities' must be an array.");

		for (let i = 0; i < query.facilities.length; i++)
			filter.facilities.push(String(query.facilities[i]));

	}

	// Assign search fields
	if (query.search) {

		filter.search.timestamp = query.search["timestamp"] || null;
		filter.search.level = query.search["level"] || null;
		filter.search.facility = query.search["facility"] || null;
		filter.search.message = query.search["message"] || null;
		filter.search.meta = query.search["meta"] || null;

	}

	return filter;

}

/**
 * Return function to be used as array.filter() to filter memory log messages based on query
 *
 * @param query Log filter query
 */
function buildLogFilterFunction(query: ILogFilterQuery) {

	return (message: IMemoryTargetMessage) => {

		if (query.levels.length > 0)
			if (query.levels.indexOf( message.level ) < 0) return false;

		const _facility = message.facility || "__default__";

		if (query.facilities.length > 0)
			if (query.facilities.indexOf( _facility ) < 0) return false;

		if (query.search) {

			if (query.search.timestamp !== null)
				if (String(message.timestamp).toLowerCase().indexOf(query.search.timestamp.toLowerCase()) < 0) return false;

			if (query.search.level !== null)
				if (String(LOG_LEVEL_NAME_MAP_INV[message.level])
					.toLowerCase().indexOf(query.search.level.toLowerCase()) < 0) return false;

			if (query.search.facility !== null)
				if (String(message.facility).toLowerCase().indexOf(query.search.facility.toLowerCase()) < 0) return false;

			if (query.search.message !== null)
				if (String(message.message).toLowerCase().indexOf(query.search.message.toLowerCase()) < 0) return false;

			if (query.search.meta !== null)
				if (JSON.stringify(message.meta).toLowerCase().indexOf(query.search.meta.toLowerCase()) < 0) return false;

		}

		return true;

	};

}

/**
 * Convert message format and optionally format message content
 *
 * @param format If to format message content to HTML
 */
function logMessageMapper(format: boolean = false) {

	return (message: IMemoryTargetMessage) => {

		return {
			timestamp: message.timestamp,
			level: LOG_LEVEL_NAME_MAP_INV[message.level],
			facility: message.facility,
			message: ( format ? formatMessage(message.message) : escapeHtml(message.message) ),
			meta: message.meta
		};

	};

}

/**
 * Write eventsource event to response stream
 *
 * @param res Response object
 * @param message Log message
 * @param format If to format message content to HTML
 */
function sendMessageEvent(res: Response, message: IMemoryTargetMessage, format: boolean = false) {

	const msg = logMessageMapper(format)(message);

	res.write("data: " + JSON.stringify(msg) + "\n\n");

}

/**
 * Stored logger configuration interfaace
 */
interface IStoredLoggerConfig {
	targets: { [K: string]: LOG_LEVEL };
	facilities: { [K: string]: LOG_LEVEL };
	trace: boolean;
}

/**
 * Read logger configuration and store it into object
 *
 * @param logger Logger instance
 */
function storeLoggerConfig(logger: Logger): IStoredLoggerConfig {

	const cfg = {
		targets: {},
		facilities: {},
		trace: logger.isTraceEnabled()
	};

	const targets = logger.getAllTargets();
	const facilities = logger.getAllFacilities();

	for (const i in targets)
		cfg.targets[i] = targets[i].getLevel();

	for (const i in facilities)
		cfg.facilities[i] = facilities[i].getLevel();

	return cfg;

}

/**
 * Restores logger configuration from object
 *
 * @param logger Logger instance
 * @param config Stored configuration
 */
function restoreLoggerConfig(logger: Logger, config: IStoredLoggerConfig) {

	const targets = logger.getAllTargets();
	const facilities = logger.getAllFacilities();

	logger.enableTrace(config.trace);

	for (const i in config.targets)
		if (targets[i]) targets[i].setLevel( config.targets[i] );

	for (const i in config.facilities)
		if (facilities[i]) facilities[i].setLevel( config.facilities[i] );

}

/**
 * Logger management API middleware
 *
 * Returns express router
 *
 * @param logger Logger instance to be managed
 * @param opts Middleware configuration options
 */
export function loggerMiddleware(logger: Logger, opts: ILoggerMiddlewareOptions): Router {

	// Create router
	const router = Router();

	// Constants
	const uiPath = __dirname + "/../../ui";
	const apiSpecPath = __dirname + "/../../openapi.yml";

	// Scope vars
	let memTarget;
	let storedConfig: IStoredLoggerConfig = null;

	const storeConfig = () => {

		if (storedConfig === null)
			storedConfig = storeLoggerConfig(logger);

	};

	const restoreConfig = () => {

		if (storeConfig !== null)
			restoreLoggerConfig(logger, storedConfig);

	};

	const setTargetLevel = (name: string, level: LOG_LEVEL) => {

		storeConfig();

		const target = logger.getTarget(name);
		if (!target) throw new Error("Target '" + name + "' not found.");

		target.setLevel(level);

		if (opts.managementFacility)
			opts.managementFacility.info(
				"Log level of target '" + name + "' changed to '" + LOG_LEVEL_NAME_MAP_INV[level] + "'.");

	};

	const setFacilityLevel = (name: string, level: LOG_LEVEL) => {

		storeConfig();

		const facilities = logger.getAllFacilities();

		if (name === "__default__") {

			logger.setLevel(level);

		} else {

			if (facilities[name] === undefined)
				throw new Error("Facility '" + name + "' not found.");

			logger.facility(name).setLevel(level);

		}

		if (opts.managementFacility)
			opts.managementFacility.info(
				"Log level of facility '" + name + "' changed to '" + LOG_LEVEL_NAME_MAP_INV[level] + "'.");

	};

	const setTraceEnabled = (enabled: boolean) => {

		if (logger.isTraceEnabled() === enabled) return;

		logger.enableTrace(enabled);

		if (opts.managementFacility)
			opts.managementFacility.info(
				"Stack trace " + ( enabled ? "enabled" : "disabled" ) + ".");

	};

	// Register management endpoints
	router.get("/levels", (req: Request, res: Response) => {

		res.json(logLevelMap);

	});

	router.get("/targets", (req: Request, res: Response) => {

		const data = {};
		const targets = logger.getAllTargets();

		for (const i in targets)
			data[i] = LOG_LEVEL_NAME_MAP_INV[targets[i].getLevel()];

		res.json(data);

	});

	router.get("/targets/:target", (req: Request, res: Response) => {

		const data = {};
		const target = logger.getTarget(req.params["level"]);

		if (!target)
			return res.status(404).end("Target not found.");

		res.end(LOG_LEVEL_NAME_MAP_INV[ target.getLevel() ]);

	});

	router.post("/targets/:target/:level", (req: Request, res: Response) => {

		try {

			const level = parseLogLevel(req.params["level"]);

			setTargetLevel(req.params["target"], level);

		} catch (err) {

			return res.status(400).end("Bad request: " + String(err));

		}

		res.status(204).end();

	});

	router.get("/facilities", (req: Request, res: Response) => {

		const data = {
			__default__: LOG_LEVEL_NAME_MAP_INV[logger.getLevel()]
		};

		const facilities = logger.getAllFacilities();

		for (const i in facilities)
			data[i] = LOG_LEVEL_NAME_MAP_INV[facilities[i].getLevel()];

		res.json(data);

	});

	router.get("/facilities/:facility", (req: Request, res: Response) => {

		const facilities = logger.getAllFacilities();
		const facility = facilities[req.params["facility"]];

		if (!facility)
			return res.status(404).end("Facility not found.");

		res.end(LOG_LEVEL_NAME_MAP_INV[ facility.getLevel() ]);

	});

	router.post("/facilities/:facility/:level", (req: Request, res: Response) => {

		try {

			const level = parseLogLevel(req.params["level"]);

			setFacilityLevel(req.param["facility"], level);

		} catch (err) {

			return res.status(400).end("Bad request: " + String(err));

		}

		res.status(204).end();

	});

	router.get("/config", (req: Request, res: Response) => {

		const cfg = {
			targets: {},
			facilities: {},
			trace: logger.isTraceEnabled()
		};

		const targets = logger.getAllTargets();
		const facilities = logger.getAllFacilities();

		for (const i in targets)
			cfg.targets[i] = LOG_LEVEL_NAME_MAP_INV[targets[i].getLevel()];

		for (const i in facilities)
			cfg.facilities[i] = LOG_LEVEL_NAME_MAP_INV[facilities[i].getLevel()];

		res.json(cfg);

	});

	router.post("/config", BodyParser.urlencoded({ extended: true }), (req: Request, res: Response) => {

		// Parse config
		try {

			if (!(req.body.targets instanceof Object))
				throw new Error("Payload property 'targets' must be an object.");

			if (!(req.body.facilities instanceof Object))
				throw new Error("Payload property 'facilities' must be an object.");

			for (const i in req.body.targets)
				req.body.targets[i] = parseLogLevel( req.body.targets[i] );

			for (const i in req.body.facilities)
				req.body.facilities[i] = parseLogLevel( req.body.facilities[i] );

			for (const i in req.body.targets) {

				setTargetLevel(i, req.body.targets[i]);

			}

			for (const i in req.body.facilities) {

				setFacilityLevel(i, req.body.facilities[i]);

			}

			setTraceEnabled( req.body.trace ? true : false );

			res.status(204).end();

		} catch (err) {
			return res.status(400).end("Bad request: " + String(err));
		}

	});

	router.post("/restore", BodyParser.json(), (req: Request, res: Response) => {

		restoreConfig();
		res.status(204).end();

	});

	// Register memory log endpoints
	if (opts.exposeLogs) {

		memTarget = new MemoryTarget({
			limit: opts.logLimit || 1000,
			level: opts.logLevel || LOG_LEVEL.INFO
		});

		logger.to("__mgmtSrvLog__", memTarget);

		router.get("/log", (req: Request, res: Response) => {

			try {

				const query = parseLogFilterQuery(req.query);
				const filterFn = buildLogFilterFunction(query);

				const messages = memTarget.getMessages()
					.filter(filterFn)
					.map(logMessageMapper( req.query.format !== undefined ? true : false ));

				res.json(messages);

			} catch (err) {

				return res.status(400).end("Bad request:" + String(err));

			}

		});

		router.get("/log/stream", (req: Request, res: Response) => {

			try {

				const query = parseLogFilterQuery(req.query);
				const filterFn = buildLogFilterFunction(query);

				res.writeHead(200, "OK", {
					"Content-type": "text/event-stream"
				});

				// Send initial messages?
				if (req.query["from"] !== undefined) {

					const from = parseFloat(req.query["from"]);

					const messages = memTarget.getMessages()
						.filter(filterFn)
						.filter((msg: IMemoryTargetMessage) => { return msg.timestamp > from; });

					for (let i = 0; i < messages.length; i++)
						sendMessageEvent(res, messages[i], req.query.format !== undefined ? true : false);

				}

				// Define listener
				const msgListener = (message: IMemoryTargetMessage) => {

					if (filterFn(message))
						sendMessageEvent(res, message, req.query.format !== undefined ? true : false);

				};

				// Bind listener
				memTarget.emitter.on("message", msgListener);

				// Unbind listener on connection close
				req.connection.on("close", () => {

					memTarget.emitter.removeListener("message", msgListener);

				});

			} catch (err) {

				return res.status(400).end("Bad request:" + String(err));

			}

		});

		router.delete("/log", (req: Request, res: Response) => {

			memTarget.clearMessages();
			res.status(204).end();

		});

	}

	// Bind UI middleware?
	if (opts.exposeUi !== false) {

		router.use(staticMiddleware( uiPath + "/public" ));

		const indexTpl = Pug.compileFile(uiPath + "/index.pug");

		router.get("/", (req: Request, res: Response) => {

			const logFilter = parseLogFilterQuery(req.query);
			const filterFn = buildLogFilterFunction(logFilter);

			const _logFilter = {
				facilities: logFilter.facilities,
				levels: logFilter.levels.slice(),
				search: logFilter.search
			};

			for (let i = 0; i < _logFilter.levels.length; i++)
				_logFilter.levels[i] = LOG_LEVEL_NAME_MAP_INV[ _logFilter.levels[i] ];

			const _targets = logger.getAllTargets();
			const _facilities = logger.getAllFacilities();

			const targets = {};
			const facilities = { __default__: LOG_LEVEL_NAME_MAP_INV[logger.getLevel()] };

			for (const i in _targets) targets[i] = LOG_LEVEL_NAME_MAP_INV[_targets[i].getLevel()];
			for (const i in _facilities) facilities[i] = LOG_LEVEL_NAME_MAP_INV[_facilities[i].getLevel()];

			let messages = null;

			if (opts.exposeLogs)
				messages = memTarget.getMessages().filter(filterFn).map(logMessageMapper(true)).reverse();

			res.status(200).type("text/html").end(indexTpl({
				logLevels: logLevelMap,
				targets: targets,
				facilities: facilities,
				traceEnabled: logger.isTraceEnabled(),
				filter: _logFilter,
				messages: messages
			}));

		});

	}

	// Expose OpenAPI specs
	if (opts.exposeOpenApi !== false) {

		router.get("/openapi.json", async (req: Request, res: Response) => {

			fs.readFile(apiSpecPath, { encoding: "utf-8" }, (err, file) => {

				if (err)
					return res.status(500).end("Cannot load API specification.");

				const spec = jsYaml.safeLoad(file);

				spec["servers"] = [
					{
						/* tslint:disable-next-line */
						url: req.protocol + "://" + req.host + ( opts.port === undefined || opts.port !== 80 ? ":" + opts.port : "" ) + path.dirname(req.path)
					}
				];

				res.json(spec);

			});

		});

	}

	return router;

}
